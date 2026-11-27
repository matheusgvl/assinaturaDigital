import { MigrationInterface, QueryRunner } from 'typeorm';

/** Acrescenta os metadados necessários para invalidar tokens e famílias de sessão. */
export class CreateAccessTokenSecurity1795789272300 implements MigrationInterface {
  name = 'CreateAccessTokenSecurity1795789272300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(`
      ALTER TABLE "sessions" ADD COLUMN "family_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "sessions" SET "family_id" = "id" WHERE "family_id" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "sessions" ALTER COLUMN "family_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sessions_family_id" ON "sessions" ("family_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "access_token_denylist" (
        "jti" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_access_token_denylist_jti" PRIMARY KEY ("jti"),
        CONSTRAINT "FK_access_token_denylist_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_access_token_denylist_expires_at" ON "access_token_denylist" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_access_token_denylist_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "access_token_denylist"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_sessions_family_id"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "family_id"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "password_changed_at"`,
    );
  }
}
