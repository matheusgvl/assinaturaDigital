import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { decryptTotpSecret } from '../src/modules/auth/totp-crypto';
import { generateTotpCode } from '../src/modules/auth/totp';

function cookieValue(response: request.Response, name: string): string {
  const header = response.headers['set-cookie'];
  const setCookie = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = setCookie.find((entry: string) =>
    entry.startsWith(`${name}=`),
  );
  if (!cookie) throw new Error(`${name} cookie was not issued`);
  return cookie.split(';', 1)[0];
}

describe('TOTP login (integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let email: string;
  const password = 'Strong-password9';
  let userId: string;
  let recoveryCode: string;
  let currentTotpCode: () => string;
  let initialRefreshCookie: string;
  let initialCsrfCookie: string;

  jest.setTimeout(30000);

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, ['http://localhost:5173']);
    await app.init();
    dataSource = app.get(DataSource);
    await dataSource.runMigrations();
    await dataSource.query('TRUNCATE TABLE "users" CASCADE');

    email = `totp-login-${Date.now()}@example.com`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'TOTP Login', email, password })
      .expect(201);
    userId = registration.body.id;
    const initialLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    initialRefreshCookie = cookieValue(initialLogin, 'refresh_token');
    initialCsrfCookie = cookieValue(initialLogin, 'csrf_token');
    const setup = await request(app.getHttpServer())
      .post('/api/v1/auth/totp/setup')
      .set('Authorization', `Bearer ${initialLogin.body.accessToken}`)
      .expect(201);
    const stored = await dataSource.query(
      'SELECT "encrypted_secret", "iv", "auth_tag" FROM "totp_secrets" WHERE "user_id" = $1',
      [userId],
    );
    const secret = decryptTotpSecret(
      {
        encryptedSecret: stored[0].encrypted_secret,
        iv: stored[0].iv,
        authTag: stored[0].auth_tag,
      },
      Buffer.from(process.env.PDF_MASTER_KEY_B64!, 'base64'),
    );
    currentTotpCode = () => generateTotpCode(secret, Date.now());

    const confirmation = await request(app.getHttpServer())
      .post('/api/v1/auth/totp/setup/confirm')
      .set('Authorization', `Bearer ${initialLogin.body.accessToken}`)
      .send({ setupId: setup.body.setupId, code: currentTotpCode() })
      .expect(201);
    recoveryCode = confirmation.body.codes[0];
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('requires TOTP before issuing JWT and accepts a valid code', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [initialRefreshCookie, initialCsrfCookie])
      .set(
        'X-CSRF-Token',
        initialCsrfCookie.slice('csrf_token='.length),
      )
      .expect(401);

    const challenge = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    expect(challenge.body).toEqual({
      requiresSecondFactor: true,
      transactionId: expect.any(String),
    });
    expect(challenge.body.accessToken).toBeUndefined();
    expect(challenge.headers['set-cookie']).toBeUndefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/totp/login/verify')
      .send({ transactionId: challenge.body.transactionId, code: '000000' })
      .expect(401);

    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/totp/login/verify')
      .send({
        transactionId: challenge.body.transactionId,
        code: currentTotpCode(),
      })
      .expect(200);
    expect(verified.body.accessToken).toMatch(/^ey/);
    expect(verified.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('refresh_token='),
        expect.stringContaining('csrf_token='),
      ]),
    );

    const refreshCookie = cookieValue(verified, 'refresh_token');
    const csrfCookie = cookieValue(verified, 'csrf_token');
    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshCookie, csrfCookie])
      .set('X-CSRF-Token', csrfCookie.slice('csrf_token='.length))
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
  });

  it('accepts one recovery code and rejects its reuse', async () => {
    const challenge = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/totp/login/verify')
      .send({
        transactionId: challenge.body.transactionId,
        recoveryCode,
      })
      .expect(200);

    const secondChallenge = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/totp/login/verify')
      .send({
        transactionId: secondChallenge.body.transactionId,
        recoveryCode,
      })
      .expect(401);

    const consumed = await dataSource.query(
      'SELECT "used_at" FROM "totp_recovery_codes" WHERE "user_id" = $1 AND "used_at" IS NOT NULL',
      [userId],
    );
    expect(consumed).toHaveLength(1);
  });

  it('rejects expired and rate-limited factor transactions', async () => {
    const expired = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    await dataSource.query(
      'UPDATE "totp_login_transactions" SET "expires_at" = NOW() - INTERVAL \'1 second\' WHERE "id" = $1',
      [expired.body.transactionId],
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/totp/login/verify')
      .send({
        transactionId: expired.body.transactionId,
        code: currentTotpCode(),
      })
      .expect(401);

    const limited = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/totp/login/verify')
        .send({
          transactionId: limited.body.transactionId,
          code: '000000',
        })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/totp/login/verify')
      .send({
        transactionId: limited.body.transactionId,
        code: currentTotpCode(),
      })
      .expect(401);
  });
});
