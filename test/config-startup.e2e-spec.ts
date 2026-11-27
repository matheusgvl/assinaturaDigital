import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

async function compileApplication(): Promise<TestingModule> {
  return Test.createTestingModule({ imports: [AppModule] }).compile();
}

async function withPort<T>(
  port: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const previousPort = process.env.PORT;

  if (typeof port === 'undefined') {
    delete process.env.PORT;
  } else {
    process.env.PORT = port;
  }

  try {
    return await callback();
  } finally {
    if (typeof previousPort === 'undefined') {
      delete process.env.PORT;
    } else {
      process.env.PORT = previousPort;
    }
  }
}

describe('ConfigModule startup validation (integration)', () => {
  it('initializes with a valid PORT and keeps the health contract available', async () => {
    await withPort('3013', async () => {
      const moduleFixture = await compileApplication();
      const app: INestApplication = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();

      await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect({ status: 'ok', service: 'assinatura-digital-api' });

      await app.close();
    });
  });

  it('rejects startup when PORT is absent', async () => {
    await withPort(undefined, async () => {
      await expect(compileApplication()).rejects.toThrow(
        'PORT is required and must be an integer between 1 and 65535',
      );
    });
  });

  it('rejects startup for a non-decimal PORT without echoing the value', async () => {
    await withPort('3e3', async () => {
      try {
        await compileApplication();
        throw new Error('ConfigModule unexpectedly initialized');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain(
          'PORT is required and must be an integer between 1 and 65535',
        );
        expect(message).not.toContain('3e3');
      }
    });
  });
});
