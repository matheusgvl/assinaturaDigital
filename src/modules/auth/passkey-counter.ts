import { EntityManager, IsNull } from 'typeorm';
import { Passkey } from './entities/passkey.entity';

const MAX_COUNTER = 0xffffffff;

/** Aplica REQ-08 a contadores uint32, inclusive autenticadores sem contador. */
export function canAdvancePasskeyCounter(stored: number, received: number): boolean {
  const isCounter = (value: number) =>
    Number.isInteger(value) && value >= 0 && value <= MAX_COUNTER;
  return (
    isCounter(stored) &&
    isCounter(received) &&
    ((stored === 0 && received === 0) || received > stored)
  );
}

/** Atualiza somente a versão verificada da credencial ainda ativa. */
export async function advancePasskeyCounter(
  manager: EntityManager,
  current: Readonly<Pick<Passkey, 'id' | 'counter'>>,
  received: number,
  usedAt: Date,
): Promise<boolean> {
  if (!canAdvancePasskeyCounter(Number(current.counter), received)) return false;
  const result = await manager.getRepository(Passkey).update(
    { id: current.id, counter: current.counter, revokedAt: IsNull() },
    { counter: String(received), lastUsedAt: usedAt },
  );
  return result.affected === 1;
}
