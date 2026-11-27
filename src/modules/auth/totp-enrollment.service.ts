import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import { User } from './entities/user.entity';
import { TotpSecret } from './entities/totp-secret.entity';
import { createOtpAuthUri, generateTotpSecret, verifyTotp } from './totp';
import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto';
import type { TotpSetupConfirmationDto } from './auth.dto';

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
  ): Promise<{ codes: string[] }> {
    await this.dataSource.transaction(async (manager) => {
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
        throw invalidTotp();
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
        throw invalidTotp();
      }

      setup.confirmedAt = now;
      setup.pendingExpiresAt = null;
      setup.setupAttempts = 0;
      await secrets.save(setup);
      await users.update({ id: userId }, { totpEnabled: true });
    });

    // A próxima issue acrescenta os códigos de recuperação nesta mesma resposta.
    return { codes: [] };
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
