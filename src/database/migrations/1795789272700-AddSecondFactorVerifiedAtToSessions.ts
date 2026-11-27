import { MigrationInterface, QueryRunner } from 'typeorm';

/** Diferencia refresh tokens emitidos antes e depois do segundo fator. */
export class AddSecondFactorVerifiedAtToSessions1795789272700
  implements MigrationInterface
{
  name = 'AddSecondFactorVerifiedAtToSessions1795789272700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD "second_factor_verified_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP COLUMN "second_factor_verified_at"`,
    );
  }
}
