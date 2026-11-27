import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cria códigos de recuperação armazenando somente hashes irreversíveis. */
export class CreateTotpRecoveryCodes1795789272500
  implements MigrationInterface
{
  name = 'CreateTotpRecoveryCodes1795789272500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "totp_recovery_codes" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "code_hash" character(64) NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_totp_recovery_codes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_totp_recovery_codes_user_hash" UNIQUE ("user_id", "code_hash"),
        CONSTRAINT "FK_totp_recovery_codes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_totp_recovery_codes_user_used" ON "totp_recovery_codes" ("user_id", "used_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_totp_recovery_codes_user_used"`,
    );
    await queryRunner.query(`DROP TABLE "totp_recovery_codes"`);
  }
}
