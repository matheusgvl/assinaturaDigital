import { MigrationInterface, QueryRunner } from 'typeorm';

/** Persiste eventos de segurança sem registrar fatores de autenticação. */
export class CreateSecurityAlerts1795789272800 implements MigrationInterface {
  name = 'CreateSecurityAlerts1795789272800';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "security_alerts" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" character varying(32) NOT NULL,
        "ip" character varying(64),
        "device" character varying(256),
        "read" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_security_alerts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_security_alerts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_security_alerts_user_read_created" ON "security_alerts" ("user_id", "read", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_security_alerts_user_read_created"`,
    );
    await queryRunner.query(`DROP TABLE "security_alerts"`);
  }
}
