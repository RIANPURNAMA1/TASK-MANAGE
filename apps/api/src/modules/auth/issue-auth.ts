import type { AuthResponse } from '@nexus/shared';
import type { Request, Response } from 'express';
import { config } from '../../config/env';
import { clientIp } from '../../lib/http';
import { loadMe } from '../users/users.service';
import { setRefreshCookie } from './cookies';
import { describeDevice, type DeviceInfo } from './session.service';
import { signAccessToken } from './token.service';

const DESKTOP_HEADER = 'x-desktop-device';

/** The desktop app identifies itself with a device label header (PRD §4). */
export function isDesktopClient(req: Request): boolean {
  const value = req.headers[DESKTOP_HEADER];
  return typeof value === 'string' && value.length > 0;
}

export function deviceOf(req: Request): DeviceInfo {
  const desktop = req.headers[DESKTOP_HEADER];
  return {
    ...describeDevice(req.headers['user-agent'], typeof desktop === 'string' ? desktop : undefined),
    ipAddress: clientIp(req),
  };
}

/**
 * Returns the in-memory access token + profile and hands over the rotating refresh token:
 * as an httpOnly cookie for the web, in the body for desktop (stored in the OS keychain).
 */
export async function issueAuth(
  req: Request,
  res: Response,
  auth: { userId: string; sessionId: string; refreshToken: string },
): Promise<AuthResponse> {
  const desktop = isDesktopClient(req);
  if (!desktop) setRefreshCookie(res, auth.refreshToken);
  return {
    accessToken: await signAccessToken({ userId: auth.userId, sessionId: auth.sessionId }),
    expiresIn: config.accessTokenTtlSeconds,
    user: await loadMe(auth.userId),
    ...(desktop && { refreshToken: auth.refreshToken }),
  };
}
