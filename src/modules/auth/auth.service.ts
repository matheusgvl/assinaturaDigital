import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import {
  DataSource,
  EntityManager,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import { hashPassword, verifyPassword } from './password-hasher';
import { validatePasswordPolicy } from './password-policy';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  TotpLoginVerificationDto,
  type AuthenticatedUser,
} from './auth.dto';
import { AuthTokenService } from './auth-token.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AccessTokenDenylist } from './entities/access-token-denylist.entity';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';
import { TotpLoginService } from './totp-login.service';
import { SigningKeyService } from '../documents/signing-key.service';
import { TotpAlertService } from './totp-alert.service';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';
// O refresh token permanece utilizavel por no maximo sete dias, conforme REQ-19.
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const GENERIC_AUTH_MESSAGE = 'Invalid credentials';
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$WhqvQoik9/MM15Vt/YFRZA$AEuc3USo+mn1vN2yy4H0otBgilQBF7Ho++UAwOvpsNc';

export type LoginResult =
  | {
      accessToken: string;
      refreshToken: string;
      user: AuthenticatedUser;
    }
  | { requiresSecondFactor: true; transactionId: string };

function authError(): ApiException {
  return new ApiException(
    API_ERROR_CODES.AUTHENTICATION,
    HttpStatus.UNAUTHORIZED,
    GENERIC_AUTH_MESSAGE,
  );
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  /** Cria o usuário e registra o instante a partir do qual seus tokens são válidos. */
  async register(
    dto: RegisterDto,
  ): Promise<Pick<User, 'id' | 'name' | 'email'>> {
    validatePasswordPolicy(dto.password);
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ApiException(
        API_ERROR_CODES.AUTHENTICATION,
        HttpStatus.CONFLICT,
        'Unable to create account',
      );
    }

    const user = this.users.create({
      id: randomUUID(),
      name: dto.name.trim(),
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
      failedLoginAttempts: 0,
      lockedUntil: null,
      totpEnabled: false,
      passwordChangedAt: new Date(),
    });

    const encrypted = await this.signingKeys.prepare(user.name);
    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const created = await manager.getRepository(User).save(user);
        await this.signingKeys.provision(manager, created.id, encrypted);
        return created;
      });
      return { id: saved.id, name: saved.name, email: saved.email };
    } catch (error) {
      if (!(error instanceof QueryFailedError) || (error.driverError as { code?: string }).code !== '23505') {
        throw error;
      }
      throw new ApiException(
        API_ERROR_CODES.AUTHENTICATION,
        HttpStatus.CONFLICT,
        'Unable to create account',
      );
    }
  }

  /** Valida credenciais, aplica rate limit e cria uma sessão com refresh opaco. */
  async login(
    dto: LoginDto,
    userAgent: string | undefined,
    ip: string,
  ): Promise<LoginResult> {
    await this.rateLimit.consumeAttempt(dto.email, ip);
    const user = await this.users.findOne({ where: { email: dto.email } });
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await verifyPassword(dto.password, passwordHash);
    const now = new Date();

    if (
      !user ||
      (user.lockedUntil && user.lockedUntil > now) ||
      !passwordMatches
    ) {
      if (user && (!user.lockedUntil || user.lockedUntil <= now)) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
          user.lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
        }
        await this.users.update(
          { id: user.id },
          { failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil },
        );
      }
      throw authError();
    }

    await this.users.update({ id: user.id }, { failedLoginAttempts: 0, lockedUntil: null });
    await this.rateLimit.clearAccount(dto.email);

    return this.dataSource.transaction(async (manager) => {
      const current = await manager.getRepository(User).findOne({
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current || current.passwordHash !== passwordHash) throw authError();
      return this.completePrimaryAuth(manager, current, userAgent, ip);
    });
  }

  /** Aplica a mesma exigência de TOTP após senha ou passkey já validada. */
  async completePrimaryAuth(
    manager: EntityManager,
    user: User,
    userAgent: string | undefined,
    ip: string,
  ): Promise<LoginResult> {
    if (user.totpEnabled) {
      return {
        requiresSecondFactor: true,
        transactionId: await this.totpLogin.createTransaction(
          user.id,
          ip,
          userAgent,
          manager,
        ),
      };
    }

    return this.issueSession(user, userAgent, ip, new Date(), false, manager);
  }

  /** Emite a sessão somente após a transação de segundo fator ser consumida. */
  async verifySecondFactor(
    dto: TotpLoginVerificationDto,
    userAgent: string | undefined,
    ip: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
    const { userId } = await this.totpLogin.verify(dto, ip, userAgent);
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId }, lock: { mode: 'pessimistic_write' },
      });
      if (!user || !user.totpEnabled) throw authError();
      return this.issueSession(user, userAgent, ip, new Date(), true, manager);
    });
  }

  private async issueSession(
    user: User,
    userAgent: string | undefined,
    ip: string,
    now: Date,
    secondFactorVerified = false,
    manager?: EntityManager,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {

    const authenticatedUser = { id: user.id, email: user.email };
    const refreshToken = randomBytes(32).toString('base64url');
    const sessionId = randomUUID();
    const issue = async (transaction: EntityManager) => {
      const sessions = transaction.getRepository(Session);
      await this.recordLoginIp(transaction, user.id, ip, userAgent);
      await sessions.save(
        sessions.create({
          id: sessionId,
          userId: user.id,
          familyId: randomUUID(),
          refreshTokenHash: hashRefreshToken(refreshToken),
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
          revokedAt: null,
          secondFactorVerifiedAt: secondFactorVerified ? now : null,
          userAgent: userAgent?.slice(0, 512) ?? null,
        }),
      );
      return this.tokens.issueAccessToken(authenticatedUser, {
        sessionId,
        ip,
        userAgent,
      });
    };
    const issued = manager ? await issue(manager) : await this.dataSource.transaction(issue);

    return {
      accessToken: issued,
      refreshToken,
      user: authenticatedUser,
    };
  }

  /** Faz a rotação de uso único sob lock pessimista e preserva a família. */
  async refresh(
    refreshToken: string,
    userAgent: string | undefined,
    ip: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const now = new Date();
    const result = await this.dataSource.transaction(async (manager) => {
      const sessions = manager.getRepository(Session);
      const session = await sessions
        .createQueryBuilder('session')
        .innerJoinAndSelect('session.user', 'user')
        .where('session.refreshTokenHash = :refreshTokenHash', {
          refreshTokenHash: hashRefreshToken(refreshToken),
        })
        .setLock('pessimistic_write')
        .getOne();
      if (!session || !session.user || session.expiresAt <= now) return null;

      if (session.user.totpEnabled && !session.secondFactorVerifiedAt) {
        session.revokedAt = now;
        await sessions.save(session);
        return null;
      }

      if (session.revokedAt) {
        // Reuso de um token rotacionado invalida toda a familia, inclusive a
        // sessao que teria sido emitida pelo primeiro pedido concorrente.
        await sessions.update(
          {
            userId: session.user.id,
            familyId: session.familyId,
            revokedAt: IsNull(),
          },
          { revokedAt: now },
        );
        return { reuseDetected: true as const };
      }

      session.revokedAt = now;
      await sessions.save(session);
      const rotatedToken = randomBytes(32).toString('base64url');
      const rotatedSessionId = randomUUID();
      await sessions.save(
        sessions.create({
          id: rotatedSessionId,
          userId: session.user.id,
          familyId: session.familyId,
          refreshTokenHash: hashRefreshToken(rotatedToken),
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
          revokedAt: null,
          secondFactorVerifiedAt: session.secondFactorVerifiedAt,
          userAgent: userAgent?.slice(0, 512) ?? null,
        }),
      );

      return {
        reuseDetected: false as const,
        accessToken: this.tokens.issueAccessToken(
          { id: session.user.id, email: session.user.email },
          { sessionId: rotatedSessionId, ip, userAgent },
        ),
        refreshToken: rotatedToken,
      };
    });

    if (!result || result.reuseDetected) throw authError();
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  /** Coloca o access token ainda válido na denylist sem persistir seu conteúdo. */
  async revokeAccessToken(token: string | undefined): Promise<void> {
    if (!token) return;
    try {
      const claims = this.tokens.verifyAccessToken(token);
      if (!claims.jti || !claims.exp) return;
      const now = new Date();
      await this.denylist.delete({ expiresAt: LessThanOrEqual(now) });
      await this.denylist
        .createQueryBuilder()
        .insert()
        .values({
          jti: claims.jti,
          userId: claims.id,
          expiresAt: new Date(claims.exp * 1000),
        })
        .orIgnore()
        .execute();
    } catch {
      // Logout e deliberadamente idempotente: um token ausente ou ja expirado
      // nao deve revelar detalhes nem impedir a limpeza dos cookies.
    }
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const session = await this.sessions.findOne({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    });
    if (session && !session.revokedAt) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
    }
  }

  /** Retorna somente sessões ativas e marca a sessão identificada pelo JWT. */
  async listActiveSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.sessions.find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    return sessions.map((session) => ({
      id: session.id,
      current: session.id === currentSessionId,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessions.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new ApiException(
        API_ERROR_CODES.AUTHENTICATION,
        HttpStatus.NOT_FOUND,
        'Session not found',
      );
    }
    if (!session.revokedAt) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
    }
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.sessions.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Atualiza a senha e revoga todas as sessões em uma única transação. */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    validatePasswordPolicy(dto.newPassword);
    await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const sessions = manager.getRepository(Session);
      const user = await users.findOne({ where: { id: userId } });
      if (
        !user ||
        !(await verifyPassword(dto.currentPassword, user.passwordHash))
      ) {
        throw authError();
      }
      user.passwordHash = await hashPassword(dto.newPassword);
      user.passwordChangedAt = new Date();
      await users.save(user);
      await sessions.update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await this.alerts.create(manager, userId, 'password_changed', ip, userAgent);
    });
  }

  /** Registra um alerta somente a partir do segundo IP distinto da conta. */
  private async recordLoginIp(
    manager: EntityManager,
    userId: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<void> {
    if (!isIP(ip)) return;
    const existing = await manager.query(
      'SELECT 1 FROM known_login_ips WHERE user_id = $1 AND ip = $2', [userId, ip],
    );
    await manager.query(`
      INSERT INTO known_login_ips (user_id, ip) VALUES ($1, $2)
      ON CONFLICT (user_id, ip) DO UPDATE SET last_seen_at = now()
    `, [userId, ip]);
    if (existing.length !== 0) return;
    const [{ count }] = await manager.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM known_login_ips WHERE user_id = $1', [userId],
    );
    if (Number(count) > 1) {
      await this.alerts.create(manager, userId, 'new_ip', ip, userAgent);
    }
  }

  getUser(userId: string): Promise<User | null> {
    return this.users.findOne({ where: { id: userId } });
  }

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
    @InjectRepository(AccessTokenDenylist)
    private readonly denylist: Repository<AccessTokenDenylist>,
    private readonly tokens: AuthTokenService,
    private readonly rateLimit: LoginRateLimitService,
    private readonly dataSource: DataSource,
    private readonly totpLogin: TotpLoginService,
    private readonly signingKeys: SigningKeyService,
    private readonly alerts: TotpAlertService,
  ) {}
}
