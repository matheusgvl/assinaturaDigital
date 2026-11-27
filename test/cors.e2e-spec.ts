import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

describe('CORS allowlist (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, ['https://frontend.example.com']);
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns CORS headers for an explicitly allowed origin', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://frontend.example.com')
      .expect(200)
      .expect('Access-Control-Allow-Origin', 'https://frontend.example.com')
      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('does not allow an origin outside the configured allowlist', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://attacker.example.com')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never emits a wildcard CORS header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://frontend.example.com')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });
});
