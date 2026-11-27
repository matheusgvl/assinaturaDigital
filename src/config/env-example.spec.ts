import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolvePort } from './app.config';

const envExamplePath = resolve(__dirname, '../../.env.example');

describe('.env.example', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(envExamplePath, 'utf8');
  });

  it('exists at the repository root', () => {
    expect(existsSync(envExamplePath)).toBe(true);
  });

  it('documents every application variable currently used', () => {
    expect(content).toMatch(/^PORT=3000$/m);
    expect(content).toMatch(/^DATABASE_URL=$/m);
    expect(content).toMatch(/^DATABASE_SSL=false$/m);
  });

  it('contains no populated configuration values or future secrets', () => {
    const populatedAssignments = content.match(/^[A-Z][A-Z0-9_]*=.+$/gm) ?? [];
    expect(populatedAssignments).toEqual([
      'PORT=3000',
      'DATABASE_SSL=false',
      'CORS_ORIGINS=http://localhost:5173',
    ]);
    expect(content).not.toMatch(
      /^(JWT_PRIVATE_KEY|JWT_PUBLIC_KEY|PASSWORD|TOKEN|PRIVATE_KEY)=.+$/m,
    );
  });

  it('keeps the documented PORT value compatible with startup validation', () => {
    expect(resolvePort({ PORT: '3000' })).toBe(3000);
    expect(resolvePort({ PORT: '3010' })).toBe(3010);
    expect(() => resolvePort({ PORT: '' })).toThrow();
    expect(() => resolvePort({ PORT: 'invalid' })).toThrow();
  });
});
