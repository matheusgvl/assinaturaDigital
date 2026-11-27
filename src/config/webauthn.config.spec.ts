import { resolveWebAuthnConfig } from './webauthn.config';

describe('WebAuthn relying party configuration', () => {
  it('supports the existing local frontend without extra settings', () => {
    expect(resolveWebAuthnConfig({})).toEqual({
      rpId: 'localhost',
      origins: ['http://localhost:5173'],
    });
  });

  it('accepts an explicit HTTPS origin on the exact frontend domain', () => {
    expect(
      resolveWebAuthnConfig({
        WEBAUTHN_RP_ID: 'assinatura.example.org',
        WEBAUTHN_ORIGINS: 'https://assinatura.example.org',
      }),
    ).toEqual({
      rpId: 'assinatura.example.org',
      origins: ['https://assinatura.example.org'],
    });
  });

  it.each([
    ['example.org', 'https://app.example.org'],
    ['app.example.org', 'https://other.example.org'],
    ['app.example.org', 'http://app.example.org'],
    ['app.example.org', 'https://app.example.org/path'],
    ['app.example.org', 'https://name@app.example.org'],
    ['app.example.org', '*'],
    ['localhost:5173', 'http://localhost:5173'],
    ['localhost', 'http://127.0.0.1:5173'],
    ['localhost', ''],
  ])('rejects an incompatible RP/origin pair (%s, %s)', (rpId, origins) => {
    expect(() =>
      resolveWebAuthnConfig({
        WEBAUTHN_RP_ID: rpId,
        WEBAUTHN_ORIGINS: origins,
      }),
    ).toThrow('WebAuthn requires an exact RP ID');
  });
});
