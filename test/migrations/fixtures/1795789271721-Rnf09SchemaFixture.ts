import { MigrationInterface, QueryRunner } from 'typeorm';

export class Rnf09SchemaFixture1795789271721 implements MigrationInterface {
  public readonly name = 'Rnf09SchemaFixture1795789271721';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rnf09_migration_fixture" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "marker" character varying(64) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CHK_rnf09_migration_fixture_marker"
          CHECK ("marker" = 'rnf09')
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "rnf09_migration_fixture"',
    );
  }
}
