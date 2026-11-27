import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_SECRET_BYTES = 20;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(value: string): Buffer {
  const normalized = value.replace(/=+$/g, '').toUpperCase();
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error('Invalid TOTP secret');
  }

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function encodeBase32(value: Buffer): string {
  let buffer = 0;
  let bits = 0;
  let encoded = '';
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += BASE32_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) encoded += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return encoded;
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Gera um segredo Base32 com 160 bits de entropia usando CSPRNG. */
export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(TOTP_SECRET_BYTES));
}

/** Gera o código TOTP para um instante específico, útil para testes com relógio controlado. */
export function generateTotpCode(
  secret: string,
  timestampMs: number,
  digits = TOTP_DIGITS,
): string {
  const decoded = decodeBase32(secret);
  if (decoded.length < TOTP_SECRET_BYTES)
    throw new Error('Invalid TOTP secret');
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  return hotp(decoded, counter, digits);
}

/** Verifica a janela anterior, atual e posterior do período RFC 6238 de 30 segundos. */
export function verifyTotp(
  secret: string,
  code: string,
  timestampMs = Date.now(),
  window = 1,
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let decoded: Buffer;
  try {
    decoded = decodeBase32(secret);
  } catch {
    return false;
  }
  if (decoded.length < TOTP_SECRET_BYTES) return false;

  const currentCounter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  const supplied = Buffer.from(code);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = Buffer.from(
      hotp(decoded, currentCounter + offset, TOTP_DIGITS),
    );
    if (timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

/** Monta uma URI otpauth compatível com aplicativos autenticadores. */
export function createOtpAuthUri(
  secret: string,
  account: string,
  issuer = 'Assinatura Digital',
): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}
