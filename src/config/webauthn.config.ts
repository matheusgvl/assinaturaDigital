import { isIP } from 'node:net';

const INVALID_CONFIGURATION =
  'WebAuthn requires an exact RP ID and origins with the same host';

export interface WebAuthnConfig {
  rpId: string;
  origins: string[];
}

/** Valida o domínio do frontend e as origens exatas aceitas em cada cerimônia. */
export function resolveWebAuthnConfig(
  env: Record<string, unknown>,
): WebAuthnConfig {
  const rpId = env.WEBAUTHN_RP_ID ?? 'localhost';
  const configuredOrigins =
    env.WEBAUTHN_ORIGINS ?? 'http://localhost:5173';

  if (
    typeof rpId !== 'string' ||
    rpId.length > 253 ||
    (rpId !== 'localhost' &&
      (!rpId.includes('.') ||
        isIP(rpId) !== 0 ||
        !rpId.split('.').every((label) =>
          /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
        ))) ||
    typeof configuredOrigins !== 'string'
  ) {
    throw new Error(INVALID_CONFIGURATION);
  }

  const origins = configuredOrigins.split(',').map((entry) => entry.trim());
  for (const entry of origins) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(INVALID_CONFIGURATION);
    }
    if (
      url.origin !== entry ||
      url.hostname !== rpId ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && rpId === 'localhost'))
    ) {
      throw new Error(INVALID_CONFIGURATION);
    }
  }

  return { rpId, origins: [...new Set(origins)] };
}
