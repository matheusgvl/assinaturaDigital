import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const fixturePath = resolve(
  __dirname,
  'migrations/fixtures/1795789271721-Rnf09SchemaFixture.ts',
);

describe('migration fixture', () => {
  it('is versioned outside the production migration path', () => {
    const relativeFixturePath = relative(process.cwd(), fixturePath).split(sep).join('/');

    expect(existsSync(fixturePath)).toBe(true);
    expect(relativeFixturePath).toContain('test/migrations/fixtures');
    expect(relativeFixturePath).not.toContain('src/database/migrations');
  });

  it('contains deterministic up and down operations without secrets or PDFs', () => {
    const content = readFileSync(fixturePath, 'utf8');

    expect(content).toContain('MigrationInterface');
    expect(content).toContain('QueryRunner');
    expect(content).toContain('public async up');
    expect(content).toContain('public async down');
    expect(content).toContain('rnf09_migration_fixture');
    expect(content).not.toMatch(/password|secret|token|private.?key|pdf/i);
  });

  it('uses a timestamp identifier and descriptive migration name', () => {
    expect(fixturePath).toMatch(/\d{13}-[A-Za-z0-9]+\.ts$/);
  });
});
