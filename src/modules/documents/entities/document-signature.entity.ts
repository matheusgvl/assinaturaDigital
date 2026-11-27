import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'document_signatures' })
export class DocumentSignature {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'signed_hash', type: 'char', length: 64, unique: true })
  signedHash!: string;

  @Column({ name: 'original_hash', type: 'char', length: 64 })
  originalHash!: string;

  @Column({ name: 'signer_name', type: 'varchar', length: 120 })
  signerName!: string;

  @Column({ name: 'signed_at', type: 'timestamptz' })
  signedAt!: Date;

  /** Ausente apenas em registros criados antes da migration. */
  @Column({ name: 'source_ip', type: 'inet', nullable: true })
  sourceIp!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
