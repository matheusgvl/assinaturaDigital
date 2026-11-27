import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Registra tokens de acesso explicitamente revogados antes da expiração. */
@Entity({ name: 'access_token_denylist' })
export class AccessTokenDenylist {
  @PrimaryColumn({ type: 'uuid' })
  jti!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
