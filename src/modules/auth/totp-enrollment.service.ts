import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import { User } from './entities/user.entity';
import { TotpSecret } from './entities/totp-secret.entity';
import { createOtpAuthUri, generateTotpSecret, verifyTotp } from './totp';
import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto';
import type { TotpDisableDto, TotpSetupConfirmationDto } from './auth.dto';
import { TotpRecoveryService } from './totp-recovery.service';
import { TotpAlertService } from './totp-alert.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { verifyPassword } from './password-hasher';
import { TotpRecoveryCode } from './entities/totp-recovery-code.entity';
import { TotpLoginTransaction } from './entities/totp-login-transaction.entity';
import { Session } from './entities/session.entity';

const SETUP_TTL_MS = 10 * 60 * 1000;
const MAX_SETUP_ATTEMPTS = 5;

function invalidTotp(): ApiException {
  return new ApiException(
    API_ERROR_CODES.AUTHENTICATION,
    HttpStatus.UNAUTHORIZED,
    'Invalid second-factor code',
  );
}

function configurationError(): ApiException {
  return new ApiException(
    API_ERROR_CODES.AUTHORIZATION,
    HttpStatus.INTERNAL_SERVER_ERROR,
    'Two-factor authentication is not configured',
  );
}

/** Coordena a configuração pendente do segundo fator sem expor o segredo. */
@Injectable()
export class TotpEnrollmentService {
  constructor(
    @InjectRepository(TotpSecret)
    private readonly secrets: Repository<TotpSecret>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly recovery: TotpRecoveryService,
    private readonly alerts: TotpAlertService,
    private readonly rateLimit: LoginRateLimitService,
  ) {}

  /** Cria um segredo temporário e retorna somente a imagem QR de enrollment. */
  async startSetup(
    userId: string,
    account: string,
  ): Promise<{ setupId: string; qrCodeDataUrl: string; expiresAt: string }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw invalidTotp();
    if (user.totpEnabled) {
      throw new ApiException(
        API_ERROR_CODES.AUTHORIZATION,
        HttpStatus.CONFLICT,
        'Two-factor authentication is already enabled',
      );
    }

    const secret = generateTotpSecret();
    const expiresAt = new Date(Date.now() + SETUP_TTL_MS);
    const encrypted = encryptTotpSecret(secret, this.masterKey());
    const setupId = randomUUID();
    const uri = createOtpAuthUri(secret, account);
    const qrCodeDataUrl = await QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 1,
    });

    await this.secrets.delete({ userId });
    await this.secrets.save(
      this.secrets.create({
        id: setupId,
        userId,
        ...encrypted,
        pendingExpiresAt: expiresAt,
        setupAttempts: 0,
        confirmedAt: null,
      }),
    );

    return { setupId, qrCodeDataUrl, expiresAt: expiresAt.toISOString() };
  }

  /** Confirma o QR com um código válido antes de ativar `totp_enabled`. */
  async confirmSetup(
    userId: string,
    dto: TotpSetupConfirmationDto,
    context?: { ip: string; userAgent?: string },
  ): Promise<{ codes: string[] }> {
    let recoveryCodes: string[] = [];
    const confirmed = await this.dataSource.transaction(async (manager) => {
      const secrets = manager.getRepository(TotpSecret);
      const users = manager.getRepository(User);
      const setup = await secrets.findOne({
        where: { id: dto.setupId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();
      if (
        !setup ||
        setup.confirmedAt ||
        !setup.pendingExpiresAt ||
        setup.pendingExpiresAt <= now
      ) {
        return false;
      }

      let valid = false;
      try {
        valid = verifyTotp(
          decryptTotpSecret(setup, this.masterKey()),
          dto.code,
          now.getTime(),
        );
      } catch {
        valid = false;
      }

      if (!valid) {
        setup.setupAttempts += 1;
        if (setup.setupAttempts >= MAX_SETUP_ATTEMPTS) {
          setup.pendingExpiresAt = now;
        }
        await secrets.save(setup);
        return false;
      }

      setup.confirmedAt = now;
      setup.pendingExpiresAt = null;
      setup.setupAttempts = 0;
      await secrets.save(setup);
      await users.update({ id: userId }, { totpEnabled: true });
      recoveryCodes = await this.recovery.replaceCodes(manager, userId);
      await this.alerts.create(manager, userId, 'totp_enabled', context?.ip, context?.userAgent);
      return true;
    });

    if (!confirmed) throw invalidTotp();
    return { codes: recoveryCodes };
  }

  /** Remove TOTP somente após revalidar senha e código atual e revoga sessões. */
  async disable(
    userId: string,
    dto: TotpDisableDto,
    context: { ip: string; userAgent?: string },
  ): Promise<void> {
    const candidate = await this.users.findOne({ where: { id: userId } });
    if (!candidate) throw invalidTotp();
    await this.rateLimit.consumeAttempt(candidate.email, context.ip);
    const disabled = await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      const secret = user ? await manager.getRepository(TotpSecret).findOne({
        where: { userId, confirmedAt: Not(IsNull()) }, lock: { mode: 'pessimistic_write' },
      }) : null;
      let valid = Boolean(user?.totpEnabled && secret && await verifyPassword(dto.currentPassword, user.passwordHash));
      if (valid && secret) {
        try {
          valid = verifyTotp(decryptTotpSecret(secret, this.masterKey()), dto.code, Date.now());
        } catch {
          valid = false;
        }
      }
      if (!valid || !user) return false;
      await users.update({ id: userId }, { totpEnabled: false });
      await manager.getRepository(TotpSecret).delete({ userId });
      await manager.getRepository(TotpRecoveryCode).delete({ userId });
      await manager.getRepository(TotpLoginTransaction).delete({ userId });
      await manager.getRepository(Session).update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
      await this.alerts.create(manager, userId, 'totp_disabled', context.ip, context.userAgent);
      return true;
    });
    if (!disabled) throw invalidTotp();
    await this.rateLimit.clearAccount(candidate.email);
  }

  private masterKey(): Buffer {
    const encoded = this.config.get<string>('app.pdfMasterKeyB64');
    if (!encoded) throw configurationError();
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) {
      throw configurationError();
    }
    return key;
  }
}
