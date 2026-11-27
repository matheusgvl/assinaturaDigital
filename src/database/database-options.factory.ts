import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';
import { validateDatabaseEnvironment } from '../config/database.config';

export const DATABASE_POOL_SIZE = 10;
export const DATABASE_CONNECTION_TIMEOUT_MS = 5000;
export const DATABASE_RETRY_ATTEMPTS = 1;
export const DATABASE_RETRY_DELAY_MS = 1000;
export const DATABASE_MIGRATIONS_TABLE_NAME = 'typeorm_migrations';
export const DATABASE_MIGRATIONS_GLOB = join(
  __dirname,
  'migrations/*{.js,.ts}',
);
export const DATABASE_ENTITIES_GLOB = join(
  __dirname,
  '../modules/**/entities/*{.js,.ts}',
);

function createDatabaseConnectionOptions(
  databaseUrl: string,
  databaseSsl: boolean,
  migrationsGlob: string,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: true } : false,
    migrations: [migrationsGlob],
    entities: [DATABASE_ENTITIES_GLOB],
    migrationsTableName: DATABASE_MIGRATIONS_TABLE_NAME,
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    logging: false,
    extra: {
      max: DATABASE_POOL_SIZE,
      connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    },
  };
}

export function createDatabaseOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const databaseUrl = configService.getOrThrow<string>('database.url');
  const databaseSsl = configService.getOrThrow<boolean>('database.ssl');

  return {
    ...createDatabaseConnectionOptions(
      databaseUrl,
      databaseSsl,
      DATABASE_MIGRATIONS_GLOB,
    ),
    autoLoadEntities: false,
    retryAttempts: DATABASE_RETRY_ATTEMPTS,
    retryDelay: DATABASE_RETRY_DELAY_MS,
  };
}

export function createDatabaseOptionsFromEnvironment(
  environment: Record<string, unknown>,
  migrationsGlob = DATABASE_MIGRATIONS_GLOB,
): DataSourceOptions {
  const validatedEnvironment = validateDatabaseEnvironment(environment);

  return createDatabaseConnectionOptions(
    validatedEnvironment.DATABASE_URL,
    validatedEnvironment.DATABASE_SSL,
    migrationsGlob,
  );
}
