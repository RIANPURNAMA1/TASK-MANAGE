import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createRefreshToken, parseRefreshToken, signAccessToken, verifyAccessToken } from './token.service';

describe('access tokens', () => {
  it('round-trips user and session ids', async () => {
    const token = await signAccessToken({ userId: 'u1', sessionId: 's1' });
    expect(await verifyAccessToken(token)).toEqual({ userId: 'u1', sessionId: 's1' });
  });

  it('rejects tampered tokens', async () => {
    const token = await signAccessToken({ userId: 'u1', sessionId: 's1' });
    const [header, payload, signature] = token.split('.');
    const forged = `${header}.${payload}x.${signature}`;
    expect(await verifyAccessToken(forged)).toBeNull();
  });

  it('rejects tokens signed with another secret', async () => {
    const foreign = await new SignJWT({ sid: 's1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuer('nexustask')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('a-completely-different-secret-value-123'));
    expect(await verifyAccessToken(foreign)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const { env } = await import('../../config/env');
    const expired = await new SignJWT({ sid: 's1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuer('nexustask')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
    expect(await verifyAccessToken(expired)).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('embeds the session id', () => {
    const { token, secret } = createRefreshToken('session-123');
    expect(parseRefreshToken(token)).toEqual({ sessionId: 'session-123', secret });
  });

  it('produces a fresh secret every time', () => {
    expect(createRefreshToken('s').secret).not.toBe(createRefreshToken('s').secret);
  });

  it.each([undefined, '', 'nodot', '.secret', 'session.'])('rejects malformed token %j', (value) => {
    expect(parseRefreshToken(value)).toBeNull();
  });
});
