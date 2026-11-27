import { registerAs } from '@nestjs/config';
import {
  DatabaseEnvironment,
  validateDatabaseEnvironment,
} from './database.config';

export const PORT_ENV_NAME = 'PORT';

export interface ValidatedEnvironment extends DatabaseEnvironment {
  PORT: number;
}

export function resolvePort(environment: Record<string, unknown>): number {
  const configuredPort = environment[PORT_ENV_NAME];

  if (typeof configuredPort !== 'string' || !/^[0-9]+$/.test(configuredPort)) {
    throw new Error('PORT is required and must be an integer between 1 and 65535');
  }

  const port = Number(configuredPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT is required and must be an integer between 1 and 65535');
  }

  return port;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): ValidatedEnvironment {
  return {
    PORT: resolvePort(environment),
    ...validateDatabaseEnvironment(environment),
  };
}

export default registerAs('app', () => ({
  port: validateEnvironment(process.env).PORT,
}));
