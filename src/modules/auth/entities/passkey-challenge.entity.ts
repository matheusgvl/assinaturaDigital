import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Desafio efêmero compartilhado entre instâncias, com vínculo à cerimônia. */
@Entity('webauthn_challenges')
@Index('IDX_webauthn_challenges_expires_at', ['expiresAt'])
export class PasskeyChallenge {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 48 })
  challenge!: string;

  @Column({ type: 'varchar', length: 14 })
  purpose!: 'registration' | 'authentication';

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId!: string | null;

  @Column({ name: 'context_hash', type: 'char', length: 64 })
  contextHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
