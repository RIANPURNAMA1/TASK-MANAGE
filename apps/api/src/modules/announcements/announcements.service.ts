import { prisma, toUserSummary, userSummarySelect, type Prisma, type Tx } from '@nexus/db';
import {
  isOrgAdmin,
  type AnnouncementCommentDTO,
  type AnnouncementCommentInput,
  type AnnouncementDetail,
  type AnnouncementListQuery,
  type AnnouncementPage,
  type AnnouncementScope,
  type AnnouncementSummary,
  type AnnouncementTargets,
  type CreateAnnouncementInput,
  type UpdateAnnouncementInput,
} from '@nexus/shared';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { sanitizeRichText } from '../../lib/sanitize';
import { transactional, type AfterCommit } from '../../lib/transaction';
import { realtime } from '../../realtime/emitter';
import type { Actor } from '../access/actor';
import { visibleProjectsWhere } from '../access/access.service';
import { notify } from '../notifications/notifications.service';

/**
 * Announcements (FR-35) at company, division or project level, with comments and
 * pinning (FR-36).
 *
 * Who sees what:
 *   ORGANIZATION → every member except guests
 *   DIVISION     → members of that division (and org admins)
 *   PROJECT      → whoever can view the project (guests included when invited)
 * Who may post / pin / manage: org admins anywhere; division leads in their division
 * and its projects; project admins in their project. Authors may always edit/delete.
 */

// ─── Facts about the caller ───────────────────────────────────────────

interface Facts {
  admin: boolean;
  leadDivisionIds: Set<string>;
  adminProjectIds: Set<string>;
}

async function loadFacts(actor: Actor): Promise<Facts> {
  const admin = isOrgAdmin(actor.orgRole);
  if (admin) return { admin, leadDivisionIds: new Set(), adminProjectIds: new Set() };
  const [leads, projectAdmins] = await Promise.all([
    prisma.divisionMember.findMany({
      where: { userId: actor.userId, role: 'LEAD', division: { orgId: actor.orgId, archivedAt: null } },
      select: { divisionId: true },
    }),
    prisma.projectMember.findMany({
      where: { userId: actor.userId, role: 'ADMIN', project: { archivedAt: null, division: { orgId: actor.orgId, archivedAt: null } } },
      select: { projectId: true },
    }),
  ]);
  return {
    admin,
    leadDivisionIds: new Set(leads.map((l) => l.divisionId)),
    adminProjectIds: new Set(projectAdmins.map((p) => p.projectId)),
  };
}

function canPostTo(facts: Facts, target: { scope: AnnouncementScope; divisionId: string | null; projectDivisionId: string | null; projectId: string | null }): boolean {
  if (facts.admin) return true;
  switch (target.scope) {
    case 'ORGANIZATION':
      return false;
    case 'DIVISION':
      return target.divisionId !== null && facts.leadDivisionIds.has(target.divisionId);
    case 'PROJECT':
      return (
        (target.projectId !== null && facts.adminProjectIds.has(target.projectId)) ||
        (target.projectDivisionId !== null && facts.leadDivisionIds.has(target.projectDivisionId))
      );
  }
}

/** Prisma filter: announcements the actor may read. Mirrors the rules above. */
function visibleWhere(actor: Actor): Prisma.AnnouncementWhereInput {
  const liveTargets: Prisma.AnnouncementWhereInput = {
    OR: [{ divisionId: null }, { division: { archivedAt: null } }],
    AND: [{ OR: [{ projectId: null }, { project: { archivedAt: null } }] }],
  };
  if (isOrgAdmin(actor.orgRole)) return { orgId: actor.orgId, ...liveTargets };

  const readable: Prisma.AnnouncementWhereInput[] = [
    { scope: 'PROJECT', project: visibleProjectsWhere(actor) },
  ];
  if (actor.orgRole !== 'GUEST') {
    readable.push({ scope: 'ORGANIZATION' });
    readable.push({ scope: 'DIVISION', division: { members: { some: { userId: actor.userId } } } });
  }
  return { AND: [{ orgId: actor.orgId }, liveTargets, { OR: readable }] };
}

