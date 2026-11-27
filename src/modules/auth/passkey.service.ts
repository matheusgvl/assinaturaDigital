import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull, LessThanOrEqual } from 'typeorm';
import type { WebAuthnConfig } from '../../config/webauthn.config';
import { ApiException } from '../../common/http/errors/api.exception';
import type { AuthenticatedUser } from './auth.dto';
import { AuthService, type LoginResult } from './auth.service';
import { PasskeyChallenge } from './entities/passkey-challenge.entity';
import { Passkey } from './entities/passkey.entity';
import { Session } from './entities/session.entity';
import { TotpLoginTransaction } from './entities/totp-login-transaction.entity';
import { User } from './entities/user.entity';
import { LoginRateLimitService } from './login-rate-limit.service';
import { verifyPassword } from './password-hasher';
import { advancePasskeyCounter } from './passkey-counter';
import type { PasskeyVerificationDto } from './passkey.dto';

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_ACTIVE_PASSKEYS = 20;

type Context = { ip: string; userAgent?: string; origin?: string };
type Purpose = PasskeyChallenge['purpose'];

function invalidPasskey(): ApiException {
  return new ApiException('AUTH_001', HttpStatus.UNAUTHORIZED, 'Passkey verification failed');
}

function hashContext({ ip, userAgent, origin }: Context): string {
  return createHash('sha256').update(JSON.stringify([ip, userAgent, origin])).digest('hex');
}

/** Integra as cerimônias verificadas pela biblioteca com as sessões da aplicação. */
@Injectable()
export class PasskeyService {
  private readonly logger = new Logger(PasskeyService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly rateLimit: LoginRateLimitService,
  ) {}

  /** Inicia o cadastro de uma passkey após confirmar a senha da conta. */
  async registrationOptions(actor: AuthenticatedUser, password: string, context: Context) {
    const settings = this.settings(context);
    const user = await this.confirmIdentity(actor, password, context.ip);
    const repository = this.dataSource.getRepository(Passkey);
    const active = await repository.findBy({ userId: user.id, revokedAt: IsNull() });
    if (active.length >= MAX_ACTIVE_PASSKEYS) throw this.deviceLimit();
    const options = await generateRegistrationOptions({
      rpName: 'SignaPDF',
      rpID: settings.rpId,
      userID: Buffer.from(user.id, 'utf8'),
      userName: user.email,
      userDisplayName: user.name,
      attestationType: 'none',
      timeout: CHALLENGE_TTL_MS,
      excludeCredentials: active.map(({ credentialId }) => ({ id: credentialId })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const challengeId = await this.saveChallenge('registration', options.challenge, context, actor);
    return { challengeId, options };
  }

  /** Consome o desafio do cadastro e persiste somente a credencial pública. */
  async verifyRegistration(actor: AuthenticatedUser, dto: PasskeyVerificationDto, context: Context) {
    const settings = this.settings(context);
    const challenge = await this.takeChallenge('registration', dto.challengeId, context, actor);
    const result = await verifyRegistrationResponse({
      response: dto.credential as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: settings.origins,
      expectedRPID: settings.rpId,
      requireUserPresence: true,
      requireUserVerification: true,
    }).catch(() => { throw invalidPasskey(); });
    if (!result.verified) throw invalidPasskey();
    const { credential, aaguid } = result.registrationInfo;
    const transports = ['usb', 'nfc', 'ble', 'internal', 'hybrid', 'smart-card'];
    const reported = Array.isArray(credential.transports) ? credential.transports : [];
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: actor.id }, lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw invalidPasskey();
      await this.assertSession(manager, actor, user);
      const repository = manager.getRepository(Passkey);
      if (await repository.countBy({ userId: user.id, revokedAt: IsNull() }) >= MAX_ACTIVE_PASSKEYS) {
        throw this.deviceLimit();
      }
      const insert = await repository.createQueryBuilder().insert().values({
        id: randomUUID(),
        userId: user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: String(credential.counter),
        aaguid,
        name: 'Passkey',
        transports: transports.filter((transport) => (reported as string[]).includes(transport)),
      }).orIgnore().returning('id').execute();
      if (insert.raw.length !== 1) throw invalidPasskey();
    });
    return { confirmed: true as const };
  }

  /** Gera um desafio sem antecipar a identidade do titular da passkey. */
  async authenticationOptions(context: Context) {
    const settings = this.settings(context);
    await this.rateLimit.consumePasskeyAttempt('options', context.ip);
    const options = await generateAuthenticationOptions({
      rpID: settings.rpId,
      userVerification: 'required',
      timeout: CHALLENGE_TTL_MS,
    });
    const challengeId = await this.saveChallenge('authentication', options.challenge, context);
    return { challengeId, options };
  }

