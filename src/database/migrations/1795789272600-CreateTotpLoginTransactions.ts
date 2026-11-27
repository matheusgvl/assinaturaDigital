import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cria transações temporárias que impedem JWT antes do segundo fator. */
export class CreateTotpLoginTransactions1795789272600
  implements MigrationInterface
{
  name = 'CreateTotpLoginTransactions1795789272600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "totp_login_transactions" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "consumed_at" TIMESTAMP WITH TIME ZONE,
        "ip_hash" character(64) NOT NULL,
        "user_agent_hash" character(64) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_totp_login_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_totp_login_transactions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_totp_login_transactions_user_expires" ON "totp_login_transactions" ("user_id", "expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_totp_login_transactions_user_expires"`,
    );
    await queryRunner.query(`DROP TABLE "totp_login_transactions"`);
  }
}
