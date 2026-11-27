import { MigrationInterface, QueryRunner } from 'typeorm';

/** Acrescenta eventos de cerimônias WebAuthn e de ativação de segundo fator. */
export class ExpandAuditActions1795789273500 implements MigrationInterface {
  name = 'ExpandAuditActions1795789273500';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_check"');
    await queryRunner.query(`
      ALTER TABLE "audit_events" ADD CONSTRAINT "CHK_audit_events_action" CHECK ("action" IN (
        'login', 'logout', 'auth_failure', 'token_issued',
        'document_sign', 'document_verify', 'password_change',
        'totp_enabled', 'passkey_registered', 'passkey_revoked'
      ))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "audit_events" DROP CONSTRAINT "CHK_audit_events_action"');
    await queryRunner.query(`
      ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_check" CHECK ("action" IN (
        'login', 'logout', 'auth_failure', 'token_issued',
        'document_sign', 'document_verify', 'password_change'
      ))
    `);
  }
}
