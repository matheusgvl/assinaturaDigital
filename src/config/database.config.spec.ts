import {
  resolveDatabaseSsl,
  resolveDatabaseUrl,
  validateDatabaseEnvironment,
} from './database.config';

const validUrl = 'postgres://testuser:testpass@127.0.0.1:5432/testdb';

describe('database configuration', () => {
  it('accepts a valid PostgreSQL URL and explicit TLS setting', () => {
    expect(
      validateDatabaseEnvironment({
        DATABASE_URL: validUrl,
        DATABASE_SSL: 'true',
      }),
    ).toEqual({ DATABASE_URL: validUrl, DATABASE_SSL: true });
  });

  it.each([
    undefined,
    '',
    'postgres://127.0.0.1:5432',
    'postgres://127.0.0.1:5432/',
    'mysql://user:pass@127.0.0.1:3306/testdb',
    'not-a-database-url',
    'postgres://127.0.0.1:5432/test db',
    'postgres://127.0.0.1:5432/testdb?sslmode=disable',
    'postgres://127.0.0.1:5432/testdb?sslrootcert=%2Ftmp%2Fca.crt',
  ])('rejects invalid DATABASE_URL values', (value) => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: value })).toThrow(
      'DATABASE_URL is required and must be a valid PostgreSQL URL',
    );
  });

  it('does not echo a received URL in validation errors', () => {
    const invalidUrl = 'postgres://user:synthetic-password@localhost:5432';

    try {
      resolveDatabaseUrl({ DATABASE_URL: invalidUrl });
      throw new Error('validation unexpectedly succeeded');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(invalidUrl);
      expect((error as Error).message).not.toContain('synthetic-password');
    }
  });

  it('does not allow URL TLS parameters to override DATABASE_SSL', () => {
    const invalidUrl = `${validUrl}?sslmode=disable`;

    expect(() => resolveDatabaseUrl({ DATABASE_URL: invalidUrl })).toThrow(
      'DATABASE_URL is required and must be a valid PostgreSQL URL',
    );
  });

  it('accepts only the documented boolean TLS values', () => {
    expect(resolveDatabaseSsl({ DATABASE_SSL: undefined })).toBe(false);
    expect(resolveDatabaseSsl({ DATABASE_SSL: 'false' })).toBe(false);
    expect(resolveDatabaseSsl({ DATABASE_SSL: 'true' })).toBe(true);
    expect(() => resolveDatabaseSsl({ DATABASE_SSL: 'yes' })).toThrow(
      'DATABASE_SSL must be either true or false',
    );
  });
});
