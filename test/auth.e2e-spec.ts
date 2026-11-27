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

function cookieValue(response: request.Response, name: string): string {
  const header = response.headers['set-cookie'];
  const setCookie = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = setCookie.find((entry: string) => entry.startsWith(`${name}=`));
  if (!cookie) throw new Error(`${name} cookie was not issued`);
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
    const originalCookie = cookieValue(login, 'refresh_token');
    const csrfCookie = cookieValue(login, 'csrf_token');
    expect(login.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('refresh_token='),
        expect.stringContaining('SameSite=Strict'),
        expect.stringContaining('csrf_token='),
      ]),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [originalCookie, csrfCookie])
      .set('X-CSRF-Token', 'wrong-token')
      .expect(403);

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
      .set('Cookie', [originalCookie, csrfCookie])
      .set('X-CSRF-Token', csrfCookie.slice('csrf_token='.length))
      .expect(200);
    expect(refresh.body.accessToken).toMatch(/^ey/);
    const rotatedCookie = cookieValue(refresh, 'refresh_token');
    const rotatedCsrfCookie = cookieValue(refresh, 'csrf_token');
    expect(rotatedCookie).not.toBe(originalCookie);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [originalCookie, rotatedCsrfCookie])
      .set('X-CSRF-Token', rotatedCsrfCookie.slice('csrf_token='.length))
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', [rotatedCookie, rotatedCsrfCookie])
      .set('X-CSRF-Token', rotatedCsrfCookie.slice('csrf_token='.length))
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [rotatedCookie, rotatedCsrfCookie])
      .set('X-CSRF-Token', rotatedCsrfCookie.slice('csrf_token='.length))
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

  it('does not issue an access token when a second factor is enabled', async () => {
    const email = `totp-guard-${Date.now()}@example.com`;
    const password = 'Strong-password9';
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'TOTP Guard', email, password })
      .expect(201);
    await app.get(DataSource).query(
      'UPDATE "users" SET "totp_enabled" = true WHERE "id" = $1',
      [register.body.id],
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(403);
    expect(login.body).toMatchObject({
      code: 'AUTH_002',
      message: 'Additional verification required',
    });
    expect(login.body.accessToken).toBeUndefined();
    expect(login.headers['set-cookie']).toBeUndefined();
  });

  it('isolates active sessions and supports individual and global revocation', async () => {
    const firstEmail = `sessions-a-${Date.now()}@example.com`;
    const secondEmail = `sessions-b-${Date.now()}@example.com`;
    const password = 'Strong-password9';
    const firstRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Sessions A', email: firstEmail, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Sessions B', email: secondEmail, password })
      .expect(201);
    const firstLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: firstEmail, password })
      .expect(200);
    const secondLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: secondEmail, password })
      .expect(200);
    const firstSessions = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${firstLogin.body.accessToken}`)
      .expect(200);
    const secondSessions = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${secondLogin.body.accessToken}`)
      .expect(200);
    expect(firstSessions.body).toHaveLength(1);
    expect(secondSessions.body).toHaveLength(1);
    expect(firstSessions.body[0].userId).toBeUndefined();

    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${firstSessions.body[0].id}`)
      .set('Authorization', `Bearer ${secondLogin.body.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${firstSessions.body[0].id}`)
      .set('Authorization', `Bearer ${firstLogin.body.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/sessions/revoke-all')
      .set('Authorization', `Bearer ${secondLogin.body.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${secondLogin.body.accessToken}`)
      .expect(200)
      .expect([]);
    expect(firstRegister.body.id).toBeTruthy();
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
