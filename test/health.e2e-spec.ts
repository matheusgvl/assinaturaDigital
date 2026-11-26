import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health endpoint (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns the health contract', () =>
    request(app.getHttpServer())
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect({ status: 'ok', service: 'assinatura-digital-api' }),
  );

  it('returns 404 for an unknown route', () =>
    request(app.getHttpServer()).get('/unknown').expect(404),
  );
});
