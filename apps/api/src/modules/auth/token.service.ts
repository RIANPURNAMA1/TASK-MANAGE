import { SignJWT, jwtVerify } from 'jose';
import { config, env } from '../../config/env';
import { randomToken } from '../../lib/crypto';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = 'nexustask';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/** Short-lived (15 min) JWT kept only in client memory (PRD §8). */
export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

/**
 * Refresh tokens are `<sessionId>.<secret>`. Embedding the session id lets us find the
 * session in O(1) and detect reuse of an older secret for that same session.
 */
export function createRefreshToken(sessionId: string): { token: string; secret: string } {
  const secretPart = randomToken();
  return { token: `${sessionId}.${secretPart}`, secret: secretPart };
}

export function parseRefreshToken(token: string | undefined): { sessionId: string; secret: string } | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  return { sessionId: token.slice(0, dot), secret: token.slice(dot + 1) };
}
