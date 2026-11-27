import { canAdvancePasskeyCounter } from './passkey-counter';

describe('REQ-08 WebAuthn counters', () => {
  it.each([[0, 0], [0, 1], [4, 5], [0, 0xffffffff]])(
    'accepts %i → %i',
    (stored, received) =>
      expect(canAdvancePasskeyCounter(stored, received)).toBe(true),
  );

  it.each([[1, 1], [5, 4], [1, 0], [-1, 1], [0, -1], [0, 0x100000000], [0, 1.5]])(
    'rejects %i → %i',
    (stored, received) =>
      expect(canAdvancePasskeyCounter(stored, received)).toBe(false),
  );
});
