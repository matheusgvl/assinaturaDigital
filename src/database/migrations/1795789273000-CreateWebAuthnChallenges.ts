import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cria o armazenamento de uso único das cerimônias WebAuthn. */
export class CreateWebAuthnChallenges1795789273000 implements MigrationInterface {
  name = 'CreateWebAuthnChallenges1795789273000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webauthn_challenges" (
        "id" uuid PRIMARY KEY,
        "challenge" varchar(48) NOT NULL,
        "purpose" varchar(14) NOT NULL,
        "user_id" uuid REFERENCES "users" ("id") ON DELETE CASCADE,
        "session_id" uuid REFERENCES "sessions" ("id") ON DELETE CASCADE,
        "context_hash" char(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        CHECK (
          ("purpose" = 'registration' AND "user_id" IS NOT NULL AND "session_id" IS NOT NULL)
          OR ("purpose" = 'authentication' AND "user_id" IS NULL AND "session_id" IS NULL)
        )
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_webauthn_challenges_user_id" ON "webauthn_challenges" ("user_id")');
    await queryRunner.query('CREATE INDEX "IDX_webauthn_challenges_session_id" ON "webauthn_challenges" ("session_id")');
    await queryRunner.query('CREATE INDEX "IDX_webauthn_challenges_expires_at" ON "webauthn_challenges" ("expires_at")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "webauthn_challenges"');
  }
}
