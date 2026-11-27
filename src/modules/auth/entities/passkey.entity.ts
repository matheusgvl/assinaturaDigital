import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** Representa uma credencial pública vinculada a um único titular. */
@Entity('webauthn_credentials')
@Index('IDX_webauthn_credentials_user_id', ['userId'])
export class Passkey {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'credential_id', type: 'varchar', length: 1364, unique: true })
  credentialId!: string;

  @Column({ name: 'public_key', type: 'bytea', select: false })
  publicKey!: Buffer;

  @Column('bigint')
  counter!: string;

  @Column('uuid')
  aaguid!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', array: true })
  transports!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
