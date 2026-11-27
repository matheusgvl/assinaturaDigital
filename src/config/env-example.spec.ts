import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_PORT, resolvePort } from './app.config';

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
    expect(content).toMatch(/^PORT=/m);
  });

  it('contains no populated configuration values or future secrets', () => {
    const populatedAssignments = content.match(/^[A-Z][A-Z0-9_]*=.+$/gm) ?? [];
    expect(populatedAssignments).toEqual([]);
    expect(content).not.toMatch(
      /DATABASE_URL|JWT_PRIVATE_KEY|JWT_PUBLIC_KEY|PASSWORD|TOKEN|PRIVATE KEY|BEGIN [A-Z ]+KEY/,
    );
  });

  it('keeps the empty PORT example compatible with the current fallback', () => {
    expect(resolvePort({ PORT: '' })).toBe(DEFAULT_PORT);
    expect(resolvePort({ PORT: '3010' })).toBe(3010);
    expect(resolvePort({ PORT: 'invalid' })).toBe(DEFAULT_PORT);
  });
});
