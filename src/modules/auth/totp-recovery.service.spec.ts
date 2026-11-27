import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './totp-recovery.service';

describe('TOTP recovery codes', () => {
  it('generates ten high-entropy display codes with a strict format', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(codes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/),
      ]),
    );
    expect(new Set(codes).size).toBe(10);
  });

  it('normalizes input but persists only the SHA-256 digest', () => {
    const code = 'A1B2-C3D4-E5F6-0123-4567';
    expect(normalizeRecoveryCode(code)).toBe('A1B2C3D4E5F601234567');
    expect(hashRecoveryCode(normalizeRecoveryCode(code)!)).toHaveLength(64);
    expect(normalizeRecoveryCode('short')).toBeUndefined();
  });
});
