import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** Armazena somente o hash de cada código de recuperação e o instante de consumo. */
@Entity({ name: 'totp_recovery_codes' })
@Index('IDX_totp_recovery_codes_user_used', ['userId', 'usedAt'])
export class TotpRecoveryCode {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'code_hash', type: 'char', length: 64 })
  codeHash!: string;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