  /** Verifica assinatura, presença e identidade antes de avançar a autenticação. */
  async verifyAuthentication(dto: PasskeyVerificationDto, context: Context): Promise<LoginResult> {
    const settings = this.settings(context);
    await this.rateLimit.consumePasskeyAttempt('verify', context.ip);
    const challenge = await this.takeChallenge('authentication', dto.challengeId, context);
    const { id } = dto.credential;
    if (typeof id !== 'string' || id.length > 1364 || !/^[A-Za-z0-9_-]+$/.test(id)) {
      throw invalidPasskey();
    }
    const passkey = await this.dataSource.getRepository(Passkey).createQueryBuilder('passkey')
      .addSelect('passkey.publicKey')
      .where({ credentialId: id, revokedAt: IsNull() })
      .getOne();
    if (!passkey) throw invalidPasskey();
    const response = dto.credential as unknown as AuthenticationResponseJSON;
    if (response.response?.userHandle !== Buffer.from(passkey.userId).toString('base64url')) {
      throw invalidPasskey();
    }
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: settings.origins,
      expectedRPID: settings.rpId,
      requireUserVerification: true,
      credential: { id, publicKey: Uint8Array.from(passkey.publicKey), counter: Number(passkey.counter) },
    }).catch(() => {
      this.logger.warn('WebAuthn assertion rejected');
      throw invalidPasskey();
    });
    if (!verification.verified) throw invalidPasskey();

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: passkey.userId }, lock: { mode: 'pessimistic_write' },
      });
      if (!user || (user.lockedUntil && user.lockedUntil > new Date())) throw invalidPasskey();
      const advanced = await advancePasskeyCounter(
        manager, passkey, verification.authenticationInfo.newCounter, new Date(),
      );
      if (!advanced) {
        this.logger.warn('WebAuthn credential changed during verification');
        throw invalidPasskey();
      }
      return this.auth.completePrimaryAuth(manager, user, context.userAgent, context.ip);
    });
  }

  /** Lista os dispositivos ativos do titular, com uma projeção própria para a API. */
  async list(userId: string) {
    const devices = await this.dataSource.getRepository(Passkey).find({
      where: { userId, revokedAt: IsNull() },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true, transports: true },
      order: { createdAt: 'DESC', id: 'ASC' },
    });
    return devices.map(({ id, name, createdAt, lastUsedAt, transports }) => ({
      id, name, createdAt, lastUsedAt, transports,
    }));
  }

  /** Altera o nome visível ou revoga a credencial após confirmação de identidade. */
  async manage(
    actor: AuthenticatedUser,
    id: string,
    password: string,
    ip: string,
    change: { name: string } | { revoke: true },
  ): Promise<void> {
    const authenticated = await this.confirmIdentity(actor, password, ip);
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: actor.id }, lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.passwordHash !== authenticated.passwordHash) throw invalidPasskey();
      await this.assertSession(manager, actor, user);
      const result = await manager.getRepository(Passkey).update(
        { id, userId: actor.id, revokedAt: IsNull() },
        'revoke' in change ? { revokedAt: new Date() } : { name: change.name },
      );
      if (result.affected !== 1) {
        throw new ApiException('AUTH_002', HttpStatus.NOT_FOUND, 'Passkey not found');
      }
      if ('revoke' in change) {
        await manager.getRepository(TotpLoginTransaction).delete({
          userId: actor.id, consumedAt: IsNull(),
        });
      }
    });
  }

  /** Revalida a senha e a sessão para autorizar operações sobre passkeys. */
  private async confirmIdentity(actor: AuthenticatedUser, password: string, ip: string): Promise<User> {
    await this.rateLimit.consumeAttempt(actor.email, ip);
    const user = await this.auth.getUser(actor.id);
    if (!user || !(await verifyPassword(password, user.passwordHash))) throw invalidPasskey();
    await this.assertSession(this.dataSource.manager, actor, user);
    await this.rateLimit.clearAccount(actor.email);
    return user;
  }

  private async assertSession(manager: EntityManager, actor: AuthenticatedUser, user: User) {
    if (!actor.sessionId || !actor.iat) throw invalidPasskey();
    const session = await manager.getRepository(Session).findOneBy({
      id: actor.sessionId, userId: user.id, revokedAt: IsNull(),
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      Math.floor(user.passwordChangedAt.getTime() / 1000) > actor.iat ||
      (user.totpEnabled && !session.secondFactorVerifiedAt)
    ) throw invalidPasskey();
  }

  private settings(context: Context): WebAuthnConfig {
    const settings = this.config.getOrThrow<WebAuthnConfig>('app.webAuthn');
    if (!context.origin || !settings.origins.includes(context.origin)) throw invalidPasskey();
    return settings;
  }

  private async saveChallenge(purpose: Purpose, challenge: string, context: Context, actor?: AuthenticatedUser) {
    const id = randomUUID();
    const repository = this.dataSource.getRepository(PasskeyChallenge);
    await repository.delete({ expiresAt: LessThanOrEqual(new Date()) });
    await repository.insert({
      id, challenge, purpose, userId: actor?.id ?? null,
      sessionId: actor?.sessionId ?? null, contextHash: hashContext(context),
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return id;
  }

  /** Retira a linha atomicamente antes da verificação, inclusive em caso de falha. */
  private async takeChallenge(purpose: Purpose, id: string, context: Context, actor?: AuthenticatedUser) {
    const result = await this.dataSource.getRepository(PasskeyChallenge)
      .createQueryBuilder()
      .delete()
      .where('id = :id AND purpose = :purpose AND context_hash = :contextHash AND expires_at > now()', {
        id, purpose, contextHash: hashContext(context),
      })
      .andWhere('user_id IS NOT DISTINCT FROM :userId AND session_id IS NOT DISTINCT FROM :sessionId', {
        userId: actor?.id ?? null, sessionId: actor?.sessionId ?? null,
      })
      .returning('challenge')
      .execute();
    const row = (result.raw as Array<{ challenge: string }>)[0];
    if (!row) throw invalidPasskey();
    return row.challenge;
  }

  private deviceLimit(): ApiException {
    return new ApiException('AUTH_002', HttpStatus.CONFLICT, 'Passkey limit reached');
  }
}
