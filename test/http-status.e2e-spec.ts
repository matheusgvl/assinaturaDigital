import {
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { configureApp } from '../src/bootstrap/configure-app';

@Controller('status-fixture')
class HttpStatusFixtureController {
  @Get('400')
  badRequest(): never {
    throw new HttpException('internal validation detail', HttpStatus.BAD_REQUEST);
  }

  @Get('401')
  unauthorized(): never {
    throw new UnauthorizedException();
  }

  @Get('403')
  forbidden(): never {
    throw new ForbiddenException();
  }

  @Get('404')
  notFound(): never {
    throw new NotFoundException();
  }

  @Get('500')
  unexpected(): never {
    throw new Error('SQL password=secret');
  }
}

describe('HTTP status contract (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [HttpStatusFixtureController],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it.each([
    ['400', 400, 'VAL_001', 'Invalid request'],
    ['401', 401, 'AUTH_001', 'Authentication required'],
    ['403', 403, 'AUTH_002', 'Access denied'],
    ['404', 404, 'API_001', 'Resource not found'],
    ['500', 500, 'API_001', 'Internal server error'],
  ])(
    'returns the semantic status and safe envelope for %s',
    async (route, status, code, message) => {
      const response = await request(app.getHttpServer())
        .get(`/status-fixture/${route}`)
        .expect(status);

      expect(response.body).toMatchObject({
        code,
        message,
        timestamp: expect.any(String),
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /stack|SQL password|secret|internal validation/i,
      );
    },
  );
});
