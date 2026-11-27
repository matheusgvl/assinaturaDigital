import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** Guarda a transação curta entre senha válida e emissão da sessão autenticada. */
@Entity({ name: 'totp_login_transactions' })
@Index('IDX_totp_login_transactions_user_expires', ['userId', 'expiresAt'])
export class TotpLoginTransaction {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({ name: 'ip_hash', type: 'char', length: 64 })
  ipHash!: string;

  @Column({ name: 'user_agent_hash', type: 'char', length: 64 })
  userAgentHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
