import argon2 from 'argon2';
import { validatePasswordPolicy } from './password-policy';

export const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
} as const;

/** Hashes a password using the parameters required by REQ-02. */
export async function hashPassword(password: string): Promise<string> {
  validatePasswordPolicy(password);
  return argon2.hash(password, ARGON2ID_OPTIONS);
}

/** Verifies only Argon2id hashes and fails closed for malformed input. */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (
    typeof password !== 'string' ||
    typeof passwordHash !== 'string' ||
    !passwordHash.startsWith('$argon2id$')
  ) {
    return false;
  }

  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
