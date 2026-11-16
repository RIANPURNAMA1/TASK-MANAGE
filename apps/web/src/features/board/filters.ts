import type { CardSummary } from '@nexus/shared';
import { dueStatus } from '../../lib/format';

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';
export type StatusFilter = 'all' | 'open' | 'done';

export interface BoardFilters {
  assigneeId: string;
  labelId: string;
  due: DueFilter;
  status: StatusFilter;
  query: string;
}

export const EMPTY_FILTERS: BoardFilters = { assigneeId: '', labelId: '', due: 'all', status: 'all', query: '' };

export function isFiltering(f: BoardFilters): boolean {
  return Boolean(f.assigneeId || f.labelId || f.query.trim() || f.due !== 'all' || f.status !== 'all');
}

function matchesDue(card: CardSummary, due: DueFilter): boolean {
  if (due === 'all') return true;
  if (due === 'none') return !card.dueDate;
  const status = dueStatus(card.dueDate, card.completedAt);
  if (due === 'overdue') return status === 'overdue';
  if (due === 'today') return status === 'today';
  return status === 'today' || status === 'soon';
}

/** Client-side filtering shared by the Kanban and table views (FR-14). */
export function applyFilters(cards: CardSummary[], f: BoardFilters): CardSummary[] {
  const query = f.query.trim().toLowerCase();
  return cards.filter(
    (card) =>
      (!f.assigneeId || card.assignees.some((a) => a.id === f.assigneeId)) &&
      (!f.labelId || card.labels.some((l) => l.id === f.labelId)) &&
      (f.status === 'all' || (f.status === 'done' ? Boolean(card.completedAt) : !card.completedAt)) &&
      (!query || card.title.toLowerCase().includes(query)) &&
      matchesDue(card, f.due),
  );
}
