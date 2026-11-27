import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cria o registro de fatos de segurança com campos tipados e resultados explícitos. */
export class CreateAuditEvents1795789273300 implements MigrationInterface {
  name = 'CreateAuditEvents1795789273300';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid PRIMARY KEY,
        "user_id" uuid,
        "occurred_at" timestamptz NOT NULL DEFAULT now(),
        "ip" inet,
        "user_agent" varchar(512) NOT NULL,
        "request_id" uuid NOT NULL,
        "action" varchar(32) NOT NULL CHECK ("action" IN (
          'login', 'logout', 'auth_failure', 'token_issued',
          'document_sign', 'document_verify', 'password_change'
        )),
        "result" varchar(16) NOT NULL CHECK ("result" IN ('success', 'failure', 'pending'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_events_user_time" ON "audit_events" ("user_id", "occurred_at" DESC)
    `);
    await queryRunner.query('REVOKE ALL ON TABLE "audit_events" FROM PUBLIC');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "audit_events"');
  }
}
