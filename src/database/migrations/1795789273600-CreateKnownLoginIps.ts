import { MigrationInterface, QueryRunner } from 'typeorm';

/** Guarda o conjunto mínimo de IPs conhecidos sem persistir conteúdo de sessão. */
export class CreateKnownLoginIps1795789273600 implements MigrationInterface {
  name = 'CreateKnownLoginIps1795789273600';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "known_login_ips" (
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "ip" inet NOT NULL,
        "first_seen_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "ip")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "known_login_ips"');
  }
}
