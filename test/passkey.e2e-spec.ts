import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { PasskeyChallenge } from '../src/modules/auth/entities/passkey-challenge.entity';
import { Passkey } from '../src/modules/auth/entities/passkey.entity';
import { advancePasskeyCounter } from '../src/modules/auth/passkey-counter';

const ROOT = '/api/v1/auth/passkeys';
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Test-fixture-password9!';

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

  it('stores public credential metadata and isolates device management by owner', async () => {
    const createUser = async () => {
      const email = `passkey-${randomUUID()}@example.test`;
      const user = await request(app.getHttpServer()).post('/api/v1/auth/register')
        .send({ name: 'WebAuthn fixture', email, password: PASSWORD }).expect(201);
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login')
        .send({ email, password: PASSWORD }).expect(200);
      return { id: user.body.id as string, bearer: `Bearer ${login.body.accessToken}` };
    };
    const owner = await createUser();
    const other = await createUser();
    const repository = data.getRepository(Passkey);
    const id = randomUUID();
    await repository.insert({
      id, userId: owner.id, name: 'Fixture device', credentialId: randomUUID(),
      aaguid: randomUUID(), counter: '0', publicKey: Buffer.from([1]), transports: ['internal'],
    });

    const advances = await Promise.all([
      data.transaction((manager) => advancePasskeyCounter(manager, { id, counter: '0' }, 1, new Date())),
      data.transaction((manager) => advancePasskeyCounter(manager, { id, counter: '0' }, 1, new Date())),
    ]);
    expect(advances.sort()).toEqual([false, true]);
    expect(await repository.findOneBy({ id })).toMatchObject({ counter: '1' });

    const list = await request(app.getHttpServer()).get(ROOT)
      .set('Authorization', owner.bearer).expect(200);
    expect(list.body).toEqual([{
      id, name: 'Fixture device', createdAt: expect.any(String),
      lastUsedAt: expect.any(String), transports: ['internal'],
    }]);
    await request(app.getHttpServer()).get(ROOT)
      .set('Authorization', other.bearer).expect(200, []);
    await request(app.getHttpServer()).delete(`${ROOT}/${id}`)
      .set('Authorization', other.bearer).send({ currentPassword: PASSWORD }).expect(404);
    await request(app.getHttpServer()).delete(`${ROOT}/${id}`)
      .set('Authorization', owner.bearer).send({ currentPassword: 'different test password' }).expect(401);
    await request(app.getHttpServer()).put(`${ROOT}/${id}`)
      .set('Authorization', owner.bearer).send({ name: ' Renamed ', currentPassword: PASSWORD }).expect(204);
    expect(await repository.findOneBy({ id })).toMatchObject({ name: 'Renamed' });
    await request(app.getHttpServer()).delete(`${ROOT}/${id}`)
      .set('Authorization', owner.bearer).send({ currentPassword: PASSWORD }).expect(204);
    expect(await repository.findOneBy({ id })).toMatchObject({ revokedAt: expect.any(Date) });
    await request(app.getHttpServer()).get(ROOT)
      .set('Authorization', owner.bearer).expect(200, []);
  });
});
