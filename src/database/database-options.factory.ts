import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const DATABASE_POOL_SIZE = 10;
export const DATABASE_CONNECTION_TIMEOUT_MS = 5000;
export const DATABASE_RETRY_ATTEMPTS = 1;
export const DATABASE_RETRY_DELAY_MS = 1000;

export function createDatabaseOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const databaseUrl = configService.getOrThrow<string>('database.url');
  const databaseSsl = configService.getOrThrow<boolean>('database.ssl');

  return {
    type: 'postgres',
    url: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: true } : false,
    autoLoadEntities: false,
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    retryAttempts: DATABASE_RETRY_ATTEMPTS,
    retryDelay: DATABASE_RETRY_DELAY_MS,
    logging: false,
    extra: {
      max: DATABASE_POOL_SIZE,
      connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    },
  };
}
