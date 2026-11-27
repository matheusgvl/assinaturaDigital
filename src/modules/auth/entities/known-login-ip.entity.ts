import { CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Mantém somente IPs de login conhecidos para alertar mudanças de contexto. */
@Entity({ name: 'known_login_ips' })
export class KnownLoginIp {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'inet' })
  ip!: string;

  @CreateDateColumn({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt!: Date;

  @UpdateDateColumn({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;
}
