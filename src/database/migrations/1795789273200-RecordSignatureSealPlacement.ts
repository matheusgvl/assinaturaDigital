import { MigrationInterface, QueryRunner } from 'typeorm';

/** Registra a posição visual aplicada a novas assinaturas, inclusive páginas rotacionadas. */
export class RecordSignatureSealPlacement1795789273200 implements MigrationInterface {
  name = 'RecordSignatureSealPlacement1795789273200';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_signatures"
      ADD COLUMN "seal_page" integer,
      ADD COLUMN "seal_x" double precision,
      ADD COLUMN "seal_y" double precision,
      ADD CONSTRAINT "CHK_document_signatures_seal_placement"
      CHECK (
        "seal_page" IS NOT NULL AND "seal_page" BETWEEN 1 AND 1000
        AND "seal_x" IS NOT NULL AND "seal_x" >= 0 AND "seal_x" < 'Infinity'::float8
        AND "seal_y" IS NOT NULL AND "seal_y" >= 0 AND "seal_y" < 'Infinity'::float8
      ) NOT VALID
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_signatures"
      DROP CONSTRAINT "CHK_document_signatures_seal_placement",
      DROP COLUMN "seal_page",
      DROP COLUMN "seal_x",
      DROP COLUMN "seal_y"
    `);
  }
}
