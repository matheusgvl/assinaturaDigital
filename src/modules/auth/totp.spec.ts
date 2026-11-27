import { createOtpAuthUri, generateTotpCode, verifyTotp } from './totp';

// Vetores RFC 6238 com o segredo ASCII 12345678901234567890.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP RFC 6238', () => {
  it.each([
    [59_000, '287082'],
    [1_111_111_109_000, '081804'],
    [1_234_567_890_000, '005924'],
  ])('calcula o vetor de seis digitos em %d ms', (timestamp, expected) => {
    expect(generateTotpCode(RFC_SECRET, timestamp)).toBe(expected);
  });

  it('aceita a janela anterior e posterior, mas rejeita código expirado', () => {
    const timestamp = 90_000;
    expect(
      verifyTotp(RFC_SECRET, generateTotpCode(RFC_SECRET, 60_000), timestamp),
    ).toBe(true);
    expect(
      verifyTotp(RFC_SECRET, generateTotpCode(RFC_SECRET, 120_000), timestamp),
    ).toBe(true);
    expect(
      verifyTotp(RFC_SECRET, generateTotpCode(RFC_SECRET, 30_000), 150_000),
    ).toBe(false);
  });

  it('rejeita formato inválido e códigos incorretos', () => {
    expect(verifyTotp(RFC_SECRET, '12345', 59_000)).toBe(false);
    expect(verifyTotp(RFC_SECRET, '000000', 59_000)).toBe(false);
  });

  it('produz URI otpauth sem devolver uma chave diferente do segredo', () => {
    const uri = createOtpAuthUri(RFC_SECRET, 'ana@example.com');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain('period=30');
    expect(uri).toContain('digits=6');
  });
});