// ─── Mapping ──────────────────────────────────────────────────────────

const summaryInclude = (userId: string) =>
  ({
    author: { select: userSummarySelect },
    division: { select: { id: true, name: true, color: true } },
    project: { select: { id: true, name: true, color: true, divisionId: true, division: { select: { name: true } } } },
    reads: { where: { userId }, select: { userId: true } },
    _count: { select: { comments: { where: { deletedAt: null } } } },
  }) satisfies Prisma.AnnouncementInclude;

type SummaryRow = Prisma.AnnouncementGetPayload<{ include: ReturnType<typeof summaryInclude> }>;

/** Sanitized HTML → plain text for previews (input is our own sanitizer's output). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/blockquote|\/pre)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerptOf(html: string): string {
  const text = htmlToText(html);
  return text.length > 240 ? `${text.slice(0, 239).trimEnd()}…` : text;
}

function toSummary(row: SummaryRow, facts: Facts, actor: Actor): AnnouncementSummary {
  return {
    id: row.id,
    scope: row.scope,
    division: row.division,
    project: row.project
      ? { id: row.project.id, name: row.project.name, color: row.project.color, divisionName: row.project.division.name }
      : null,
    author: toUserSummary(row.author),
    title: row.title,
    excerpt: excerptOf(row.body),
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    commentCount: row._count.comments,
    isRead: row.authorId === actor.userId || row.reads.length > 0,
    canManage: canPostTo(facts, {
      scope: row.scope,
      divisionId: row.divisionId,
      projectId: row.projectId,
      projectDivisionId: row.project?.divisionId ?? null,
    }),
  };
}

function scopeLabelOf(row: { scope: AnnouncementScope; division: { name: string } | null; project: { name: string } | null }): string {
  if (row.scope === 'DIVISION' && row.division) return `Divisi ${row.division.name}`;
  if (row.scope === 'PROJECT' && row.project) return `Proyek ${row.project.name}`;
  return 'Perusahaan';
}

// ─── Audience ─────────────────────────────────────────────────────────

/** Active users the announcement is addressed to (notifications + read stats). */
async function audienceIds(
  db: Tx | typeof prisma,
  orgId: string,
  target: { scope: AnnouncementScope; divisionId: string | null; projectId: string | null },
): Promise<string[]> {
  const active = { deactivatedAt: null } satisfies Prisma.UserWhereInput;
  let where: Prisma.UserWhereInput;
  if (target.scope === 'ORGANIZATION') {
    where = { ...active, orgMemberships: { some: { orgId, role: { not: 'GUEST' } } } };
  } else if (target.scope === 'DIVISION') {
    where = { ...active, divisionMembers: { some: { divisionId: target.divisionId! } } };
  } else {
    where = { ...active, projectMembers: { some: { projectId: target.projectId! } } };
  }
  const users = await db.user.findMany({ where, select: { id: true } });
  return users.map((u) => u.id);
}

function broadcast(afterCommit: AfterCommit, userIds: string[], announcementId: string, deleted = false) {
  afterCommit(() => realtime.toUsers(userIds, 'announcement:changed', { announcementId, ...(deleted && { deleted }) }));
}

// ─── Queries ──────────────────────────────────────────────────────────

export async function listAnnouncements(actor: Actor, query: AnnouncementListQuery): Promise<AnnouncementPage> {
  const facts = await loadFacts(actor);
  const filters: Prisma.AnnouncementWhereInput[] = [visibleWhere(actor)];
  if (query.scope) filters.push({ scope: query.scope });
  if (query.unread) filters.push({ authorId: { not: actor.userId }, reads: { none: { userId: actor.userId } } });
  if (query.q) filters.push({ OR: [{ title: { contains: query.q } }, { body: { contains: query.q } }] });

  const include = summaryInclude(actor.userId);
  const [pinnedRows, rows, unreadCount] = await Promise.all([
    query.cursor
      ? Promise.resolve([] as SummaryRow[])
      : prisma.announcement.findMany({
          where: { AND: [...filters, { pinnedAt: { not: null } }] },
          include,
          orderBy: [{ pinnedAt: 'desc' }, { id: 'desc' }],
          take: 20,
        }),
    prisma.announcement.findMany({
      where: { AND: [...filters, { pinnedAt: null }] },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    }),
    countUnread(actor),
  ]);

  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit).map((r) => toSummary(r, facts, actor));
  return {
    items,
    pinned: pinnedRows.map((r) => toSummary(r, facts, actor)),
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    unreadCount,
  };
}

