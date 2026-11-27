import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { Session } from './session.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 320, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ name: 'failed_login_attempts', type: 'integer', default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'totp_enabled', type: 'boolean', default: false })
  totpEnabled!: boolean;

  @Column({ name: 'password_changed_at', type: 'timestamptz' })
  passwordChangedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => Session, (session) => session.user)
  sessions!: Session[];
}
