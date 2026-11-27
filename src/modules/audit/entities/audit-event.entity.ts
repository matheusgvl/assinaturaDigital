import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type AuditAction =
  | 'login' | 'logout' | 'auth_failure' | 'token_issued'
  | 'document_sign' | 'document_verify' | 'password_change';
export type AuditResult = 'success' | 'failure' | 'pending';

/** Guarda o fato observado e o contexto mínimo, inclusive para operações públicas. */
@Entity('audit_events')
@Index('IDX_audit_events_user_time', ['userId', 'occurredAt'])
export class AuditEvent {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512 })
  userAgent!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ type: 'varchar', length: 32 })
  action!: AuditAction;

  @Column({ type: 'varchar', length: 16 })
  result!: AuditResult;
}
