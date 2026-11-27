import { ConfigService } from '@nestjs/config';
import {
  createDatabaseOptions,
  DATABASE_CONNECTION_TIMEOUT_MS,
  DATABASE_POOL_SIZE,
  DATABASE_RETRY_ATTEMPTS,
} from './database-options.factory';

describe('database options factory', () => {
  it('creates a local PostgreSQL configuration without unsafe TLS overrides', () => {
    const configService = new ConfigService({
      database: {
        url: 'postgres://testuser:testpass@127.0.0.1:5432/testdb',
        ssl: false,
      },
    });

    const options = createDatabaseOptions(configService);

    expect(options).toMatchObject({
      type: 'postgres',
      synchronize: false,
      migrationsRun: false,
      dropSchema: false,
      retryAttempts: DATABASE_RETRY_ATTEMPTS,
      logging: false,
      extra: {
        max: DATABASE_POOL_SIZE,
        connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
      },
    });
    expect((options as { ssl: unknown }).ssl).toBe(false);
  });

  it('requires certificate verification when TLS is enabled', () => {
    const configService = new ConfigService({
      database: {
        url: 'postgres://testuser:testpass@db.example.test:5432/testdb',
        ssl: true,
      },
    });

    expect((createDatabaseOptions(configService) as { ssl: unknown }).ssl).toEqual({
      rejectUnauthorized: true,
    });
  });
});
