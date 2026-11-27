import { registerAs } from '@nestjs/config';

export const DATABASE_URL_ENV_NAME = 'DATABASE_URL';
export const DATABASE_SSL_ENV_NAME = 'DATABASE_SSL';

export interface DatabaseEnvironment {
  DATABASE_URL: string;
  DATABASE_SSL: boolean;
}

const databaseUrlError =
  'DATABASE_URL is required and must be a valid PostgreSQL URL';
const databaseTlsUrlParameters = new Set([
  'ssl',
  'sslcert',
  'sslkey',
  'sslmode',
  'sslpassword',
  'sslrootcert',
]);

export function resolveDatabaseUrl(environment: Record<string, unknown>): string {
  const configuredUrl = environment[DATABASE_URL_ENV_NAME];

  if (
    typeof configuredUrl !== 'string' ||
    !configuredUrl ||
    /\s/.test(configuredUrl)
  ) {
    throw new Error(databaseUrlError);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error(databaseUrlError);
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
    !parsedUrl.hostname
  ) {
    throw new Error(databaseUrlError);
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  } catch {
    throw new Error(databaseUrlError);
  }

  if (!databaseName || databaseName.includes('/')) {
    throw new Error(databaseUrlError);
  }

  for (const parameter of parsedUrl.searchParams.keys()) {
    if (databaseTlsUrlParameters.has(parameter.toLowerCase())) {
      throw new Error(databaseUrlError);
    }
  }

  return configuredUrl;
}

export function resolveDatabaseSsl(environment: Record<string, unknown>): boolean {
  const configuredSsl = environment[DATABASE_SSL_ENV_NAME];

  if (configuredSsl === undefined || configuredSsl === '') {
    return false;
  }

  if (configuredSsl === 'true') {
    return true;
  }

  if (configuredSsl === 'false') {
    return false;
  }

  throw new Error('DATABASE_SSL must be either true or false');
}

export function validateDatabaseEnvironment(
  environment: Record<string, unknown>,
): DatabaseEnvironment {
  return {
    DATABASE_URL: resolveDatabaseUrl(environment),
    DATABASE_SSL: resolveDatabaseSsl(environment),
  };
}

export default registerAs('database', () => {
  const environment = validateDatabaseEnvironment(process.env);

  return {
    url: environment.DATABASE_URL,
    ssl: environment.DATABASE_SSL,
  };
});
