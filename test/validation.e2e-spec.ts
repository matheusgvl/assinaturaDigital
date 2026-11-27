import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { IsEmail, IsDefined, IsString } from 'class-validator';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { configureApp } from '../src/bootstrap/configure-app';

class ValidationFixtureDto {
  @IsDefined()
  @IsEmail()
  email!: string;

  @IsDefined()
  @IsString()
  displayName!: string;
}

@Controller('validation-fixture')
class ValidationFixtureController {
  @Post()
  create(@Body() body: ValidationFixtureDto): ValidationFixtureDto {
    return body;
  }
}

describe('global validation pipe (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [ValidationFixtureController],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('accepts a valid DTO and transforms the request through the pipe', async () => {
    await request(app.getHttpServer())
      .post('/validation-fixture')
      .send({ email: 'person@example.com', displayName: 'Person' })
      .expect(201)
      .expect({ email: 'person@example.com', displayName: 'Person' });
  });

  it('rejects invalid fields without echoing the submitted value', async () => {
    const response = await request(app.getHttpServer())
      .post('/validation-fixture')
      .send({
        email: 'not-an-email-with-sensitive-marker',
        displayName: 42,
        extra: 'secret-value',
      })
      .expect(400);

    expect(response.body.code).toBe('VAL_001');
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.details.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'displayName' }),
        expect.objectContaining({ field: 'extra' }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('secret-value');
    expect(JSON.stringify(response.body)).not.toMatch(/stack|sql/i);
  });
});
