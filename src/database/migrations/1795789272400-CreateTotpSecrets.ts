import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cria o armazenamento cifrado dos segredos TOTP sem alterar usuários existentes. */
export class CreateTotpSecrets1795789272400 implements MigrationInterface {
  name = 'CreateTotpSecrets1795789272400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "totp_secrets" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "encrypted_secret" bytea NOT NULL,
        "iv" bytea NOT NULL,
        "auth_tag" bytea NOT NULL,
        "pending_expires_at" TIMESTAMP WITH TIME ZONE,
        "setup_attempts" integer NOT NULL DEFAULT 0,
        "confirmed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_totp_secrets_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_totp_secrets_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_totp_secrets_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_totp_secrets_pending_expires_at" ON "totp_secrets" ("pending_expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_totp_secrets_pending_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "totp_secrets"`);
  }
}