/** Unread = visible, not written by me, posted after I joined, never opened. */
export async function countUnread(actor: Actor): Promise<number> {
  const membership = await prisma.orgMember.findFirst({
    where: { orgId: actor.orgId, userId: actor.userId },
    select: { createdAt: true },
  });
  return prisma.announcement.count({
    where: {
      AND: [
        visibleWhere(actor),
        { authorId: { not: actor.userId } },
        { reads: { none: { userId: actor.userId } } },
        { createdAt: { gte: membership?.createdAt ?? new Date(0) } },
      ],
    },
  });
}

async function requireVisible(actor: Actor, id: string) {
  const row = await prisma.announcement.findFirst({
    where: { AND: [{ id }, visibleWhere(actor)] },
    include: {
      ...summaryInclude(actor.userId),
      pinnedBy: { select: userSummarySelect },
    },
  });
  if (!row) throw notFound('Pengumuman');
  return row;
}

export async function getAnnouncement(actor: Actor, id: string): Promise<AnnouncementDetail> {
  const [row, facts] = await Promise.all([requireVisible(actor, id), loadFacts(actor)]);
  const summary = toSummary(row, facts, actor);
  const audience = await audienceIds(prisma, actor.orgId, row);
  const audienceSet = new Set(audience);
  audienceSet.delete(row.authorId);

  const reads = await prisma.announcementRead.findMany({
    where: { announcementId: id, userId: { in: [...audienceSet] } },
    include: { user: { select: userSummarySelect } },
    orderBy: { readAt: 'asc' },
  });

  return {
    ...summary,
    body: row.body,
    pinnedBy: row.pinnedBy ? toUserSummary(row.pinnedBy) : null,
    readCount: reads.length,
    audienceCount: audienceSet.size,
    readers: summary.canManage || row.authorId === actor.userId ? reads.slice(0, 12).map((r) => toUserSummary(r.user)) : [],
  };
}

export async function markRead(actor: Actor, id: string): Promise<void> {
  await requireVisible(actor, id);
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: id, userId: actor.userId } },
    create: { announcementId: id, userId: actor.userId },
    update: {},
  });
}

export async function markAllRead(actor: Actor): Promise<void> {
  const unread = await prisma.announcement.findMany({
    where: { AND: [visibleWhere(actor), { reads: { none: { userId: actor.userId } } }] },
    select: { id: true },
    take: 1000,
  });
  if (unread.length === 0) return;
  await prisma.announcementRead.createMany({
    data: unread.map((a) => ({ announcementId: a.id, userId: actor.userId })),
    skipDuplicates: true,
  });
}

/** Divisions and projects the caller may post to (for the composer). */
export async function listTargets(actor: Actor): Promise<AnnouncementTargets> {
  const facts = await loadFacts(actor);
  const [divisions, projects] = await Promise.all([
    prisma.division.findMany({
      where: { orgId: actor.orgId, archivedAt: null, ...(facts.admin ? {} : { id: { in: [...facts.leadDivisionIds] } }) },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    }),
    prisma.project.findMany({
      where: {
        archivedAt: null,
        division: { orgId: actor.orgId, archivedAt: null },
        ...(facts.admin
          ? {}
          : { OR: [{ id: { in: [...facts.adminProjectIds] } }, { divisionId: { in: [...facts.leadDivisionIds] } }] }),
      },
      select: { id: true, name: true, color: true, division: { select: { name: true } } },
      orderBy: [{ division: { name: 'asc' } }, { name: 'asc' }],
    }),
  ]);
  return {
    organization: facts.admin,
    divisions,
    projects: projects.map((p) => ({ id: p.id, name: p.name, color: p.color, divisionName: p.division.name })),
  };
}

