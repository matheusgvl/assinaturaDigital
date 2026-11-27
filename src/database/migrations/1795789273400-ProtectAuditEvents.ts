import { MigrationInterface, QueryRunner } from 'typeorm';

/** Impede alteração, exclusão e truncamento dos fatos de auditoria via DML. */
export class ProtectAuditEvents1795789273400 implements MigrationInterface {
  name = 'ProtectAuditEvents1795789273400';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION "prevent_audit_event_mutation"() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Audit events are append-only' USING ERRCODE = '42501';
        RETURN NULL;
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "reject_audit_mutation"
      BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_events"
      FOR EACH STATEMENT EXECUTE FUNCTION "prevent_audit_event_mutation"()
    `);
    await queryRunner.query('ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER "reject_audit_mutation"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER "reject_audit_mutation" ON "audit_events"');
    await queryRunner.query('DROP FUNCTION "prevent_audit_event_mutation"');
  }
}
