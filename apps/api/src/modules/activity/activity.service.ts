import { prisma, toUserSummary, userSummarySelect, type Prisma, type Tx } from '@nexus/db';
import type { ActivityDTO, Paginated } from '@nexus/shared';

export interface ActivityEntry {
  projectId: string;
  cardId?: string | null;
  actorId: string;
  entityType: 'project' | 'list' | 'card' | 'checklist' | 'comment' | 'attachment' | 'label' | 'member';
  entityId: string;
  action: string;
  diff?: Prisma.InputJsonObject;
}

/**
 * Appends to the activity log. Must be called with the same `tx` as the change it
 * describes, so the log can never disagree with the data (PRD §7).
 */
export async function recordActivity(tx: Tx, entry: ActivityEntry): Promise<void> {
  await tx.activityLog.create({
    data: {
      projectId: entry.projectId,
      cardId: entry.cardId ?? null,
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      diff: entry.diff ?? {},
    },
  });
}

/** `{ field: { from, to } }` for every field whose value actually changed. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, Prisma.InputJsonValue> {
  const diff: Record<string, Prisma.InputJsonValue> = {};
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue;
    const from = normalize(before[key]);
    const to = normalize(after[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) diff[key] = { from, to };
  }
  return diff;
}

function normalize(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  return value as Prisma.InputJsonValue;
}

export const activityInclude = { actor: { select: userSummarySelect } } satisfies Prisma.ActivityLogInclude;

export function toActivityDTO(row: Prisma.ActivityLogGetPayload<{ include: typeof activityInclude }>): ActivityDTO {
  return {
    id: row.id,
    actor: toUserSummary(row.actor),
    entityType: row.entityType,
    entityId: row.entityId,
    cardId: row.cardId,
    action: row.action,
    diff: row.diff as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listProjectActivity(projectId: string, cursor: string | undefined, limit: number): Promise<Paginated<ActivityDTO>> {
  const rows = await prisma.activityLog.findMany({
    where: { projectId },
    include: activityInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toActivityDTO);
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function listCardActivity(cardId: string): Promise<ActivityDTO[]> {
  const rows = await prisma.activityLog.findMany({
    where: { cardId },
    include: activityInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(toActivityDTO);
}
