import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Accepts a 32-byte key as 64 hex chars or base64. Throws when it is missing or the wrong size. */
export function parseEncryptionKey(value: string | undefined): Buffer {
  if (!value) throw new Error('AGENT_ENCRYPTION_KEY belum diatur.');
  const key = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('AGENT_ENCRYPTION_KEY harus 32 byte (64 karakter hex atau base64).');
  return key;
}

/** AES-256-GCM. Output: `v1.<iv>.<tag>.<ciphertext>` (base64url), authenticated. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Format data terenkripsi tidak dikenal.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
