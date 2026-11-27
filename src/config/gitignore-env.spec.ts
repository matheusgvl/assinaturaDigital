import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../..');

function isIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '--no-index', '--quiet', '--', path], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    const exitCode = (error as { status?: number }).status;
    if (exitCode === 1) {
      return false;
    }
    throw error;
  }
}

describe('.gitignore environment protection', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    '.env.test',
    '.env.production.local',
    '.env.backup',
    '.env.bak',
    'src/.env',
    'config/.env.local',
  ])('ignores %s', (path) => {
    expect(isIgnored(path)).toBe(true);
  });

  it('allows the documented example file', () => {
    expect(isIgnored('.env.example')).toBe(false);
  });
});
