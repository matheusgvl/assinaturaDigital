import { registerAs } from '@nestjs/config';

export const DEFAULT_PORT = 3000;
export const PORT_ENV_NAME = 'PORT';

export function resolvePort(environment: NodeJS.ProcessEnv): number {
  const configuredPort = environment[PORT_ENV_NAME];

  if (!configuredPort?.trim()) {
    return DEFAULT_PORT;
  }

  const port = Number(configuredPort);
  return Number.isInteger(port) && port >= 1 && port <= 65535
    ? port
    : DEFAULT_PORT;
}

export default registerAs('app', () => ({
  port: resolvePort(process.env),
}));
