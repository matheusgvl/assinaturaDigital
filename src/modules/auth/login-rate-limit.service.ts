import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';

const WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LIMIT = 20;
const IP_LIMIT = 30;

type Bucket = {
  scope: 'account' | 'ip';
  key: string;
  limit: number;
};

function keyHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function tooManyAttempts(): ApiException {
  return new ApiException(
    API_ERROR_CODES.API,
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many login attempts',
  );
}

@Injectable()
export class LoginRateLimitService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Registra uma tentativa e valida os dois buckets na mesma transacao.
   * O INSERT idempotente seguido de SELECT FOR UPDATE impede que concorrencia
   * no primeiro pedido crie linhas duplicadas ou ultrapasse o limite.
   */
  async consumeAttempt(email: string, ip: string): Promise<void> {
    const buckets: Bucket[] = [
      { scope: 'account', key: email, limit: ACCOUNT_LIMIT },
      { scope: 'ip', key: ip, limit: IP_LIMIT },
    ];
    await this.dataSource.transaction(async (manager) => {
      for (const bucket of buckets) {
        await this.consumeBucket(manager, bucket);
      }
    });
  }

  async clearAccount(email: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM "auth_rate_limits" WHERE "scope" = $1 AND "key_hash" = $2`,
      ['account', keyHash(email)],
    );
  }

  private async consumeBucket(manager: EntityManager, bucket: Bucket): Promise<void> {
    const hash = keyHash(bucket.key);
    const now = new Date();
    await manager.query(
      `INSERT INTO "auth_rate_limits"
        ("id", "scope", "key_hash", "window_started", "attempts", "blocked_until")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("scope", "key_hash") DO NOTHING`,
      [randomUUID(), bucket.scope, hash, now, 0, null],
    );
    const rows = await manager.query(
      `SELECT "attempts", "window_started", "blocked_until"
       FROM "auth_rate_limits"
       WHERE "scope" = $1 AND "key_hash" = $2
       FOR UPDATE`,
      [bucket.scope, hash],
    );
    const current = rows[0] as { attempts: number; window_started: Date; blocked_until: Date | null };
    const blockedUntilMs = current.blocked_until
      ? new Date(current.blocked_until).getTime()
      : 0;
    if (blockedUntilMs > now.getTime()) throw tooManyAttempts();

    const isExpired = now.getTime() - new Date(current.window_started).getTime() >= WINDOW_MS;
    const attempts = isExpired ? 1 : current.attempts + 1;
    const windowStarted = isExpired ? now : current.window_started;
    const blockedUntil = attempts >= bucket.limit ? new Date(now.getTime() + WINDOW_MS) : null;
    await manager.query(
      `UPDATE "auth_rate_limits"
       SET "window_started" = $3, "attempts" = $4, "blocked_until" = $5
       WHERE "scope" = $1 AND "key_hash" = $2`,
      [bucket.scope, hash, windowStarted, attempts, blockedUntil],
    );
  }
}
