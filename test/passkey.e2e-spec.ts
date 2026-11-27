import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { PasskeyChallenge } from '../src/modules/auth/entities/passkey-challenge.entity';

const ROOT = '/api/v1/auth/passkeys';
const ORIGIN = 'http://localhost:5173';

describe('WebAuthn API', () => {
  let app: INestApplication;
  let data: DataSource;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(module.createNestApplication());
    await app.init();
    data = app.get(DataSource);
    await data.runMigrations();
    await data.query('TRUNCATE TABLE "auth_rate_limits", "users" CASCADE');
  }, 30000);

  afterAll(async () => { if (app) await app.close(); });

  it('issues independent challenges for the exact serving domain', async () => {
    const first = await request(app.getHttpServer()).post(`${ROOT}/authentication/options`)
      .set('Origin', ORIGIN).expect(200);
    const second = await request(app.getHttpServer()).post(`${ROOT}/authentication/options`)
      .set('Origin', ORIGIN).expect(200);
    expect(first.body.options).toMatchObject({ rpId: 'localhost', userVerification: 'required' });
    expect(Buffer.from(first.body.options.challenge, 'base64url')).toHaveLength(32);
    expect(first.body.options.challenge).not.toBe(second.body.options.challenge);
    await request(app.getHttpServer()).post(`${ROOT}/authentication/options`)
      .set('Origin', 'https://other.example.org').expect(401);
    await request(app.getHttpServer()).post(`${ROOT}/registration/options`)
      .set('Origin', ORIGIN).send({ currentPassword: 'fixture' }).expect(401);
  });

  it('consumes a challenge once, even when the credential fails validation', async () => {
    const options = await request(app.getHttpServer()).post(`${ROOT}/authentication/options`)
      .set('Origin', ORIGIN).expect(200);
    const { challengeId } = options.body;
    const verify = () => request(app.getHttpServer()).post(`${ROOT}/authentication/verify`)
      .set('Origin', ORIGIN).send({ challengeId, credential: {} });
    const responses = await Promise.all([verify(), verify()]);
    expect(responses.every(({ status, headers }) => status === 401 && !headers['set-cookie'])).toBe(true);
    expect(await data.getRepository(PasskeyChallenge).findOneBy({ id: challengeId })).toBeNull();
  });

  it('rejects expired and unknown challenges', async () => {
    const options = await request(app.getHttpServer()).post(`${ROOT}/authentication/options`)
      .set('Origin', ORIGIN).expect(200);
    const { challengeId } = options.body;
    await data.getRepository(PasskeyChallenge).update(challengeId, { expiresAt: new Date(0) });
    for (const id of [challengeId, randomUUID()]) {
      const result = await request(app.getHttpServer()).post(`${ROOT}/authentication/verify`)
        .set('Origin', ORIGIN).send({ challengeId: id, credential: {} }).expect(401);
      expect(result.headers['set-cookie']).toBeUndefined();
    }
  });
});
