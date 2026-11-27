import { PORT_ENV_NAME, resolvePort } from './app.config';

describe('application configuration', () => {
  it('uses the configured port from the environment', () => {
    expect(resolvePort({ [PORT_ENV_NAME]: '4321' })).toBe(4321);
  });

  it('rejects a missing PORT during startup validation', () => {
    expect(() => resolvePort({})).toThrow(
      'PORT is required and must be an integer between 1 and 65535',
    );
  });

  it.each(['', 'not-a-port', '0', '65536'])(
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
});
