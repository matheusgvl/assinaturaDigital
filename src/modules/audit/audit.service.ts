import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { AuditEvent, type AuditAction, type AuditResult } from './entities/audit-event.entity';

export type AuditedRequest = Request & {
  user?: { id: string };
  auditUserId?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly data: DataSource) {}

  /** Insere apenas metadados fixos. O corpo e as credenciais ficam fora do registro. */
  async record(
    request: AuditedRequest,
    events: Array<{ action: AuditAction; result: AuditResult }>,
    responseUserId?: string,
  ): Promise<void> {
    const ip = request.ip ?? request.socket.remoteAddress;
    const actor = request.user?.id ?? request.auditUserId ?? responseUserId;
    const userId = actor && isUUID(actor) ? actor : null;
    const userAgent = Array.from(request.get('User-Agent') ?? '')
      .filter((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127)
      .slice(0, 512).join('');
    const requestId = randomUUID();
    await this.data.createQueryBuilder().insert().into(AuditEvent).values(
      events.map(({ action, result }) => ({
        id: randomUUID(), userId, ip: ip && isIP(ip) ? ip : null,
        userAgent, requestId, action, result,
      })),
    ).updateEntity(false).execute();
  }
}
