import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL-safe random secret with 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Tokens we hand out (refresh, reset, verification, invitation) are high-entropy,
 * so a fast hash is sufficient — unlike passwords, which use argon2id.
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
