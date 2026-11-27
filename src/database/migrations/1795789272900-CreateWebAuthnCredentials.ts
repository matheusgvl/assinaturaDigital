import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cria o registro das chaves públicas e metadados do autenticador. */
export class CreateWebAuthnCredentials1795789272900 implements MigrationInterface {
  name = 'CreateWebAuthnCredentials1795789272900';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webauthn_credentials" (
        "id" uuid PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "credential_id" varchar(1364) NOT NULL UNIQUE,
        "public_key" bytea NOT NULL CHECK (octet_length("public_key") > 0),
        "counter" bigint NOT NULL CHECK ("counter" BETWEEN 0 AND 4294967295),
        "aaguid" uuid NOT NULL,
        "name" varchar(100) NOT NULL CHECK (length("name") > 0),
        "transports" text[] NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_used_at" timestamptz,
        "revoked_at" timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_webauthn_credentials_user_id"
      ON "webauthn_credentials" ("user_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "webauthn_credentials"');
  }
}
