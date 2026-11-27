import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthRateLimits1795789272100 implements MigrationInterface {
  name = 'CreateAuthRateLimits1795789272100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_rate_limits" (
        "id" uuid NOT NULL,
        "scope" character varying(16) NOT NULL,
        "key_hash" character(64) NOT NULL,
        "window_started" TIMESTAMP WITH TIME ZONE NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "blocked_until" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_auth_rate_limits_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_rate_limits_scope_key" UNIQUE ("scope", "key_hash")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_rate_limits"`);
  }
}