// ─── Mutations ────────────────────────────────────────────────────────

export async function createAnnouncement(actor: Actor, input: CreateAnnouncementInput): Promise<AnnouncementDetail> {
  const facts = await loadFacts(actor);
  const body = sanitizeRichText(input.body);
  if (!body) throw badRequest('Isi pengumuman tidak boleh kosong');

  // Resolve and validate the target inside the org (IDs from the client are never trusted).
  let divisionId: string | null = null;
  let projectId: string | null = null;
  let projectDivisionId: string | null = null;
  if (input.scope === 'DIVISION') {
    const division = await prisma.division.findFirst({ where: { id: input.divisionId, orgId: actor.orgId, archivedAt: null } });
    if (!division) throw notFound('Divisi');
    divisionId = division.id;
  } else if (input.scope === 'PROJECT') {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, archivedAt: null, division: { orgId: actor.orgId, archivedAt: null } },
    });
    if (!project) throw notFound('Proyek');
    projectId = project.id;
    projectDivisionId = project.divisionId;
  }
  if (!canPostTo(facts, { scope: input.scope, divisionId, projectId, projectDivisionId })) {
    throw forbidden('Anda tidak boleh membuat pengumuman di sini');
  }

  const id = await transactional(async (tx, afterCommit) => {
    const now = new Date();
    const created = await tx.announcement.create({
      data: {
        orgId: actor.orgId,
        scope: input.scope,
        divisionId,
        projectId,
        authorId: actor.userId,
        title: input.title,
        body,
        ...(input.pinned && { pinnedAt: now, pinnedById: actor.userId }),
        reads: { create: { userId: actor.userId } },
      },
      include: { division: { select: { name: true } }, project: { select: { name: true } } },
    });

    const audience = await audienceIds(tx, actor.orgId, created);
    await notify(
      tx,
      afterCommit,
      audience.map((userId) => ({
        userId,
        type: 'ANNOUNCEMENT' as const,
        actorId: actor.userId,
        projectId,
        data: {
          announcementId: created.id,
          announcementTitle: created.title,
          announcementKind: 'posted' as const,
          scopeLabel: scopeLabelOf(created),
          excerpt: excerptOf(body).slice(0, 160),
        },
      })),
    );
    broadcast(afterCommit, [...audience, actor.userId], created.id);
    return created.id;
  });
  return getAnnouncement(actor, id);
}

/** Loads an announcement the caller may change; authors may edit/delete their own. */
async function requireManageable(actor: Actor, id: string, allowAuthor: boolean) {
  const [row, facts] = await Promise.all([requireVisible(actor, id), loadFacts(actor)]);
  const summary = toSummary(row, facts, actor);
  if (!summary.canManage && !(allowAuthor && row.authorId === actor.userId)) throw forbidden();
  return row;
}

export async function updateAnnouncement(actor: Actor, id: string, input: UpdateAnnouncementInput): Promise<AnnouncementDetail> {
  const row = await requireManageable(actor, id, true);
  const data: Prisma.AnnouncementUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) {
    const body = sanitizeRichText(input.body);
    if (!body) throw badRequest('Isi pengumuman tidak boleh kosong');
    data.body = body;
  }
  if (Object.keys(data).length === 0) return getAnnouncement(actor, id);

  await transactional(async (tx, afterCommit) => {
    await tx.announcement.update({ where: { id }, data: { ...data, editedAt: new Date() } });
    broadcast(afterCommit, [...(await audienceIds(tx, actor.orgId, row)), row.authorId], id);
  });
  return getAnnouncement(actor, id);
}

export async function setPinned(actor: Actor, id: string, pinned: boolean): Promise<AnnouncementDetail> {
  const row = await requireManageable(actor, id, false);
  await transactional(async (tx, afterCommit) => {
    await tx.announcement.update({
      where: { id },
      data: pinned ? { pinnedAt: new Date(), pinnedById: actor.userId } : { pinnedAt: null, pinnedById: null },
    });
    broadcast(afterCommit, [...(await audienceIds(tx, actor.orgId, row)), row.authorId], id);
  });
  return getAnnouncement(actor, id);
}

