import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

function configureJwtKeys(): { privateKey: string | undefined; publicKey: string | undefined } {
  const previous = {
    privateKey: process.env.JWT_PRIVATE_KEY_B64,
    publicKey: process.env.JWT_PUBLIC_KEY_B64,
  };
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.JWT_PRIVATE_KEY_B64 = Buffer.from(
    keys.privateKey.export({ format: 'pem', type: 'pkcs8' }),
  ).toString('base64');
  process.env.JWT_PUBLIC_KEY_B64 = Buffer.from(
    keys.publicKey.export({ format: 'pem', type: 'spki' }),
  ).toString('base64');
  return previous;
}

function restoreJwtKeys(previous: {
  privateKey: string | undefined;
  publicKey: string | undefined;
}): void {
  if (previous.privateKey === undefined) delete process.env.JWT_PRIVATE_KEY_B64;
  else process.env.JWT_PRIVATE_KEY_B64 = previous.privateKey;
  if (previous.publicKey === undefined) delete process.env.JWT_PUBLIC_KEY_B64;
  else process.env.JWT_PUBLIC_KEY_B64 = previous.publicKey;
}

function cookieValue(response: request.Response): string {
  const header = response.headers['set-cookie'];
  const setCookie = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = setCookie.find((entry: string) => entry.startsWith('refresh_token='));
  if (!cookie) throw new Error('refresh cookie was not issued');
  return cookie.split(';', 1)[0];
}

describe('authentication flow (integration)', () => {
  let app: INestApplication;
  let previousKeys: { privateKey: string | undefined; publicKey: string | undefined };

  beforeAll(async () => {
    previousKeys = configureJwtKeys();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, ['http://localhost:5173']);
    await app.init();
    const dataSource = app.get(DataSource);
    await dataSource.runMigrations();
    await dataSource.query(
      'TRUNCATE TABLE "auth_rate_limits", "sessions", "users" CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
    restoreJwtKeys(previousKeys);
  });

  it('registers, logs in, reads the protected user and rotates refresh tokens', async () => {
    const email = `auth-${Date.now()}@example.com`;
    const password = 'Strong-password9';
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Demo User', email, password })
      .expect(201);

    expect(register.body).toMatchObject({ name: 'Demo User', email });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    expect(login.body.accessToken).toMatch(/^ey/);
    const originalCookie = cookieValue(login);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200)
      .expect({
        id: register.body.id,
        name: 'Demo User',
        email,
        totpEnabled: false,
      });

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(200);
    expect(refresh.body.accessToken).toMatch(/^ey/);
    const rotatedCookie = cookieValue(refresh);
    expect(rotatedCookie).not.toBe(originalCookie);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', rotatedCookie)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });

  it('uses a generic response for duplicate accounts and wrong credentials', async () => {
    const email = `lockout-${Date.now()}@example.com`;
    const password = 'Strong-password9';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Lockout User', email, password })
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Other', email, password })
      .expect(409);
    expect(duplicate.body).toMatchObject({
      code: 'AUTH_001',
      message: 'Unable to create account',
    });

    const wrongResponses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      wrongResponses.push(
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'Wrong-password9' })
          .expect(401),
      );
    }
    for (const response of wrongResponses) {
      expect(response.body).toMatchObject({
        code: 'AUTH_001',
        message: 'Invalid credentials',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/email|password|stack|sql/i);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(401);
  });

  it('limits login attempts independently by IP', async () => {
    await app.get(DataSource).query('DELETE FROM "auth_rate_limits" WHERE "scope" = $1', ['ip']);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `unknown-${Date.now()}-${attempt}@example.com`,
          password: 'Wrong-password9',
        })
        .expect(401);
    }

    const limited = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `unknown-final-${Date.now()}@example.com`, password: 'Wrong-password9' })
      .expect(429);
    expect(limited.body).toMatchObject({
      code: 'API_001',
      message: 'Too many login attempts',
    });
  });
});
