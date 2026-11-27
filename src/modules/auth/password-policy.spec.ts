import {
  PASSWORD_POLICY,
  passwordPolicyError,
  validatePasswordPolicy,
} from './password-policy';

describe('password policy', () => {
  it('accepts a password meeting every required rule', () => {
    expect(() => validatePasswordPolicy('Strong-password9')).not.toThrow();
  });

  it.each([
    'shortA1!',
    'lowercase-only-password1!',
    'UPPERCASE-ONLY-PASSWORD1!',
    'NoNumber-password!',
    'NoSymbolPassword9',
    123456789012,
    undefined,
  ])('rejects a password that does not meet the policy', (password) => {
    expect(() => validatePasswordPolicy(password)).toThrow(passwordPolicyError);
  });

  it('exposes only non-sensitive policy metadata', () => {
    expect(PASSWORD_POLICY).toEqual({
      minimumLength: 12,
      requiresUppercase: true,
      requiresLowercase: true,
      requiresNumber: true,
      requiresSymbol: true,
    });
  });
});
