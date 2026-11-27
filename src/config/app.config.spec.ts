import {
  CORS_ORIGINS_ENV_NAME,
  DEFAULT_CORS_ORIGINS,
  PORT_ENV_NAME,
  resolveCorsOrigins,
  resolveJwtEnvironment,
  resolvePort,
} from './app.config';

describe('application configuration', () => {
  it('uses the configured port from the environment', () => {
    expect(resolvePort({ [PORT_ENV_NAME]: '4321' })).toBe(4321);
  });

  it('rejects a missing PORT during startup validation', () => {
    expect(() => resolvePort({})).toThrow(
      'PORT is required and must be an integer between 1 and 65535',
    );
  });

  it.each([
    '',
    'not-a-port',
    '3e3',
    '0xBB8',
    '3000.5',
    '3000abc',
    ' 3000',
    '3000 ',
    '30 00',
    '0',
    '65536',
  ])(
    'rejects invalid PORT value %s',
    (value) => {
      expect(() => resolvePort({ [PORT_ENV_NAME]: value })).toThrow(
        'PORT is required and must be an integer between 1 and 65535',
      );
    },
  );

  it('accepts the boundary ports', () => {
    expect(resolvePort({ [PORT_ENV_NAME]: '1' })).toBe(1);
    expect(resolvePort({ [PORT_ENV_NAME]: '65535' })).toBe(65535);
  });

  it('requires Base64-encoded RSA PEM markers for JWT keys', () => {
    expect(() => resolveJwtEnvironment({})).toThrow(
      'JWT signing keys are not configured',
    );
    expect(() =>
      resolveJwtEnvironment({
        JWT_PRIVATE_KEY_B64: Buffer.from('not-a-key').toString('base64'),
        JWT_PUBLIC_KEY_B64: Buffer.from('not-a-key').toString('base64'),
      }),
    ).toThrow('JWT signing keys are not configured');
  });

  it('uses an explicit local origin when CORS_ORIGINS is absent', () => {
    expect(resolveCorsOrigins({})).toEqual([...DEFAULT_CORS_ORIGINS]);
  });

  it('accepts a comma-separated explicit origin allowlist', () => {
    expect(
      resolveCorsOrigins({
        [CORS_ORIGINS_ENV_NAME]:
          'https://app.example.com, http://localhost:5173',
      }),
    ).toEqual(['https://app.example.com', 'http://localhost:5173']);
  });

  it.each(['*', 'javascript:alert(1)', 'https://app.example.com/path', ''])(
    'rejects unsafe CORS origin configuration %s',
    (value) => {
      expect(() =>
        resolveCorsOrigins({ [CORS_ORIGINS_ENV_NAME]: value }),
      ).toThrow('CORS_ORIGINS must contain only explicit http or https origins');
    },
  );
});
