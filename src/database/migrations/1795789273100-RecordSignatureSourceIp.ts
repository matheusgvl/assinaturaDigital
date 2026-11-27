import { MigrationInterface, QueryRunner } from 'typeorm';

/** Registra o IP de novas assinaturas e mantém a ausência histórica rastreável. */
export class RecordSignatureSourceIp1795789273100 implements MigrationInterface {
  name = 'RecordSignatureSourceIp1795789273100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "document_signatures" ADD COLUMN "source_ip" inet');
    await queryRunner.query(`
      ALTER TABLE "document_signatures"
      ADD CONSTRAINT "CHK_document_signatures_sha256"
      CHECK ("original_hash" ~ '^[0-9a-f]{64}$' AND "signed_hash" ~ '^[0-9a-f]{64}$')
    `);
    await queryRunner.query(`
      ALTER TABLE "document_signatures"
      ADD CONSTRAINT "CHK_document_signatures_requires_ip"
      CHECK ("source_ip" IS NOT NULL) NOT VALID
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_signatures"
      DROP CONSTRAINT "CHK_document_signatures_requires_ip",
      DROP CONSTRAINT "CHK_document_signatures_sha256",
      DROP COLUMN "source_ip"
    `);
  }
}
