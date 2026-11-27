export const PASSWORD_POLICY = {
  minimumLength: 12,
  requiresUppercase: true,
  requiresLowercase: true,
  requiresNumber: true,
  requiresSymbol: true,
} as const;

export const passwordPolicyError =
  'Password does not meet the security policy';

/** Validates password creation input without returning the failed rule. */
export function validatePasswordPolicy(password: unknown): void {
  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_POLICY.minimumLength ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error(passwordPolicyError);
  }
}
