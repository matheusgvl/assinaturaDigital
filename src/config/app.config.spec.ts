import {
  DEFAULT_PORT,
  PORT_ENV_NAME,
  resolvePort,
} from './app.config';

describe('application configuration', () => {
  it('uses the configured port from the environment', () => {
    expect(resolvePort({ [PORT_ENV_NAME]: '4321' })).toBe(4321);
  });

  it('uses the local default when PORT is absent', () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
  });

  it('uses the local default for an invalid port without exposing configuration', () => {
    expect(resolvePort({ [PORT_ENV_NAME]: 'not-a-port' })).toBe(DEFAULT_PORT);
    expect(resolvePort({ [PORT_ENV_NAME]: '70000' })).toBe(DEFAULT_PORT);
  });
});
