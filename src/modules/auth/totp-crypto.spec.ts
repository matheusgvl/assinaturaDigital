import { randomBytes } from 'node:crypto';
import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto';

describe('TOTP secret encryption', () => {
  it('encrypts and decrypts without persisting the plaintext', () => {
    const masterKey = randomBytes(32);
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const encrypted = encryptTotpSecret(secret, masterKey);

    expect(encrypted.encryptedSecret.toString('utf8')).not.toBe(secret);
    expect(decryptTotpSecret(encrypted, masterKey)).toBe(secret);
  });

  it('rejects an altered authentication tag', () => {
    const encrypted = encryptTotpSecret('secret', randomBytes(32));
    encrypted.authTag[0] ^= 0xff;
    expect(() => decryptTotpSecret(encrypted, randomBytes(32))).toThrow();
  });

  it('requires an AES-256 key', () => {
    expect(() => encryptTotpSecret('secret', randomBytes(16))).toThrow();
  });
});
