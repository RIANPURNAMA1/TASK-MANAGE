import { toUserSummary, userSummarySelect, type BoardList, type Label, type Prisma, type Tx } from '@nexus/db';
import { sortByPosition, type CardSummary, type LabelDTO, type ListDTO } from '@nexus/shared';

const CHECKLIST_PREVIEW = 4;
const EXCERPT_LENGTH = 160;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** Plain-text preview of sanitized description HTML (tags removed, whitespace collapsed). */
export function descriptionExcerpt(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<\/(p|li|h[1-3]|blockquote|pre)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : text;
}

export const cardSummaryInclude = {
  assignees: { include: { user: { select: userSummarySelect } }, orderBy: { createdAt: 'asc' } },
  labels: { include: { label: true } },
  checklist: { select: { id: true, title: true, isDone: true, position: true } },
  _count: {
    select: {
      comments: { where: { deletedAt: null } },
      attachments: { where: { deletedAt: null, status: 'READY' } },
    },
  },
} satisfies Prisma.CardInclude;

export type CardSummaryRow = Prisma.CardGetPayload<{ include: typeof cardSummaryInclude }>;

export function toLabelDTO(label: Label): LabelDTO {
  return { id: label.id, name: label.name, color: label.color };
}

export function toListDTO(list: BoardList): ListDTO {
  return {
    id: list.id,
    projectId: list.projectId,
    name: list.name,
    position: list.position,
    archivedAt: list.archivedAt?.toISOString() ?? null,
  };
}

export function toCardSummary(row: CardSummaryRow): CardSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    listId: row.listId,
    title: row.title,
    priority: row.priority,
    startDate: row.startDate?.toISOString() ?? null,
    dueDate: row.dueDate?.toISOString() ?? null,
    position: row.position,
    completedAt: row.completedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    assignees: row.assignees.map((a) => toUserSummary(a.user)),
    labels: row.labels.map((l) => toLabelDTO(l.label)).sort((a, b) => a.name.localeCompare(b.name)),
    checklist: { done: row.checklist.filter((c) => c.isDone).length, total: row.checklist.length },
    checklistPreview: sortByPosition(row.checklist)
      .slice(0, CHECKLIST_PREVIEW)
      .map(({ id, title, isDone }) => ({ id, title, isDone })),
    excerpt: descriptionExcerpt(row.description),
    commentCount: row._count.comments,
    attachmentCount: row._count.attachments,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadCardSummary(db: Tx, cardId: string): Promise<CardSummary> {
  return toCardSummary(await db.card.findUniqueOrThrow({ where: { id: cardId }, include: cardSummaryInclude }));
}

export function sortedCards(rows: CardSummaryRow[]): CardSummary[] {
  return sortByPosition(rows).map(toCardSummary);
}
