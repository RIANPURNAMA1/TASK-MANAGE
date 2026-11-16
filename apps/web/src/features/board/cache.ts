import type { QueryClient } from '@tanstack/react-query';
import type { BoardData, CardSummary, LabelDTO, ListDTO } from '@nexus/shared';
import { qk } from '../../lib/queryKeys';

/**
 * Pure helpers that patch the cached board. Used by optimistic mutations and by
 * real-time events so both paths produce identical state.
 */
function patchBoard(qc: QueryClient, projectId: string, fn: (board: BoardData) => BoardData): void {
  qc.setQueryData<BoardData>(qk.board(projectId), (board) => (board ? fn(board) : board));
}

export function upsertCard(qc: QueryClient, card: CardSummary): void {
  patchBoard(qc, card.projectId, (board) => {
    const others = board.cards.filter((c) => c.id !== card.id);
    return { ...board, cards: card.archivedAt ? others : [...others, card] };
  });
}

export function removeCard(qc: QueryClient, projectId: string, cardId: string): void {
  patchBoard(qc, projectId, (board) => ({ ...board, cards: board.cards.filter((c) => c.id !== cardId) }));
}

export function upsertList(qc: QueryClient, list: ListDTO): void {
  patchBoard(qc, list.projectId, (board) => {
    const others = board.lists.filter((l) => l.id !== list.id);
    return { ...board, lists: list.archivedAt ? others : [...others, list] };
  });
}

export function removeList(qc: QueryClient, projectId: string, listId: string): void {
  patchBoard(qc, projectId, (board) => ({ ...board, lists: board.lists.filter((l) => l.id !== listId) }));
}

export function setLabels(qc: QueryClient, projectId: string, labels: LabelDTO[]): void {
  patchBoard(qc, projectId, (board) => {
    const byId = new Map(labels.map((l) => [l.id, l]));
    return {
      ...board,
      labels,
      // Keep card label pills in sync with renamed/recolored/deleted labels.
      cards: board.cards.map((c) => ({
        ...c,
        labels: c.labels.flatMap((l) => {
          const next = byId.get(l.id);
          return next ? [next] : [];
        }),
      })),
    };
  });
}

/** After any card change: refresh dependent views that aren't patched directly. */
export function invalidateCardViews(qc: QueryClient, cardId?: string): void {
  void qc.invalidateQueries({ queryKey: qk.myTasks });
  if (cardId) void qc.invalidateQueries({ queryKey: qk.card(cardId) });
}
