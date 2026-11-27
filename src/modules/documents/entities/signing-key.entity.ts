import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'signing_keys' })
export class SigningKey {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @Column({ name: 'encrypted_p12', type: 'bytea', select: false })
  encryptedP12!: Buffer;

  @Column({ name: 'iv', type: 'bytea', select: false })
  iv!: Buffer;

  @Column({ name: 'auth_tag', type: 'bytea', select: false })
  authTag!: Buffer;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
