import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MarkSecurityAlertsReadDto } from './auth.dto';
import { SecurityAlert } from './entities/security-alert.entity';

export const SECURITY_ALERT_TYPES = [
  'new_ip',
  'password_changed',
  'totp_enabled',
  'totp_disabled',
  'invalid_totp',
] as const;
export type SecurityAlertType = (typeof SECURITY_ALERT_TYPES)[number];

/** Persiste e apresenta eventos de segurança sem expor dados de autenticação. */
@Injectable()
export class TotpAlertService {
  constructor(
    @InjectRepository(SecurityAlert)
    private readonly alerts: Repository<SecurityAlert>,
  ) {}

  /** Registra uma tentativa inválida sem aceitar código TOTP como campo persistido. */
  async create(
    manager: EntityManager,
    userId: string,
    type: SecurityAlertType,
    ip: string | undefined,
    device: string | undefined,
  ): Promise<void> {
    const repository = manager.getRepository(SecurityAlert);
    await repository.save(
      repository.create({
        id: randomUUID(),
        userId,
        type,
        ip: ip?.slice(0, 64) ?? null,
        device: device?.slice(0, 256) ?? null,
        read: false,
      }),
    );
  }

  /** Retorna somente os campos necessários à tela de segurança do próprio usuário. */
  async list(userId: string): Promise<SecurityAlert[]> {
    return this.alerts.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: ['id', 'type', 'ip', 'device', 'read', 'createdAt'],
    });
  }

  /** Marca IDs pertencentes ao usuário atual, ignorando IDs de outras contas. */
  async markRead(
    userId: string,
    dto: MarkSecurityAlertsReadDto,
  ): Promise<void> {
    await this.alerts.update(
      dto.ids.map((id) => ({ id, userId })),
      { read: true },
    );
  }

}
