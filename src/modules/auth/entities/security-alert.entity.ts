import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** Evento de segurança sem segredos, códigos ou tokens em claro. */
@Entity({ name: 'security_alerts' })
@Index('IDX_security_alerts_user_read_created', ['userId', 'read', 'createdAt'])
export class SecurityAlert {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  device!: string | null;

  @Column({ type: 'boolean', default: false })
  read!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
