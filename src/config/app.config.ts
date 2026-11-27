import { registerAs } from '@nestjs/config';
import { resolveWebAuthnConfig } from './webauthn.config';
import {
  DatabaseEnvironment,
  validateDatabaseEnvironment,
} from './database.config';

export const PORT_ENV_NAME = 'PORT';
export const CORS_ORIGINS_ENV_NAME = 'CORS_ORIGINS';
export const PDF_MASTER_KEY_ENV_NAME = 'PDF_MASTER_KEY_B64';
export const JWT_PRIVATE_KEY_ENV_NAME = 'JWT_PRIVATE_KEY_B64';
export const JWT_PUBLIC_KEY_ENV_NAME = 'JWT_PUBLIC_KEY_B64';
export const DEFAULT_CORS_ORIGINS = ['http://localhost:5173'] as const;
const corsOriginsError =
  'CORS_ORIGINS must contain only explicit http or https origins';

export interface ValidatedEnvironment extends DatabaseEnvironment {
  PORT: number;
  CORS_ORIGINS: string;
}

export function resolvePdfMasterKey(environment: Record<string, unknown>): string {
  const configuredKey = environment[PDF_MASTER_KEY_ENV_NAME];
  if (
    typeof configuredKey !== 'string' ||
    !configuredKey ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(configuredKey)
  ) {
    throw new Error('PDF_MASTER_KEY_B64 must be a Base64-encoded 32-byte key');
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(configuredKey, 'base64');
  } catch {
    throw new Error('PDF_MASTER_KEY_B64 must be a Base64-encoded 32-byte key');
  }

  if (decoded.length !== 32 || decoded.toString('base64') !== configuredKey) {
    throw new Error('PDF_MASTER_KEY_B64 must be a Base64-encoded 32-byte key');
  }

  return configuredKey;
}

function resolveJwtKey(
  environment: Record<string, unknown>,
  environmentName: string,
  pemMarker: string,
): string {
  const configuredKey = environment[environmentName];
  if (typeof configuredKey !== 'string' || !configuredKey || !/^[A-Za-z0-9+/]+={0,2}$/.test(configuredKey)) {
    throw new Error('JWT signing keys are not configured');
  }

  const decoded = Buffer.from(configuredKey, 'base64').toString('utf8');
  if (
    !decoded.includes(pemMarker) ||
    Buffer.from(decoded, 'utf8').toString('base64') !== configuredKey
  ) {
    throw new Error('JWT signing keys are not configured');
  }

  return configuredKey;
}

export function resolveJwtEnvironment(environment: Record<string, unknown>): {
  JWT_PRIVATE_KEY_B64: string;
  JWT_PUBLIC_KEY_B64: string;
} {
  return {
    JWT_PRIVATE_KEY_B64: resolveJwtKey(
      environment,
      JWT_PRIVATE_KEY_ENV_NAME,
      '-----BEGIN PRIVATE KEY-----',
    ),
    JWT_PUBLIC_KEY_B64: resolveJwtKey(
      environment,
      JWT_PUBLIC_KEY_ENV_NAME,
      '-----BEGIN PUBLIC KEY-----',
    ),
  };
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

export function resolveCorsOrigins(environment: Record<string, unknown>): string[] {
  const configuredOrigins = environment[CORS_ORIGINS_ENV_NAME];

  if (typeof configuredOrigins === 'undefined') {
    return [...DEFAULT_CORS_ORIGINS];
  }

  if (typeof configuredOrigins !== 'string') {
    throw new Error(corsOriginsError);
  }

  const origins = configuredOrigins.split(',').map((origin) => origin.trim());
  if (
    origins.length === 0 ||
    origins.some((origin) => {
      if (!origin || origin === '*') {
        return true;
      }

      try {
        const parsedOrigin = new URL(origin);
        return (
          !['http:', 'https:'].includes(parsedOrigin.protocol) ||
          parsedOrigin.pathname !== '/' ||
          parsedOrigin.search !== '' ||
          parsedOrigin.hash !== ''
        );
      } catch {
        return true;
      }
    })
  ) {
    throw new Error(corsOriginsError);
  }

  return origins;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): ValidatedEnvironment {
  return {
    PORT: resolvePort(environment),
    CORS_ORIGINS: resolveCorsOrigins(environment).join(','),
    ...validateDatabaseEnvironment(environment),
  };
}

export default registerAs('app', () => ({
  port: validateEnvironment(process.env).PORT,
  corsOrigins: resolveCorsOrigins(process.env),
  webAuthn: resolveWebAuthnConfig(process.env),
  pdfMasterKeyB64: resolvePdfMasterKey(process.env),
  ...resolveJwtEnvironment(process.env),
}));
