import { prisma } from '@nexus/db';
import type { Actor } from '../access/actor';
import { verifyAccessToken } from './token.service';

/**
 * Turns an access token into an Actor. Besides the JWT signature we check the session
 * and user on every call, so logout-from-device, deactivation and role changes take
 * effect immediately instead of after the 15-minute token lifetime.
 */
export async function resolveActor(accessToken: string | undefined): Promise<Actor | null> {
  if (!accessToken) return null;
  const claims = await verifyAccessToken(accessToken);
  if (!claims) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sessionId },
    select: {
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          deactivatedAt: true,
          orgMemberships: { select: { orgId: true, role: true }, take: 1 },
        },
      },
    },
  });

  if (
    !session ||
    session.userId !== claims.userId ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    session.user.deactivatedAt
  ) {
    return null;
  }

  // Single-tenant deployment (PRD §1): every user belongs to exactly one organization.
  const membership = session.user.orgMemberships[0];
  if (!membership) return null;

  return {
    userId: claims.userId,
    sessionId: claims.sessionId,
    orgId: membership.orgId,
    orgRole: membership.role,
  };
}
