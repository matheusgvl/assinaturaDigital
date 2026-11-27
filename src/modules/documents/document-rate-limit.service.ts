import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 30;
const SCOPE = 'document_verify';

function tooManyRequests(): ApiException {
  return new ApiException(
    API_ERROR_CODES.API,
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many verification requests',
  );
}

/**
 * Controla o limite da verificacao publica por hash do IP.
 * A insercao inicial com ON CONFLICT e a leitura FOR UPDATE formam uma
 * secao critica PostgreSQL: duas requisicoes do mesmo IP nao criam buckets
 * duplicados nem ultrapassam o limite por uma condicao de corrida.
 */
@Injectable()
export class DocumentRateLimitService {
  constructor(private readonly dataSource: DataSource) {}

  /** Consome uma tentativa ou rejeita com 429 enquanto a janela estiver bloqueada. */
  async consume(ip: string): Promise<void> {
    const keyHash = createHash('sha256').update(ip || 'unknown').digest('hex');
    await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      await manager.query(
        `INSERT INTO "auth_rate_limits"
          ("id", "scope", "key_hash", "window_started", "attempts", "blocked_until")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("scope", "key_hash") DO NOTHING`,
        [randomUUID(), SCOPE, keyHash, now, 0, null],
      );
      const rows = await manager.query(
        `SELECT "attempts", "window_started", "blocked_until"
         FROM "auth_rate_limits"
         WHERE "scope" = $1 AND "key_hash" = $2
         FOR UPDATE`,
        [SCOPE, keyHash],
      );
      const bucket = rows[0] as {
        attempts: number;
        window_started: Date;
        blocked_until: Date | null;
      };
      const startedAt = new Date(bucket.window_started).getTime();
      const blockedUntil = bucket.blocked_until
        ? new Date(bucket.blocked_until).getTime()
        : 0;
      if (blockedUntil > now.getTime()) throw tooManyRequests();

      const expired = now.getTime() - startedAt >= WINDOW_MS;
      const attempts = expired ? 1 : bucket.attempts + 1;
      const windowStarted = expired ? now : bucket.window_started;
      const nextBlockedUntil = attempts >= MAX_ATTEMPTS
        ? new Date(now.getTime() + WINDOW_MS)
        : null;
      await this.updateBucket(manager, keyHash, windowStarted, attempts, nextBlockedUntil);
    });
  }

  private async updateBucket(
    manager: EntityManager,
    keyHash: string,
    windowStarted: Date,
    attempts: number,
    blockedUntil: Date | null,
  ): Promise<void> {
    await manager.query(
      `UPDATE "auth_rate_limits"
       SET "window_started" = $3, "attempts" = $4, "blocked_until" = $5
       WHERE "scope" = $1 AND "key_hash" = $2`,
      [SCOPE, keyHash, windowStarted, attempts, blockedUntil],
    );
  }
}
