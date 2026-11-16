import {
  desktopExchangeSchema,
  emailOnlySchema,
  googleStartQuerySchema,
  loginSchema,
  refreshTokenBodySchema,
  resetPasswordSchema,
  setupSchema,
  tokenSchema,
  type AppMeta,
} from '@nexus/shared';
import { Router } from 'express';
import { config, env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { actorOf, clientIp, param, parseBody, parseQuery } from '../../lib/http';
import { logger } from '../../lib/logger';
import { authenticate } from '../../middleware/authenticate';
import {
  forgotPassword,
  isSetupRequired,
  login,
  resendVerification,
  resetPassword,
  setupOrganization,
  verifyEmail,
} from './auth.service';
import { DESKTOP_SCHEME, desktopHandoffPage, issueDesktopLoginCode, redeemDesktopLoginCode } from './desktop-login.service';
import { deviceOf, issueAuth } from './issue-auth';
import {
  clearOAuthCookie,
  clearRefreshCookie,
  readOAuthCookie,
  readRefreshCookie,
  setOAuthCookie,
  setRefreshCookie,
} from './cookies';
import { completeGoogleLogin, parseOAuthCookie, startGoogleLogin, verifyGoogleUser } from './google.service';
import {
  listSessions,
  revokeOwnSession,
  revokeSession,
  revokeUserSessions,
  rotateSession,
} from './session.service';
import { parseRefreshToken } from './token.service';

export const authRouter = Router();

const GOOGLE_ERROR_CODES = new Set(['not_invited', 'deactivated', 'unverified_email', 'google_error']);

// ─── system ───────────────────────────────────────────────────────────

authRouter.get('/meta', async (_req, res) => {
  const meta: AppMeta = {
    minDesktopVersion: env.MIN_DESKTOP_VERSION,
    googleEnabled: config.googleEnabled,
    setupRequired: await isSetupRequired(),
  };
  res.json(meta);
});

authRouter.post('/setup', async (req, res) => {
  const result = await setupOrganization(parseBody(setupSchema, req), deviceOf(req));
  res.status(201).json(await issueAuth(req, res, result));
});

// ─── password auth ────────────────────────────────────────────────────

authRouter.post('/auth/login', async (req, res) => {
  const result = await login(parseBody(loginSchema, req), deviceOf(req));
  res.json(await issueAuth(req, res, result));
});

/** Web: httpOnly cookie. Desktop: `{ refreshToken }` in the body (from the OS keychain). */
function presentedRefreshToken(req: Parameters<typeof readRefreshCookie>[0]): string | undefined {
  return readRefreshCookie(req) ?? parseBody(refreshTokenBodySchema, req).refreshToken;
}

authRouter.post('/auth/refresh', async (req, res) => {
  const rotated = await rotateSession(presentedRefreshToken(req), clientIp(req));
  if (!rotated) {
    clearRefreshCookie(res);
    throw new AppError(401, 'UNAUTHENTICATED', 'Sesi berakhir, silakan login kembali');
  }
  res.json(await issueAuth(req, res, rotated));
});

authRouter.post('/auth/logout', async (req, res) => {
  const parsed = parseRefreshToken(presentedRefreshToken(req));
  if (parsed) await revokeSession(parsed.sessionId);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post('/auth/verify-email', async (req, res) => {
  await verifyEmail(parseBody(tokenSchema, req).token);
  res.status(204).end();
});

authRouter.post('/auth/resend-verification', async (req, res) => {
  await resendVerification(parseBody(emailOnlySchema, req).email);
  res.status(204).end();
});

authRouter.post('/auth/forgot-password', async (req, res) => {
  await forgotPassword(parseBody(emailOnlySchema, req).email);
  res.status(204).end();
});

authRouter.post('/auth/reset-password', async (req, res) => {
  await resetPassword(parseBody(resetPasswordSchema, req));
  res.status(204).end();
});

// ─── Google SSO (Authorization Code + PKCE) ───────────────────────────

authRouter.get('/auth/google/start', (req, res) => {
  if (!config.googleEnabled) throw new AppError(404, 'NOT_FOUND', 'Login Google tidak aktif');
  const query = parseQuery(googleStartQuerySchema, req);
  if (query.client === 'desktop' && (!query.challenge || !query.state)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Parameter login desktop tidak lengkap');
  }
  const { url, cookieValue } = startGoogleLogin(
    query.client === 'desktop' ? { challenge: query.challenge!, state: query.state! } : undefined,
  );
  setOAuthCookie(res, cookieValue);
  res.redirect(url);
});

authRouter.get('/auth/google/callback', async (req, res) => {
  const stored = parseOAuthCookie(readOAuthCookie(req));
  clearOAuthCookie(res);
  const desktop = stored?.desktop;

  // Desktop: hand control back to the app through its deep link (never a token in the URL).
  const toApp = (params: Record<string, string>) => {
    const link = `${DESKTOP_SCHEME}://auth/callback?${new URLSearchParams({ ...params, state: desktop!.state }).toString()}`;
    res.type('html').send(desktopHandoffPage(link, 'code' in params));
  };
  const fail = (reason: string) =>
    desktop ? toApp({ error: reason }) : res.redirect(`${env.WEB_URL}/auth/callback?error=${encodeURIComponent(reason)}`);

  const { code, state } = req.query;
  if (!stored || typeof code !== 'string' || typeof state !== 'string' || state !== stored.state) {
    return fail('state_mismatch');
  }

  try {
    if (desktop) {
      const userId = await verifyGoogleUser(code, stored.verifier);
      return toApp({ code: await issueDesktopLoginCode(userId, desktop.challenge) });
    }
    const result = await completeGoogleLogin(code, stored.verifier, deviceOf(req));
    setRefreshCookie(res, result.refreshToken);
    return res.redirect(`${env.WEB_URL}/auth/callback`);
  } catch (err) {
    if (err instanceof AppError && GOOGLE_ERROR_CODES.has(err.message)) return fail(err.message);
    logger.error({ err }, 'google login failed');
    return fail('google_error');
  }
});

/** Desktop redeems the one-time code from `taskapp://auth/callback` with its PKCE verifier. */
authRouter.post('/auth/google/desktop-exchange', async (req, res) => {
  const { code, verifier } = parseBody(desktopExchangeSchema, req);
  res.json(await issueAuth(req, res, await redeemDesktopLoginCode(code, verifier, deviceOf(req))));
});

// ─── sessions (FR-04) ─────────────────────────────────────────────────

authRouter.get('/auth/sessions', authenticate, async (req, res) => {
  const actor = actorOf(req);
  res.json(await listSessions(actor.userId, actor.sessionId));
});

authRouter.delete('/auth/sessions/:id', authenticate, async (req, res) => {
  await revokeOwnSession(actorOf(req).userId, param(req, 'id'));
  res.status(204).end();
});

authRouter.delete('/auth/sessions', authenticate, async (req, res) => {
  const actor = actorOf(req);
  await revokeUserSessions(actor.userId, actor.sessionId);
  res.status(204).end();
});
