import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

describe('Health endpoint (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns the health contract with safe, typed fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      service: 'assinatura-digital-api',
    });
    expect(typeof response.body.status).toBe('string');
    expect(typeof response.body.service).toBe('string');
    expect(response.body).not.toHaveProperty('database');
    expect(response.body).not.toHaveProperty('environment');
    expect(response.body).not.toHaveProperty('secret');
  });

  it('does not accept POST on the GET-only health route', () =>
    request(app.getHttpServer())
      .post('/api/v1/health')
      .send({ status: 'unexpected' })
      .expect(404),
  );

  it('returns a stable, non-sensitive error for an unknown route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unknown')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toEqual({
      code: 'API_001',
      message: 'Resource not found',
      timestamp: expect.any(String),
      path: '/api/v1/unknown',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/stack|sql|secret/i);
  });

  it('does not expose the Express fingerprint header', () =>
    request(app.getHttpServer())
      .get('/api/v1/health')
      .expect((response) => {
        if (response.headers['x-powered-by']) {
          throw new Error('X-Powered-By must not be exposed');
        }
      }),
  );

  it('does not expose the health route without the API version', () =>
    request(app.getHttpServer()).get('/health').expect(404),
  );
});
