import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import type { Response as SuperagentResponse } from 'superagent';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

function configureJwtKeys(): void {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.JWT_PRIVATE_KEY_B64 = Buffer.from(
    keys.privateKey.export({ format: 'pem', type: 'pkcs8' }),
  ).toString('base64');
  process.env.JWT_PUBLIC_KEY_B64 = Buffer.from(
    keys.publicKey.export({ format: 'pem', type: 'spki' }),
  ).toString('base64');
}

async function createPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const page = document.addPage([400, 400]);
  page.drawText('Documento de integração');
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

function pdfParser(
  response: SuperagentResponse,
  callback: (error: Error | null, body?: unknown) => void,
): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error));
}

describe('document signing flow (integration)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    configureJwtKeys();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, ['http://localhost:5173']);
    await app.init();
    const dataSource = app.get(DataSource);
    await dataSource.runMigrations();
    await dataSource.query(
      'TRUNCATE TABLE "document_signatures", "signing_keys", "auth_rate_limits", "sessions", "users" CASCADE',
    );

    const email = `documents-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Documento User', email, password: 'Strong-password9' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Strong-password9' })
      .expect(200);
    accessToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('embeds a real CMS signature, records it, and verifies the returned PDF', async () => {
    const original = await createPdf();
    const sign = await request(app.getHttpServer())
      .post('/api/v1/documents/sign')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('page', '1')
      .field('x', '20')
      .field('y', '20')
      .attach('file', original, 'document.pdf')
      .buffer(true)
      .parse(pdfParser)
      .expect(200);

    const signed = sign.body as Buffer;
    expect(signed.subarray(0, 5).toString()).toBe('%PDF-');
    expect(signed.toString('latin1')).toMatch(/\/ByteRange\s*\[/);
    expect(signed.toString('latin1')).toMatch(/\/Contents\s*</);
    expect(sign.headers['content-type']).toMatch(/application\/pdf/);

    await request(app.getHttpServer())
      .post('/api/v1/documents/verify')
      .attach('file', signed, 'documento-assinado.pdf')
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('valid');
        expect(body.signer).toBe('Documento User');
        expect(body.signatureId).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.documentHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(body)).not.toMatch(/private|password|p12|master/i);
      });

    const tampered = Buffer.from(signed);
    tampered[tampered.length - 10] ^= 1;
    await request(app.getHttpServer())
      .post('/api/v1/documents/verify')
      .attach('file', tampered, 'tampered.pdf')
      .expect(201)
      .expect({ status: 'tampered' });
  });

  it('rejects an active PDF payload before parsing it', async () => {
    const activePdf = Buffer.from('%PDF-1.7\n/JavaScript (alert)\n%%EOF');
    await request(app.getHttpServer())
      .post('/api/v1/documents/sign')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('page', '1')
      .field('x', '20')
      .field('y', '20')
      .attach('file', activePdf, 'active.pdf')
      .expect(422)
      .expect(({ body }) => {
        expect(body.message).toBe('The uploaded file is not an accepted PDF');
        expect(JSON.stringify(body)).not.toContain('JavaScript');
      });
  });

  it('rejects malformed multipart coordinates through the global validation pipe', async () => {
    const original = await createPdf();
    await request(app.getHttpServer())
      .post('/api/v1/documents/sign')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('page', 'one')
      .field('x', 'not-a-number')
      .field('y', '20')
      .attach('file', original, 'document.pdf')
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'VAL_001', message: 'Validation failed' });
        expect(JSON.stringify(body)).not.toContain('not-a-number');
      });
  });
});
