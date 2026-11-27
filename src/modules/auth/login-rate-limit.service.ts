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

  async assertAllowed(email: string, ip: string): Promise<void> {
    const buckets: Bucket[] = [
      { scope: 'account', key: email, limit: ACCOUNT_LIMIT },
      { scope: 'ip', key: ip, limit: IP_LIMIT },
    ];
    const now = Date.now();

    for (const bucket of buckets) {
      const rows = await this.dataSource.query(
        `SELECT "attempts", "window_started", "blocked_until"
         FROM "auth_rate_limits"
         WHERE "scope" = $1 AND "key_hash" = $2`,
        [bucket.scope, keyHash(bucket.key)],
      );
      const row = rows[0] as
        | { attempts: number; window_started: Date; blocked_until: Date | null }
        | undefined;
      if (!row) continue;

      const windowStarted = new Date(row.window_started).getTime();
      const blockedUntil = row.blocked_until
        ? new Date(row.blocked_until).getTime()
        : 0;
      if (blockedUntil > now || (now - windowStarted < WINDOW_MS && row.attempts >= bucket.limit)) {
        throw tooManyAttempts();
      }
    }
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.recordBucket(manager, {
        scope: 'account',
        key: email,
        limit: ACCOUNT_LIMIT,
      });
      await this.recordBucket(manager, { scope: 'ip', key: ip, limit: IP_LIMIT });
    });
  }

  async clearAccount(email: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM "auth_rate_limits" WHERE "scope" = $1 AND "key_hash" = $2`,
      ['account', keyHash(email)],
    );
  }

  private async recordBucket(manager: EntityManager, bucket: Bucket): Promise<void> {
    const hash = keyHash(bucket.key);
    const rows = await manager.query(
      `SELECT "attempts", "window_started"
       FROM "auth_rate_limits"
       WHERE "scope" = $1 AND "key_hash" = $2
       FOR UPDATE`,
      [bucket.scope, hash],
    );
    const current = rows[0] as
      | { attempts: number; window_started: Date }
      | undefined;
    const now = new Date();
    const isExpired =
      current && now.getTime() - new Date(current.window_started).getTime() >= WINDOW_MS;
    const attempts = !current || isExpired ? 1 : current.attempts + 1;
    const windowStarted = !current || isExpired ? now : current.window_started;
    const blockedUntil = attempts >= bucket.limit ? new Date(now.getTime() + WINDOW_MS) : null;

    if (!current) {
      await manager.query(
        `INSERT INTO "auth_rate_limits"
          ("id", "scope", "key_hash", "window_started", "attempts", "blocked_until")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), bucket.scope, hash, windowStarted, attempts, blockedUntil],
      );
    } else {
      await manager.query(
        `UPDATE "auth_rate_limits"
         SET "window_started" = $3, "attempts" = $4, "blocked_until" = $5
         WHERE "scope" = $1 AND "key_hash" = $2`,
        [bucket.scope, hash, windowStarted, attempts, blockedUntil],
      );
    }
  }
}
