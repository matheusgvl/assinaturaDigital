import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TotpRecoveryCode } from './entities/totp-recovery-code.entity';

const RECOVERY_CODE_BYTES = 10;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_PATTERN = /^[0-9a-f]{20}$/i;

/** Remove separadores e uniformiza o valor recebido sem registrar o código. */
export function normalizeRecoveryCode(value: string): string | undefined {
  const normalized = value.replaceAll('-', '').trim().toUpperCase();
  return RECOVERY_CODE_PATTERN.test(normalized) ? normalized : undefined;
}

/** Produz o hash persistido; o código em claro permanece somente na resposta única. */
export function hashRecoveryCode(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Gera um código legível em blocos de quatro caracteres hexadecimais. */
export function generateRecoveryCode(): string {
  const raw = randomBytes(RECOVERY_CODE_BYTES).toString('hex').toUpperCase();
  return raw.match(/.{1,4}/g)!.join('-');
}

/** Gera os códigos exibidos uma única vez durante a confirmação do TOTP. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
}

@Injectable()
export class TotpRecoveryService {
  constructor(
    @InjectRepository(TotpRecoveryCode)
    private readonly codes: Repository<TotpRecoveryCode>,
    private readonly dataSource: DataSource,
  ) {}

  /** Substitui códigos antigos dentro da mesma transação que ativa o TOTP. */
  async replaceCodes(manager: EntityManager, userId: string): Promise<string[]> {
    const plainCodes = generateRecoveryCodes();
    const repository = manager.getRepository(TotpRecoveryCode);
    await repository.delete({ userId });
    await repository.save(
      plainCodes.map((code) =>
        repository.create({
          id: randomUUID(),
          userId,
          codeHash: hashRecoveryCode(normalizeRecoveryCode(code)!),
          usedAt: null,
        }),
      ),
    );
    return plainCodes;
  }

  /** Consome um código com bloqueio pessimista, permitindo apenas um uso concorrente. */
  async consumeCode(userId: string, value: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(value);
    if (!normalized) return false;

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TotpRecoveryCode);
      const code = await repository.findOne({
        where: {
          userId,
          codeHash: hashRecoveryCode(normalized),
          usedAt: IsNull(),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!code) return false;
      code.usedAt = new Date();
      await repository.save(code);
      return true;
    });
  }

  /** Variante transacional para o login, que compartilha o lock da verificação. */
  async consumeCodeInTransaction(
    manager: EntityManager,
    userId: string,
    value: string,
  ): Promise<boolean> {
    const normalized = normalizeRecoveryCode(value);
    if (!normalized) return false;
    const code = await manager.getRepository(TotpRecoveryCode).findOne({
      where: {
        userId,
        codeHash: hashRecoveryCode(normalized),
        usedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!code) return false;
    code.usedAt = new Date();
    await manager.getRepository(TotpRecoveryCode).save(code);
    return true;
  }

  /** Consulta apenas a quantidade, nunca os valores dos códigos. */
  async countAvailable(userId: string): Promise<number> {
    return this.codes.count({ where: { userId, usedAt: IsNull() } });
  }
}
