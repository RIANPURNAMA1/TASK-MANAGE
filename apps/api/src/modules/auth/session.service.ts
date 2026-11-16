import { randomUUID } from 'node:crypto';
import { prisma, type DeviceType } from '@nexus/db';
import type { SessionDTO } from '@nexus/shared';
import { config } from '../../config/env';
import { safeEqual, sha256 } from '../../lib/crypto';
import { notFound } from '../../lib/errors';
import { realtime } from '../../realtime/emitter';
import { createRefreshToken, parseRefreshToken } from './token.service';

export interface DeviceInfo {
  deviceType: DeviceType;
  deviceName: string;
  ipAddress: string | null;
}

const refreshExpiry = () => new Date(Date.now() + config.refreshTokenTtlDays * 24 * 3600 * 1000);

export async function createSession(userId: string, device: DeviceInfo) {
  // The id is generated up front because the refresh token embeds it.
  const sessionId = randomUUID();
  const { token, secret } = createRefreshToken(sessionId);
  await prisma.session.create({
    data: { id: sessionId, userId, ...device, refreshTokenHash: sha256(secret), expiresAt: refreshExpiry() },
  });
  return { sessionId, refreshToken: token };
}

/**
 * Rotates a refresh token. Returns null for an unknown/expired/revoked session.
 * Presenting a stale secret (outside the short race grace window) means the token
 * leaked: the whole session is revoked (reuse detection, PRD §8).
 */
export async function rotateSession(rawToken: string | undefined, ipAddress: string | null) {
  const parsed = parseRefreshToken(rawToken);
  if (!parsed) return null;

  const session = await prisma.session.findUnique({
    where: { id: parsed.sessionId },
    include: { user: { select: { deactivatedAt: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.deactivatedAt) {
    return null;
  }

  const presented = sha256(parsed.secret);
  const isCurrent = safeEqual(presented, session.refreshTokenHash);
  const withinGrace =
    session.previousTokenHash !== null &&
    session.rotatedAt !== null &&
    Date.now() - session.rotatedAt.getTime() < config.refreshGraceSeconds * 1000 &&
    safeEqual(presented, session.previousTokenHash);

  if (!isCurrent && !withinGrace) {
    await revokeSession(session.id);
    return null;
  }

  const { token, secret } = createRefreshToken(session.id);
  await prisma.session.update({
    where: { id: session.id },
    data: {
      previousTokenHash: session.refreshTokenHash,
      refreshTokenHash: sha256(secret),
      rotatedAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: refreshExpiry(),
      ipAddress,
    },
  });
  return { userId: session.userId, sessionId: session.id, refreshToken: token };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  realtime.revokeSession(sessionId);
}

export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, ...(exceptSessionId && { id: { not: exceptSessionId } }) },
    select: { id: true },
  });
  await prisma.session.updateMany({
    where: { id: { in: sessions.map((s) => s.id) } },
    data: { revokedAt: new Date() },
  });
  sessions.forEach((s) => realtime.revokeSession(s.id));
}

export async function listSessions(userId: string, currentSessionId: string): Promise<SessionDTO[]> {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
  });
  return sessions.map((s) => ({
    id: s.id,
    deviceType: s.deviceType,
    deviceName: s.deviceName,
    ipAddress: s.ipAddress,
    lastUsedAt: s.lastUsedAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    isCurrent: s.id === currentSessionId,
  }));
}

export async function revokeOwnSession(userId: string, sessionId: string): Promise<void> {
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId, revokedAt: null } });
  if (!session) throw notFound('Sesi');
  await revokeSession(session.id);
}

/** "Chrome di Windows" — readable label from the User-Agent; desktop clients send their own. */
export function describeDevice(userAgent: string | undefined, desktopHeader: string | undefined): Omit<DeviceInfo, 'ipAddress'> {
  if (desktopHeader) return { deviceType: 'DESKTOP', deviceName: desktopHeader.slice(0, 100) };
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'perangkat tidak dikenal';
  return { deviceType: 'WEB', deviceName: `${browser} di ${os}` };
}
