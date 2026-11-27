import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { decryptTotpSecret } from '../src/modules/auth/totp-crypto';
import { generateTotpCode } from '../src/modules/auth/totp';

describe('TOTP enrollment (integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

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
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('creates an encrypted pending setup and activates it only after a valid code', async () => {
    const email = `totp-enrollment-${Date.now()}@example.com`;
    const password = 'Strong-password9';

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'TOTP Enrollment', email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const setup = await request(app.getHttpServer())
      .post('/api/v1/auth/totp/setup')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(201);

    expect(setup.body).toEqual({
      setupId: expect.any(String),
      qrCodeDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      expiresAt: expect.any(String),
    });

    const stored = await dataSource.query(
      'SELECT "encrypted_secret", "iv", "auth_tag", "confirmed_at" FROM "totp_secrets" WHERE "user_id" = $1',
      [registration.body.id],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].confirmed_at).toBeNull();
    expect(Buffer.isBuffer(stored[0].encrypted_secret)).toBe(true);
    expect(Buffer.isBuffer(stored[0].iv)).toBe(true);
    expect(Buffer.isBuffer(stored[0].auth_tag)).toBe(true);

    // O teste descriptografa o segredo somente para produzir o código do autenticador;
    // a aplicação nunca devolve o segredo nem o grava em logs.
    const secret = decryptTotpSecret(
      {
        encryptedSecret: stored[0].encrypted_secret,
        iv: stored[0].iv,
        authTag: stored[0].auth_tag,
      },
      Buffer.from(process.env.PDF_MASTER_KEY_B64!, 'base64'),
    );
    const code = generateTotpCode(secret, Date.now());

    const confirmation = await request(app.getHttpServer())
      .post('/api/v1/auth/totp/setup/confirm')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ setupId: setup.body.setupId, code })
      .expect(201);
    expect(confirmation.body).toEqual({ codes: [] });

    const activated = await dataSource.query(
      'SELECT "confirmed_at" FROM "totp_secrets" WHERE "user_id" = $1',
      [registration.body.id],
    );
    const user = await dataSource.query(
      'SELECT "totp_enabled" FROM "users" WHERE "id" = $1',
      [registration.body.id],
    );
    expect(activated[0].confirmed_at).not.toBeNull();
    expect(user[0].totp_enabled).toBe(true);
  });

  it('rejects an invalid confirmation and leaves two-factor authentication disabled', async () => {
    const email = `totp-invalid-${Date.now()}@example.com`;
    const password = 'Strong-password9';
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'TOTP Invalid', email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const setup = await request(app.getHttpServer())
      .post('/api/v1/auth/totp/setup')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(201);

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/auth/totp/setup/confirm')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ setupId: setup.body.setupId, code: '000000' })
      .expect(401);
    expect(invalid.body.message).toBe('Invalid second-factor code');

    const user = await dataSource.query(
      'SELECT "totp_enabled" FROM "users" WHERE "id" = $1',
      [registration.body.id],
    );
    expect(user[0].totp_enabled).toBe(false);

    await dataSource.query(
      'UPDATE "totp_secrets" SET "pending_expires_at" = NOW() - INTERVAL \'1 second\' WHERE "id" = $1',
      [setup.body.setupId],
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/totp/setup/confirm')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ setupId: setup.body.setupId, code: '123456' })
      .expect(401);
  });
});
