import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentSigningSchema1795789272200 implements MigrationInterface {
  name = 'CreateDocumentSigningSchema1795789272200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "signing_keys" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "encrypted_p12" bytea NOT NULL,
        "iv" bytea NOT NULL,
        "auth_tag" bytea NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_signing_keys_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_signing_keys_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_signing_keys_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "document_signatures" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "signed_hash" character(64) NOT NULL,
        "original_hash" character(64) NOT NULL,
        "signer_name" character varying(120) NOT NULL,
        "signed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_signatures_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_document_signatures_signed_hash" UNIQUE ("signed_hash"),
        CONSTRAINT "FK_document_signatures_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_document_signatures_user_id" ON "document_signatures" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_document_signatures_user_id"`);
    await queryRunner.query(`DROP TABLE "document_signatures"`);
    await queryRunner.query(`DROP TABLE "signing_keys"`);
  }
}
