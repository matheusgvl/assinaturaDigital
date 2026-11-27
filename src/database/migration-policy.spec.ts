import { createDatabaseOptionsFromEnvironment } from './database-options.factory';

describe('migration policy', () => {
  it('keeps schema changes explicit and does not synchronize or drop data', () => {
    const options = createDatabaseOptionsFromEnvironment({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
      DATABASE_SSL: 'false',
    });

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.dropSchema).toBe(false);
    expect(options.migrationsTableName).toBe('typeorm_migrations');
  });
});
