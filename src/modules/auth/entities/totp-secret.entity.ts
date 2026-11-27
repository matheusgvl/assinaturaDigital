import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Guarda apenas o segredo TOTP cifrado e o estado da configuração pendente. */
@Entity({ name: 'totp_secrets' })
export class TotpSecret {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @Column({ name: 'encrypted_secret', type: 'bytea' })
  encryptedSecret!: Buffer;

  @Column({ type: 'bytea' })
  iv!: Buffer;

  @Column({ name: 'auth_tag', type: 'bytea' })
  authTag!: Buffer;

  @Column({ name: 'pending_expires_at', type: 'timestamptz', nullable: true })
  pendingExpiresAt!: Date | null;

  @Column({ name: 'setup_attempts', type: 'integer', default: 0 })
  setupAttempts!: number;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
