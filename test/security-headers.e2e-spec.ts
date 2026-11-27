import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { configureApp } from '../src/bootstrap/configure-app';

@Controller('headers-fixture')
class HeadersFixtureController {
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

describe('HTTP security headers (integration)', () => {
  let app: INestApplication;
  const previousNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    const moduleFixture = await Test.createTestingModule({
      controllers: [HeadersFixtureController],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    configureApp(app, ['https://frontend.example.com']);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it('emits the required headers and no-store for API responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/headers-fixture')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);

    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
    expect(response.headers['x-xss-protection']).toBe('0');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
  });

  it('does not emit HSTS for a non-TLS request', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/headers-fixture')
      .expect(200);

    expect(response.headers['strict-transport-security']).toBeUndefined();
  });
});
