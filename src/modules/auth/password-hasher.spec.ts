import {
  ARGON2ID_OPTIONS,
  hashPassword,
  verifyPassword,
} from './password-hasher';

describe('Argon2id password hashing', () => {
  jest.setTimeout(30000);

  it('uses Argon2id with the required RFC 9106 parameters', async () => {
    const password = 'Strong-password9';
    const passwordHash = await hashPassword(password);

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).toMatch(/\$m=65536,t=3,p=4\$/);
    expect(passwordHash).not.toContain(password);
    expect(ARGON2ID_OPTIONS).toMatchObject({
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  });

  it('verifies the original password and rejects a different one', async () => {
    const passwordHash = await hashPassword('Strong-password9');

    await expect(verifyPassword('Strong-password9', passwordHash)).resolves.toBe(
      true,
    );
    await expect(verifyPassword('Wrong-password9', passwordHash)).resolves.toBe(
      false,
    );
  });

  it('does not accept non-Argon2id or malformed hashes', async () => {
    await expect(
      verifyPassword('Strong-password9', '$2b$10$not-a-bcrypt-hash'),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('Strong-password9', '$argon2id$malformed'),
    ).resolves.toBe(false);
  });
});
