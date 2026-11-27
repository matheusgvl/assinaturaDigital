import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { decryptTotpSecret } from '../src/modules/auth/totp-crypto';
import { generateTotpCode } from '../src/modules/auth/totp';

const agent = 'security-alerts-e2e/1';

function headers(ip: string) {
  return { 'User-Agent': agent, 'X-Forwarded-For': ip };
}

/** Confirma alertas de IP, senha e TOTP sem expor material de autenticação. */
describe('account security activity (integration)', () => {
  let app: INestApplication;
  let data: DataSource;

  jest.setTimeout(45000);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app, ['http://localhost:5173']);
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    await app.init();
    data = app.get(DataSource);
    await data.runMigrations();
  });

  afterAll(async () => {
    await app.close();
  });

  it('alerts new IPs and protected account changes, then permits only owner reads', async () => {
    const email = `alerts-${Date.now()}@example.com`;
    const password = `${randomUUID()}-Aa!`;
    const nextPassword = `${randomUUID()}-Bb@`;
    const firstIp = '192.0.2.10';
    const secondIp = '198.51.100.20';
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register').set(headers(firstIp))
      .send({ name: 'Alert User', email, password }).expect(201);

    await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers(firstIp))
      .send({ email, password }).expect(200);
    const secondLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers(secondIp))
      .send({ email, password }).expect(200);

    const setup = await request(app.getHttpServer()).post('/api/v1/auth/totp/setup')
      .set(headers(secondIp)).set('Authorization', `Bearer ${secondLogin.body.accessToken as string}`).expect(201);
    const [stored] = await data.query<Array<{ encrypted_secret: Buffer; iv: Buffer; auth_tag: Buffer }>>(
      'SELECT encrypted_secret, iv, auth_tag FROM totp_secrets WHERE user_id = $1', [registration.body.id],
    );
    const secret = decryptTotpSecret(
      { encryptedSecret: stored.encrypted_secret, iv: stored.iv, authTag: stored.auth_tag },
      Buffer.from(process.env.PDF_MASTER_KEY_B64!, 'base64'),
    );
    const code = () => generateTotpCode(secret, Date.now());
    await request(app.getHttpServer()).post('/api/v1/auth/totp/setup/confirm').set(headers(secondIp))
      .set('Authorization', `Bearer ${secondLogin.body.accessToken as string}`)
      .send({ setupId: setup.body.setupId, code: code() }).expect(201);

    const challenge = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers(secondIp))
      .send({ email, password }).expect(200);
    const verified = await request(app.getHttpServer()).post('/api/v1/auth/totp/login/verify').set(headers(secondIp))
      .send({ transactionId: challenge.body.transactionId, code: code() }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/totp/disable').set(headers(secondIp))
      .set('Authorization', `Bearer ${verified.body.accessToken as string}`)
      .send({ currentPassword: password, code: code() }).expect(204);

    const afterDisable = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers(secondIp))
      .send({ email, password }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/password').set(headers(secondIp))
      .set('Authorization', `Bearer ${afterDisable.body.accessToken as string}`)
      .send({ currentPassword: password, newPassword: nextPassword }).expect(204);
    const finalLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers(secondIp))
      .send({ email, password: nextPassword }).expect(200);

    const alerts = await request(app.getHttpServer()).get('/api/v1/auth/alerts').set(headers(secondIp))
      .set('Authorization', `Bearer ${finalLogin.body.accessToken as string}`).expect(200);
    const kinds = alerts.body.map((alert: { type: string }) => alert.type);
    expect(kinds).toEqual(expect.arrayContaining(['new_ip', 'totp_enabled', 'totp_disabled', 'password_changed']));
    expect(JSON.stringify(alerts.body)).not.toContain(password);
    expect(JSON.stringify(alerts.body)).not.toContain(nextPassword);
    const unseen = alerts.body.find((alert: { type: string }) => alert.type === 'new_ip');
    expect(unseen).toEqual(expect.objectContaining({ read: false, ip: secondIp }));

    await request(app.getHttpServer()).post('/api/v1/auth/alerts/read').set(headers(secondIp))
      .set('Authorization', `Bearer ${finalLogin.body.accessToken as string}`)
      .send({ ids: [unseen.id, randomUUID()] }).expect(204);
    const updated = await request(app.getHttpServer()).get('/api/v1/auth/alerts').set(headers(secondIp))
      .set('Authorization', `Bearer ${finalLogin.body.accessToken as string}`).expect(200);
    expect(updated.body.find((alert: { id: string }) => alert.id === unseen.id).read).toBe(true);
    const [user] = await data.query<Array<{ totp_enabled: boolean }>>(
      'SELECT totp_enabled FROM users WHERE id = $1', [registration.body.id],
    );
    expect(user.totp_enabled).toBe(false);
    const [secretCount] = await data.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM totp_secrets WHERE user_id = $1', [registration.body.id],
    );
    expect(secretCount.count).toBe('0');
  });
});
