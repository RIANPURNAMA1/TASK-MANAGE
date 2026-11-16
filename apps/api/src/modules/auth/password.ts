import { hash, verify } from '@node-rs/argon2';

/** argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1). */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * A real hash to compare against when the account does not exist, so login timing
 * does not reveal which emails are registered.
 */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('timing-attack-mitigation-dummy');
  return dummyHash;
}