export async function deleteAnnouncement(actor: Actor, id: string): Promise<void> {
  const row = await requireManageable(actor, id, true);
  await transactional(async (tx, afterCommit) => {
    const audience = await audienceIds(tx, actor.orgId, row);
    await tx.announcement.delete({ where: { id } });
    broadcast(afterCommit, [...audience, row.authorId], id, true);
  });
}

// ─── Comments ─────────────────────────────────────────────────────────

const commentInclude = { author: { select: userSummarySelect } } satisfies Prisma.AnnouncementCommentInclude;

function toCommentDTO(row: Prisma.AnnouncementCommentGetPayload<{ include: typeof commentInclude }>): AnnouncementCommentDTO {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    author: toUserSummary(row.author),
    body: deleted ? '' : row.body,
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listComments(actor: Actor, id: string): Promise<AnnouncementCommentDTO[]> {
  await requireVisible(actor, id);
  const rows = await prisma.announcementComment.findMany({
    where: { announcementId: id },
    include: commentInclude,
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  return rows.map(toCommentDTO);
}

export async function addComment(actor: Actor, id: string, input: AnnouncementCommentInput): Promise<AnnouncementCommentDTO> {
  const row = await requireVisible(actor, id);
  return transactional(async (tx, afterCommit) => {
    const comment = await tx.announcementComment.create({
      data: { announcementId: id, authorId: actor.userId, body: input.body },
      include: commentInclude,
    });
    await notify(tx, afterCommit, [
      {
        userId: row.authorId,
        type: 'ANNOUNCEMENT',
        actorId: actor.userId,
        projectId: row.projectId,
        data: {
          announcementId: id,
          announcementTitle: row.title,
          announcementKind: 'comment',
          scopeLabel: scopeLabelOf(row),
          excerpt: input.body.slice(0, 160),
        },
      },
    ]);
    broadcast(afterCommit, [...(await audienceIds(tx, actor.orgId, row)), row.authorId], id);
    return toCommentDTO(comment);
  });
}

async function requireOwnComment(actor: Actor, commentId: string) {
  const comment = await prisma.announcementComment.findFirst({
    where: { id: commentId, deletedAt: null, announcement: visibleWhere(actor) },
    include: { announcement: true },
  });
  if (!comment) throw notFound('Komentar');
  return comment;
}

export async function editComment(actor: Actor, commentId: string, input: AnnouncementCommentInput): Promise<AnnouncementCommentDTO> {
  const comment = await requireOwnComment(actor, commentId);
  if (comment.authorId !== actor.userId) throw forbidden('Hanya penulis yang bisa mengubah komentar');
  return transactional(async (tx, afterCommit) => {
    const updated = await tx.announcementComment.update({
      where: { id: commentId },
      data: { body: input.body, editedAt: new Date() },
      include: commentInclude,
    });
    broadcast(afterCommit, [...(await audienceIds(tx, actor.orgId, comment.announcement)), comment.announcement.authorId], comment.announcementId);
    return toCommentDTO(updated);
  });
}

/** Authors delete their own comments; managers of the announcement may moderate. */
export async function deleteComment(actor: Actor, commentId: string): Promise<void> {
  const comment = await requireOwnComment(actor, commentId);
  if (comment.authorId !== actor.userId) {
    const facts = await loadFacts(actor);
    const a = comment.announcement;
    const project = a.projectId ? await prisma.project.findUnique({ where: { id: a.projectId }, select: { divisionId: true } }) : null;
    if (!canPostTo(facts, { scope: a.scope, divisionId: a.divisionId, projectId: a.projectId, projectDivisionId: project?.divisionId ?? null })) {
      throw forbidden();
    }
  }
  await transactional(async (tx, afterCommit) => {
    await tx.announcementComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
    broadcast(afterCommit, [...(await audienceIds(tx, actor.orgId, comment.announcement)), comment.announcement.authorId], comment.announcementId);
  });
}
