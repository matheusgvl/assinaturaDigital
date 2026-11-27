import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  DataSource,
  IsNull,
  LessThanOrEqual,
  MoreThan,
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
  type AuthenticatedUser,
} from './auth.dto';
import { AuthTokenService } from './auth-token.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AccessTokenDenylist } from './entities/access-token-denylist.entity';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';
// O refresh token permanece utilizavel por no maximo sete dias, conforme REQ-19.
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const GENERIC_AUTH_MESSAGE = 'Invalid credentials';
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$WhqvQoik9/MM15Vt/YFRZA$AEuc3USo+mn1vN2yy4H0otBgilQBF7Ho++UAwOvpsNc';

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

    try {
      const saved = await this.users.save(user);
      return { id: saved.id, name: saved.name, email: saved.email };
    } catch {
      throw new ApiException(
        API_ERROR_CODES.AUTHENTICATION,
        HttpStatus.CONFLICT,
        'Unable to create account',
      );
    }
  }

  async login(
    dto: LoginDto,
    userAgent: string | undefined,
    ip: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }> {
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
        await this.users.save(user);
      }
      throw authError();
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.users.save(user);
    await this.rateLimit.clearAccount(dto.email);

    // A future TOTP transaction must complete before an access token is
    // created. Keeping this guard here prevents a partially enabled account
    // from bypassing the second factor.
    if (user.totpEnabled) {
      throw new ApiException(
        API_ERROR_CODES.AUTHORIZATION,
        HttpStatus.FORBIDDEN,
        'Additional verification required',
      );
    }

    const authenticatedUser = { id: user.id, email: user.email };
    const refreshToken = randomBytes(32).toString('base64url');
    const sessionId = randomUUID();
    const issued = await this.dataSource.transaction(async (manager) => {
      const sessions = manager.getRepository(Session);
      await sessions.save(
        sessions.create({
          id: sessionId,
          userId: user.id,
          familyId: randomUUID(),
          refreshTokenHash: hashRefreshToken(refreshToken),
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
          revokedAt: null,
          userAgent: userAgent?.slice(0, 512) ?? null,
        }),
      );
      return this.tokens.issueAccessToken(authenticatedUser, {
        sessionId,
        ip,
        userAgent,
      });
    });

    return {
      accessToken: issued,
      refreshToken,
      user: authenticatedUser,
    };
  }

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

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
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
    });
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
  ) {}
}
