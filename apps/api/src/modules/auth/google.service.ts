import { createHash } from 'node:crypto';
import { prisma } from '@nexus/db';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { env } from '../../config/env';
import { randomToken } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { createSession, type DeviceInfo } from './session.service';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const oauthStateSchema = z.object({
  state: z.string(),
  verifier: z.string(),
  /** Present when the login was started by the desktop app (its own PKCE challenge + state). */
  desktop: z.object({ challenge: z.string(), state: z.string() }).optional(),
});
export type OAuthState = z.infer<typeof oauthStateSchema>;

/** Builds the Google consent URL with a fresh state and PKCE (S256) challenge. */
export function startGoogleLogin(desktop?: OAuthState['desktop']): { url: string; cookieValue: string } {
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  return { url: url.toString(), cookieValue: JSON.stringify({ state, verifier, desktop } satisfies OAuthState) };
}

export function parseOAuthCookie(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    return oauthStateSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

const tokenResponseSchema = z.object({ id_token: z.string() });

async function exchangeCode(code: string, verifier: string): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) throw new AppError(401, 'TOKEN_INVALID', 'google_error');
  return tokenResponseSchema.parse(await response.json()).id_token;
}

/**
 * Error messages thrown here are stable codes the web app maps to text
 * (`/auth/callback?error=<code>`).
 *
 * Completes Google SSO. This is an internal tool: Google can only sign in people who
 * already have an account (created via invitation) — it never self-registers anyone.
 */
export async function completeGoogleLogin(code: string, verifier: string, device: DeviceInfo) {
  const userId = await verifyGoogleUser(code, verifier);
  const session = await createSession(userId, device);
  return { userId, ...session };
}

/** Exchanges the Google code and returns the matching (invited, active) user id. */
export async function verifyGoogleUser(code: string, verifier: string): Promise<string> {
  const idToken = await exchangeCode(code, verifier);
  const { payload } = await jwtVerify(idToken, googleKeys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID,
  });

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  if (!email || payload.email_verified !== true || typeof payload.sub !== 'string') {
    throw new AppError(401, 'TOKEN_INVALID', 'unverified_email');
  }

  const user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });
  if (!user) throw new AppError(403, 'FORBIDDEN', 'not_invited');
  if (user.deactivatedAt) throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'deactivated');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      googleId: payload.sub,
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      avatarUrl: user.avatarUrl ?? (typeof payload.picture === 'string' ? payload.picture : null),
    },
  });

  return user.id;
}
