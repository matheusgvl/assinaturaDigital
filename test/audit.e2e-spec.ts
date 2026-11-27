import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

type AuditRow = {
  id: string;
  user_id: string | null;
  occurred_at: Date;
  ip: string | null;
  user_agent: string;
  request_id: string;
  action: string;
  result: string;
};

function configureJwtKeys(): () => void {
  const previousPrivate = process.env.JWT_PRIVATE_KEY_B64;
  const previousPublic = process.env.JWT_PUBLIC_KEY_B64;
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.JWT_PRIVATE_KEY_B64 = Buffer.from(
    pair.privateKey.export({ format: 'pem', type: 'pkcs8' }),
  ).toString('base64');
  process.env.JWT_PUBLIC_KEY_B64 = Buffer.from(
    pair.publicKey.export({ format: 'pem', type: 'spki' }),
  ).toString('base64');
  return () => {
    if (previousPrivate === undefined) delete process.env.JWT_PRIVATE_KEY_B64;
    else process.env.JWT_PRIVATE_KEY_B64 = previousPrivate;
    if (previousPublic === undefined) delete process.env.JWT_PUBLIC_KEY_B64;
    else process.env.JWT_PUBLIC_KEY_B64 = previousPublic;
  };
}

function cookie(response: request.Response, name: string): string {
  const values = response.headers['set-cookie'];
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const value = list.find((entry: string) => entry.startsWith(`${name}=`));
  if (!value) throw new Error(`cookie ${name} was not issued`);
  return value.split(';', 1)[0];
}

async function passivePdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return Buffer.from(await document.save());
}

/** Exercita os sete fatos obrigatórios e a imutabilidade com o papel da aplicação. */
describe('audit trail (PostgreSQL integration)', () => {
  let app: INestApplication;
  let data: DataSource;
  let restoreKeys: () => void;

  jest.setTimeout(60000);

  beforeAll(async () => {
    restoreKeys = configureJwtKeys();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app, ['http://localhost:5173']);
    await app.init();
    data = app.get(DataSource);
    await data.runMigrations();
  });

  afterAll(async () => {
    await app.close();
    restoreKeys();
  });

  it('records mandatory fields and prevents modifications by the runtime role', async () => {
    const email = `audit-${Date.now()}@example.com`;
    const password = `${randomUUID()}-Aa!`;
    const nextPassword = `${randomUUID()}-Bb@`;
    const wrongPassword = `${randomUUID()}-Cc#`;
    const agent = 'audit-e2e-agent/1';
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('User-Agent', agent)
      .send({ name: 'Audit User', email, password })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', agent)
      .send({ email, password: wrongPassword })
      .expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', agent)
      .send({ email, password })
      .expect(200);
    const firstRefresh = cookie(login, 'refresh_token');
    const firstCsrf = cookie(login, 'csrf_token');

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('User-Agent', agent)
      .set('Cookie', [firstRefresh, firstCsrf])
      .set('X-CSRF-Token', firstCsrf.slice('csrf_token='.length))
      .expect(200);
    const refreshedToken = refresh.body.accessToken as string;

    const signed = await request(app.getHttpServer())
      .post('/api/v1/documents/sign')
      .set('Authorization', `Bearer ${refreshedToken}`)
      .set('User-Agent', agent)
      .field('page', '1')
      .field('x', '20')
      .field('y', '20')
      .attach('file', await passivePdf(), 'audit.pdf')
      .expect(200);
    expect(signed.headers['content-type']).toContain('application/pdf');

    const verification = await request(app.getHttpServer())
      .post('/api/v1/documents/verify')
      .set('User-Agent', agent)
      .attach('file', signed.body, 'signed-audit.pdf')
      .expect(201);
    expect(verification.body.status).toBe('valid');

    await request(app.getHttpServer())
      .post('/api/v1/auth/password')
      .set('Authorization', `Bearer ${refreshedToken}`)
      .set('User-Agent', agent)
      .send({ currentPassword: password, newPassword: nextPassword })
      .expect(204);

    const afterChange = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', agent)
      .send({ email, password: nextPassword })
      .expect(200);
    const refreshCookie = cookie(afterChange, 'refresh_token');
    const csrfCookie = cookie(afterChange, 'csrf_token');
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${afterChange.body.accessToken as string}`)
      .set('User-Agent', agent)
      .set('Cookie', [refreshCookie, csrfCookie])
      .set('X-CSRF-Token', csrfCookie.slice('csrf_token='.length))
      .expect(204);

    // A tabela é append-only por definição: outros cenários não podem apagá-la
    // para isolar este teste. O agente HTTP identifica somente os fatos que
    // este próprio cenário produziu, mesmo quando a regressão completa roda.
    const events = await data.query<AuditRow[]>(
      `SELECT id, user_id, occurred_at, ip, user_agent, request_id, action, result
       FROM audit_events
       WHERE user_agent = $1
       ORDER BY occurred_at ASC`,
      [agent],
    );
    const actions = events.map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining([
      'login', 'logout', 'auth_failure', 'token_issued',
      'document_sign', 'document_verify', 'password_change',
    ]));
    expect(events.some((event) => event.user_id === register.body.id)).toBe(true);
    for (const event of events) {
      expect(event.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(new Date(event.occurred_at).toISOString()).toBeTruthy();
      expect(event.ip).toBeTruthy();
      expect(event.user_agent).toBe(agent);
      expect(event.request_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(['success', 'failure', 'pending']).toContain(event.result);
    }
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(nextPassword);
    expect(serialized).not.toContain(refreshedToken);

    const originalCount = events.length;
    await expect(data.query('UPDATE audit_events SET result = $1', ['failure']))
      .rejects.toThrow(/permission denied|append-only/i);
    await expect(data.query('DELETE FROM audit_events')).rejects.toThrow(/permission denied|append-only/i);
    const [{ count }] = await data.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM audit_events WHERE user_agent = $1',
      [agent],
    );
    expect(Number(count)).toBe(originalCount);
  });

  it('keeps the trigger active even for the migration owner when configured', async () => {
    const ownerUrl = process.env.AUDIT_MIGRATOR_DATABASE_URL;
    if (!ownerUrl) return;
    const owner = new DataSource({ type: 'postgres', url: ownerUrl });
    await owner.initialize();
    try {
      await expect(owner.query('UPDATE audit_events SET result = $1', ['failure']))
        .rejects.toThrow('Audit events are append-only');
      await expect(owner.query('DELETE FROM audit_events'))
        .rejects.toThrow('Audit events are append-only');
    } finally {
      await owner.destroy();
    }
  });
});
