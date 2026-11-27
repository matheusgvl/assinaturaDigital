import { INestApplication } from '@nestjs/common';
import { createDecipheriv, generateKeyPairSync, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import forge from 'node-forge';
import request from 'supertest';
import type { Response as SuperagentResponse } from 'superagent';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { SigningKey } from '../src/modules/documents/entities/signing-key.entity';

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

function inflatePdfStreams(pdf: Buffer): string {
  const source = pdf.toString('latin1');
  const text: string[] = [];
  const streamPattern = /\/Filter\s*\/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of source.matchAll(streamPattern)) {
    try {
      text.push(inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'));
    } catch {
      // Signature and unrelated streams are not necessarily text streams.
    }
  }
  return text.join('\n').replace(/<([0-9a-f]+)>/gi, (_, hex: string) =>
    Buffer.from(hex, 'hex').toString('latin1'),
  );
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

  jest.setTimeout(30000);

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

  it('provisions a distinct encrypted RSA signing key for each account at registration', async () => {
    const keys = app.get(DataSource).getRepository(SigningKey);
    const moduli = new Set<string>();
    for (let index = 0; index < 2; index += 1) {
      const user = await request(app.getHttpServer()).post('/api/v1/auth/register')
        .send({ name: 'RSA fixture', email: `${randomUUID()}@example.test`, password: 'Strong-password9' })
        .expect(201);
      expect(Object.keys(user.body).sort()).toEqual(['email', 'id', 'name']);
      const row = await keys.findOneByOrFail({ userId: user.body.id as string });
      expect(row.iv).toHaveLength(12);
      expect(row.authTag).toHaveLength(16);
      const master = Buffer.from(process.env.PDF_MASTER_KEY_B64!, 'base64');
      try {
        const decipher = createDecipheriv('aes-256-gcm', master, row.iv);
        decipher.setAuthTag(row.authTag);
        const plain = Buffer.concat([decipher.update(row.encryptedP12), decipher.final()]);
        try {
          expect(row.encryptedP12.equals(plain)).toBe(false);
          const store = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(plain.toString('binary')), '');
          const bagType = forge.pki.oids.certBag;
          const cert = store.getBags({ bagType })[bagType]?.[0]?.cert;
          const publicKey = cert?.publicKey as { n: { bitLength(): number; toString(radix: number): string } } | undefined;
          expect(publicKey?.n.bitLength()).toBe(2048);
          moduli.add(publicKey!.n.toString(16));
        } finally {
          plain.fill(0);
        }
      } finally {
        master.fill(0);
      }
    }
    expect(moduli.size).toBe(2);
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
    const visualSeal = inflatePdfStreams(signed);
    expect(visualSeal).toContain('SHA-256:');
    expect(visualSeal).toContain('ID:');

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

  it('rate-limits repeated public verification requests per IP', async () => {
    await app.get(DataSource).query(
      'DELETE FROM "auth_rate_limits" WHERE "scope" = $1',
      ['document_verify'],
    );
    const unsignedPdf = Buffer.from('%PDF-1.7\n%%EOF');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/documents/verify')
        .attach('file', unsignedPdf, 'unsigned.pdf')
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/v1/documents/verify')
      .attach('file', unsignedPdf, 'unsigned.pdf')
      .expect(429)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 'API_001',
          message: 'Too many verification requests',
        });
      });
  });

  it('keeps the rate limit atomic under concurrent verification requests', async () => {
    await app.get(DataSource).query(
      'DELETE FROM "auth_rate_limits" WHERE "scope" = $1',
      ['document_verify'],
    );
    const unsignedPdf = Buffer.from('%PDF-1.7\n%%EOF');
    const responses = await Promise.all(
      Array.from({ length: 40 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/documents/verify')
          .attach('file', unsignedPdf, 'unsigned.pdf'),
      ),
    );

    expect(responses.filter(({ status }) => status === 201)).toHaveLength(30);
    expect(responses.filter(({ status }) => status === 429)).toHaveLength(10);
    expect(responses.some(({ status }) => status >= 500)).toBe(false);
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
