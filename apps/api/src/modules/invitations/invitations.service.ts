import { prisma, toUserSummary, userSummarySelect, type Prisma } from '@nexus/db';
import {
  canAssignOrgRole,
  type AcceptInvitationInput,
  type CreateInvitationInput,
  type CreateInvitationResponse,
  type InvitationDTO,
  type InvitationPreview,
} from '@nexus/shared';
import { config, env } from '../../config/env';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors';
import { enqueueEmail } from '../../lib/queue';
import type { Actor } from '../access/actor';
import { sendVerificationEmail } from '../auth/auth.service';
import { hashPassword } from '../auth/password';
import { createSession, type DeviceInfo } from '../auth/session.service';
import { writeAudit } from '../admin/audit';

const invitationInclude = {
  division: { select: { name: true } },
  invitedBy: { select: userSummarySelect },
} satisfies Prisma.InvitationInclude;

type InvitationRow = Prisma.InvitationGetPayload<{ include: typeof invitationInclude }>;

function toDTO(row: InvitationRow): InvitationDTO {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    divisionName: row.division?.name ?? null,
    invitedBy: toUserSummary(row.invitedBy),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const invalidInvitation = () =>
  new AppError(400, 'TOKEN_INVALID', 'Undangan tidak valid atau sudah kedaluwarsa');

/** Email invitations are single-use; link invitations stay usable until they expire. */
async function findUsableInvitation(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { ...invitationInclude, organization: { select: { name: true } } },
  });
  if (
    !invitation ||
    invitation.revokedAt ||
    invitation.expiresAt < new Date() ||
    (invitation.email && invitation.acceptedAt)
  ) {
    throw invalidInvitation();
  }
  return invitation;
}

export async function createInvitation(actor: Actor, input: CreateInvitationInput, ipAddress: string | null): Promise<CreateInvitationResponse> {
  const role = input.role ?? 'MEMBER';
  if (!canAssignOrgRole(actor.orgRole, role)) throw forbidden('Anda tidak bisa mengundang dengan role tersebut');

  if (input.email && (await prisma.user.findUnique({ where: { email: input.email } }))) {
    throw conflict('Email tersebut sudah terdaftar');
  }
  if (input.divisionId) {
    const division = await prisma.division.findFirst({ where: { id: input.divisionId, orgId: actor.orgId, archivedAt: null } });
    if (!division) throw notFound('Divisi');
  }

  const token = randomToken();
  const invitation = await prisma.invitation.create({
    data: {
      orgId: actor.orgId,
      email: input.email ?? null,
      role,
      divisionId: input.divisionId ?? null,
      invitedById: actor.userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 3600 * 1000),
    },
    include: invitationInclude,
  });

  const link = `${env.WEB_URL}/invite/${token}`;
  if (invitation.email) await enqueueEmail({ kind: 'invitation', invitationId: invitation.id, link });
  await writeAudit(actor, 'invitation.created', 'Invitation', invitation.id, { email: invitation.email, role }, ipAddress);

  return { invitation: toDTO(invitation), link };
}

export async function listInvitations(actor: Actor): Promise<InvitationDTO[]> {
  const rows = await prisma.invitation.findMany({
    where: { orgId: actor.orgId },
    include: invitationInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toDTO);
}

export async function revokeInvitation(actor: Actor, id: string, ipAddress: string | null): Promise<void> {
  const { count } = await prisma.invitation.updateMany({
    where: { id, orgId: actor.orgId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw notFound('Undangan');
  await writeAudit(actor, 'invitation.revoked', 'Invitation', id, {}, ipAddress);
}

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const invitation = await findUsableInvitation(token);
  return {
    organizationName: invitation.organization.name,
    email: invitation.email,
    role: invitation.role,
    divisionName: invitation.division?.name ?? null,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

/**
 * Creates the account. An email invitation proves ownership of that address, so the
 * user is verified and signed in immediately. A link invitation requires verifying
 * the email the person typed before they can log in.
 */
export async function acceptInvitation(token: string, input: AcceptInvitationInput, device: DeviceInfo) {
  const invitation = await findUsableInvitation(token);
  const email = invitation.email ?? input.email;
  if (!email) throw new AppError(400, 'VALIDATION_ERROR', 'Email wajib diisi');
  if (await prisma.user.findUnique({ where: { email } })) {
    throw conflict('Email sudah terdaftar, silakan login');
  }

  const isEmailInvite = invitation.email !== null;
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    if (isEmailInvite) {
      // Conditional update makes acceptance single-use even under concurrent requests.
      const { count } = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) throw invalidInvitation();
    }
    const created = await tx.user.create({
      data: {
        email,
        name: input.name,
        passwordHash,
        emailVerifiedAt: isEmailInvite || !config.requireEmailVerification ? new Date() : null,
      },
    });
    await tx.orgMember.create({ data: { orgId: invitation.orgId, userId: created.id, role: invitation.role } });
    if (invitation.divisionId && invitation.role !== 'GUEST') {
      await tx.divisionMember.create({ data: { divisionId: invitation.divisionId, userId: created.id } });
    }
    return created;
  });

  if (!isEmailInvite && config.requireEmailVerification) {
    await sendVerificationEmail(user.id);
    return { userId: user.id, session: null };
  }
  return { userId: user.id, session: await createSession(user.id, device) };
}
