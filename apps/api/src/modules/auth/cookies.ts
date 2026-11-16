import type { CookieOptions, Request, Response } from 'express';
import { config } from '../../config/env';

export const REFRESH_COOKIE = 'nt_refresh';
export const OAUTH_COOKIE = 'nt_oauth';

const AUTH_PATH = `${config.apiPrefix}/auth`;

const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  // Strict: the refresh endpoint is only ever called by our own SPA (PRD §4: httpOnly cookie on web).
  sameSite: 'strict',
  path: AUTH_PATH,
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions,
    maxAge: config.refreshTokenTtlDays * 24 * 3600 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions);
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

/** Short-lived, signed cookie carrying OAuth state + PKCE verifier between start and callback. */
export function setOAuthCookie(res: Response, value: string): void {
  // Lax: the callback is a top-level navigation coming back from Google.
  res.cookie(OAUTH_COOKIE, value, { ...baseOptions, sameSite: 'lax', signed: true, maxAge: 10 * 60 * 1000 });
}

export function readOAuthCookie(req: Request): string | undefined {
  const value: unknown = req.signedCookies?.[OAUTH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

export function clearOAuthCookie(res: Response): void {
  res.clearCookie(OAUTH_COOKIE, { ...baseOptions, sameSite: 'lax', signed: true });
}
