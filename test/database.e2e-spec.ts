import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

type EnvironmentOverride = string | undefined;

async function compileApplication(): Promise<TestingModule> {
  return Test.createTestingModule({ imports: [AppModule] }).compile();
}

async function withEnvironment<T>(
  overrides: Record<string, EnvironmentOverride>,
  callback: () => Promise<T>,
): Promise<T> {
  const previousValues = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previousValues)) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for PostgreSQL integration tests');
  }
  return databaseUrl;
}

async function closeApplication(app: INestApplication | undefined): Promise<void> {
  if (app) {
    await app.close();
  }
}

describe('PostgreSQL integration', () => {
  jest.setTimeout(15000);

  it('connects to PostgreSQL, executes SELECT 1, and closes the pool', async () => {
    const moduleFixture = await compileApplication();
    const app = moduleFixture.createNestApplication();

    try {
      configureApp(app);
      await app.init();
      const dataSource = app.get(DataSource);
      const result = await dataSource.query('SELECT 1 AS result');

      expect(result).toEqual([{ result: 1 }]);
      expect(dataSource.isInitialized).toBe(true);
      await request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({ status: 'ok', service: 'assinatura-digital-api' });

      await app.close();
      expect(dataSource.isInitialized).toBe(false);
    } finally {
      await closeApplication(app);
    }
  });

  it('rejects startup when DATABASE_URL is absent', async () => {
    await withEnvironment({ DATABASE_URL: undefined }, async () => {
      await expect(compileApplication()).rejects.toThrow(
        'DATABASE_URL is required and must be a valid PostgreSQL URL',
      );
    });
  });

  it('rejects startup when PostgreSQL is unavailable', async () => {
    const unavailableUrl = new URL(requiredDatabaseUrl());
    unavailableUrl.port = '55433';

    await withEnvironment(
      { DATABASE_URL: unavailableUrl.toString(), DATABASE_SSL: 'false' },
      async () => {
        let startupError: unknown;
        let app: INestApplication | undefined;

        try {
          const moduleFixture = await compileApplication();
          app = moduleFixture.createNestApplication();
          await app.init();
        } catch (error) {
          startupError = error;
        } finally {
          await closeApplication(app);
        }

        expect(startupError).toBeDefined();
      },
    );
  });

  it('rejects invalid credentials without echoing the password', async () => {
    const invalidUrl = new URL(requiredDatabaseUrl());
    const syntheticPassword = 'invalid-synthetic-password';
    invalidUrl.password = syntheticPassword;

    await withEnvironment(
      { DATABASE_URL: invalidUrl.toString(), DATABASE_SSL: 'false' },
      async () => {
        let startupError: unknown;
        let app: INestApplication | undefined;

        try {
          const moduleFixture = await compileApplication();
          app = moduleFixture.createNestApplication();
          await app.init();
        } catch (error) {
          startupError = error;
        } finally {
          await closeApplication(app);
        }

        expect(startupError).toBeDefined();
        const message =
          startupError instanceof Error ? startupError.message : String(startupError);
        expect(message).not.toContain(syntheticPassword);
      },
    );
  });
});
