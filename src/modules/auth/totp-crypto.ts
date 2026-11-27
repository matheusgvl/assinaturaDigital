import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const AES_ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export type EncryptedTotpSecret = {
  encryptedSecret: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

function assertMasterKey(masterKey: Buffer): void {
  if (masterKey.length !== 32)
    throw new Error('TOTP master key is not configured');
}

/** Cifra o segredo TOTP com AES-256-GCM e autenticação de integridade. */
export function encryptTotpSecret(
  secret: string,
  masterKey: Buffer,
): EncryptedTotpSecret {
  assertMasterKey(masterKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, masterKey, iv);
  const encryptedSecret = Buffer.concat([
    cipher.update(Buffer.from(secret, 'utf8')),
    cipher.final(),
  ]);
  return { encryptedSecret, iv, authTag: cipher.getAuthTag() };
}

/** Decifra e autentica o segredo; qualquer adulteração falha sem retornar dados. */
export function decryptTotpSecret(
  encrypted: EncryptedTotpSecret,
  masterKey: Buffer,
): string {
  assertMasterKey(masterKey);
  const decipher = createDecipheriv(AES_ALGORITHM, masterKey, encrypted.iv);
  decipher.setAuthTag(encrypted.authTag);
  return Buffer.concat([
    decipher.update(encrypted.encryptedSecret),
    decipher.final(),
  ]).toString('utf8');
}
