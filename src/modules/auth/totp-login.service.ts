import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import { User } from './entities/user.entity';
import { TotpSecret } from './entities/totp-secret.entity';
import { TotpLoginTransaction } from './entities/totp-login-transaction.entity';
import { decryptTotpSecret } from './totp-crypto';
import { verifyTotp } from './totp';
import { TotpRecoveryService } from './totp-recovery.service';
import { TotpAlertService } from './totp-alert.service';
import type { TotpLoginVerificationDto } from './auth.dto';

const LOGIN_TRANSACTION_TTL_MS = 5 * 60 * 1000;
const MAX_LOGIN_FACTOR_ATTEMPTS = 5;

function invalidFactor(): ApiException {
  return new ApiException(
    API_ERROR_CODES.AUTHENTICATION,
    HttpStatus.UNAUTHORIZED,
    'Invalid second-factor code',
  );
}

function contextHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Coordena a transação curta de login sem emitir credenciais antes do TOTP. */
@Injectable()
export class TotpLoginService {
  constructor(
    @InjectRepository(TotpLoginTransaction)
    private readonly transactions: Repository<TotpLoginTransaction>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly recovery: TotpRecoveryService,
    private readonly alerts: TotpAlertService,
  ) {}

  /** Cria uma transação descartável e substitui tentativas pendentes do usuário. */
  async createTransaction(
    userId: string,
    ip: string,
    userAgent: string | undefined,
    manager?: EntityManager,
  ): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    const save = async (transaction: EntityManager) => {
      const repository = transaction.getRepository(TotpLoginTransaction);
      await repository.delete({ userId, consumedAt: IsNull() });
      await repository.save(
        repository.create({
          id,
          userId,
          expiresAt: new Date(now.getTime() + LOGIN_TRANSACTION_TTL_MS),
          attempts: 0,
          consumedAt: null,
          ipHash: contextHash(ip),
          userAgentHash: contextHash(userAgent ?? ''),
        }),
      );
    };
    if (manager) await save(manager);
    else await this.dataSource.transaction(save);
    return id;
  }

  /** Valida o segundo fator e consome a transação de modo atômico. */
  async verify(
    dto: TotpLoginVerificationDto,
    ip: string,
    userAgent: string | undefined,
  ): Promise<{ userId: string }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TotpLoginTransaction);
      const transaction = await repository.findOne({
        where: { id: dto.transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();
      if (
        !transaction ||
        transaction.consumedAt ||
        transaction.expiresAt <= now ||
        transaction.attempts >= MAX_LOGIN_FACTOR_ATTEMPTS ||
        transaction.ipHash !== contextHash(ip) ||
        transaction.userAgentHash !== contextHash(userAgent ?? '')
      ) {
        return null;
      }

      const user = await manager.getRepository(User).findOne({
        where: { id: transaction.userId, totpEnabled: true },
      });
      const secret = user
        ? await manager.getRepository(TotpSecret).findOne({
            where: { userId: user.id, confirmedAt: Not(IsNull()) },
          })
        : null;
      let valid = false;
      if (user && secret) {
        if (dto.recoveryCode) {
          valid = await this.recovery.consumeCodeInTransaction(
            manager,
            user.id,
            dto.recoveryCode,
          );
        } else if (dto.code) {
          try {
            valid = verifyTotp(
              decryptTotpSecret(secret, this.masterKey()),
              dto.code,
              now.getTime(),
            );
          } catch {
            valid = false;
          }
        }
      }

      if (!valid) {
        transaction.attempts += 1;
        if (transaction.attempts >= MAX_LOGIN_FACTOR_ATTEMPTS) {
          transaction.consumedAt = now;
        }
        await repository.save(transaction);
        if (user) {
          await this.alerts.create(
            manager,
            user.id,
            'invalid_totp',
            ip,
            userAgent,
          );
        }
        return null;
      }

      transaction.consumedAt = now;
      await repository.save(transaction);
      return { userId: transaction.userId };
    });
    if (!result) throw invalidFactor();
    return result;
  }

  private masterKey(): Buffer {
    const encoded = this.config.get<string>('app.pdfMasterKeyB64');
    if (!encoded) throw new Error('TOTP master key is not configured');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) {
      throw new Error('TOTP master key is not configured');
    }
    return key;
  }
}
