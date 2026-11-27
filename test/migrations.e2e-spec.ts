import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { createDatabaseOptionsFromEnvironment } from '../src/database/database-options.factory';
import { Rnf09SchemaFixture1795789271721 } from './migrations/fixtures/1795789271721-Rnf09SchemaFixture';

const fixtureTableName = 'rnf09_migration_fixture';
const fixtureMigrationName = 'Rnf09SchemaFixture1795789271721';

class FailingMigration1795789271722 implements MigrationInterface {
  public readonly name = 'FailingMigration1795789271722';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "rnf09_failed_fixture" ("id" integer NOT NULL)',
    );
    await queryRunner.query(
      'SELECT * FROM "rnf09_missing_relation_for_test"',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "rnf09_failed_fixture"');
  }
}

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for migration integration tests');
  }

  return databaseUrl;
}

function fixtureDataSource(): DataSource {
  const options = createDatabaseOptionsFromEnvironment({
    DATABASE_URL: requiredDatabaseUrl(),
    DATABASE_SSL: process.env.DATABASE_SSL ?? 'false',
  });

  return new DataSource({
    ...options,
    migrations: [Rnf09SchemaFixture1795789271721],
  });
}

describe('PostgreSQL migrations integration', () => {
  let dataSource: DataSource;

  jest.setTimeout(30000);

  beforeAll(async () => {
    dataSource = fixtureDataSource();
    await dataSource.initialize();
    await dataSource.query(`DROP TABLE IF EXISTS "${fixtureTableName}" CASCADE`);
    const bookkeeping = await dataSource.query(
      `SELECT to_regclass('public.typeorm_migrations') AS table_name`,
    );
    if (bookkeeping[0]?.table_name) {
      await dataSource.query(
        'DELETE FROM "typeorm_migrations" WHERE "name" = $1',
        [fixtureMigrationName],
      );
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('connects to an empty database without synchronizing application tables', async () => {
    const tables = await dataSource.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('${fixtureTableName}', 'typeorm_migrations')
      `,
    );

    // Other integration suites may already have created the shared TypeORM
    // bookkeeping table. The fixture schema itself must still be absent.
    expect(tables.filter(({ table_name }: { table_name: string }) => table_name === fixtureTableName)).toEqual([]);
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrationsRun).toBe(false);
    expect(dataSource.options.dropSchema).toBe(false);
    await expect(dataSource.showMigrations()).resolves.toBe(true);
  });

  it('creates the fixture schema and records the migration history', async () => {
    const executedMigrations = await dataSource.runMigrations();

    expect(executedMigrations).toHaveLength(1);
    expect(executedMigrations[0].name).toBe(fixtureMigrationName);

    const columns = await dataSource.query(
      `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
      `,
      [fixtureTableName],
    );

    expect(columns).toEqual([
      { column_name: 'id', data_type: 'integer' },
      { column_name: 'marker', data_type: 'character varying' },
      { column_name: 'created_at', data_type: 'timestamp with time zone' },
    ]);

    const history = await dataSource.query(
      'SELECT "timestamp", "name" FROM "typeorm_migrations" WHERE "name" = $1',
      [fixtureMigrationName],
    );
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe(fixtureMigrationName);

    const constraints = await dataSource.query(
      `
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = $1
          AND constraint_name = $2
      `,
      [fixtureTableName, 'CHK_rnf09_migration_fixture_marker'],
    );
    expect(constraints).toHaveLength(1);
  });

  it('is idempotent on a second migration run and has no pending migrations', async () => {
    await expect(dataSource.runMigrations()).resolves.toEqual([]);
    await expect(dataSource.showMigrations()).resolves.toBe(false);

    const history = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM "typeorm_migrations" WHERE "name" = $1',
      [fixtureMigrationName],
    );
    expect(history).toEqual([{ count: 1 }]);
  });

  it('rejects invalid migration configuration without requiring PORT', () => {
    expect(() =>
      createDatabaseOptionsFromEnvironment({ DATABASE_SSL: 'false' }),
    ).toThrow('DATABASE_URL is required and must be a valid PostgreSQL URL');

    expect(() =>
      createDatabaseOptionsFromEnvironment({
        DATABASE_URL: requiredDatabaseUrl(),
        DATABASE_SSL: 'yes',
      }),
    ).toThrow('DATABASE_SSL must be either true or false');
  });

  it('does not record a failed migration or leave its table behind', async () => {
    const failingOptions = createDatabaseOptionsFromEnvironment({
      DATABASE_URL: requiredDatabaseUrl(),
      DATABASE_SSL: process.env.DATABASE_SSL ?? 'false',
    });
    const failingDataSource = new DataSource({
      ...failingOptions,
      migrations: [FailingMigration1795789271722],
    });

    await failingDataSource.initialize();
    try {
      await expect(failingDataSource.runMigrations()).rejects.toThrow();
    } finally {
      await failingDataSource.destroy();
    }

    const failedTable = await dataSource.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `,
      ['rnf09_failed_fixture'],
    );
    expect(failedTable).toEqual([]);

    const failedHistory = await dataSource.query(
      'SELECT "name" FROM "typeorm_migrations" WHERE "name" = $1',
      ['FailingMigration1795789271722'],
    );
    expect(failedHistory).toEqual([]);
  });

  it('closes the DataSource and its pool', async () => {
    await dataSource.destroy();

    expect(dataSource.isInitialized).toBe(false);
  });
});
