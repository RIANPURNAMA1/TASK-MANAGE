import { useMemo, useState } from 'react';
import {
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { CardSummary, ListDTO } from '@nexus/shared';
import { useMoveCard, useMoveList } from './hooks';

/** Columns share the sortable id-space with cards, so they get a prefix. */
const LIST_PREFIX = 'list:';
export const listDndId = (id: string) => `${LIST_PREFIX}${id}`;
const isListDndId = (id: UniqueIdentifier) => String(id).startsWith(LIST_PREFIX);
const fromListDndId = (id: UniqueIdentifier) => String(id).slice(LIST_PREFIX.length);

type Containers = Record<string, string[]>;

function buildContainers(lists: ListDTO[], cards: CardSummary[]): Containers {
  const result: Containers = Object.fromEntries(lists.map((l) => [l.id, [] as string[]]));
  for (const card of cards) result[card.listId]?.push(card.id);
  return result;
}

function findContainer(id: UniqueIdentifier, state: Containers): string | undefined {
  if (isListDndId(id)) return fromListDndId(id);
  return Object.keys(state).find((listId) => state[listId]?.includes(String(id)));
}

/** Prefer the card under the pointer; fall back to the column, then to the closest corner. */
export const kanbanCollision: CollisionDetection = (args) => {
  if (isListDndId(args.active.id)) {
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => isListDndId(c.id)),
    });
  }
  const hits = pointerWithin(args);
  const cardHits = hits.filter((h) => !isListDndId(h.id));
  if (cardHits.length) return cardHits;
  return hits.length ? hits : closestCorners(args);
};

/**
 * Multi-container drag & drop for the board. While dragging, card placement lives in
 * local state; on drop the change is committed through optimistic mutations.
 *
 * @param lists sorted visible lists
 * @param cards sorted visible (filtered) cards
 */
export function useKanbanDnd(projectId: string, lists: ListDTO[], cards: CardSummary[]) {
  const derived = useMemo(() => buildContainers(lists, cards), [lists, cards]);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [dragState, setDragState] = useState<Containers | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const moveCard = useMoveCard(projectId);
  const moveList = useMoveList(projectId);

  const containers = dragState ?? derived;

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    if (!isListDndId(active.id)) setDragState(derived);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || isListDndId(active.id)) return;
    setDragState((prev) => {
      const state = prev ?? derived;
      const from = findContainer(active.id, state);
      const to = findContainer(over.id, state);
      if (!from || !to || from === to) return prev;
      const target = [...(state[to] ?? [])];
      const overIndex = isListDndId(over.id) ? -1 : target.indexOf(String(over.id));
      target.splice(overIndex < 0 ? target.length : overIndex, 0, String(active.id));
      return {
        ...state,
        [from]: (state[from] ?? []).filter((id) => id !== String(active.id)),
        [to]: target,
      };
    });
  };

  const commitList = (activeListId: string, overId: UniqueIdentifier) => {
    const overListId = isListDndId(overId) ? fromListDndId(overId) : cardById.get(String(overId))?.listId;
    const from = lists.findIndex((l) => l.id === activeListId);
    const to = lists.findIndex((l) => l.id === overListId);
    if (from < 0 || to < 0 || from === to) return;
    const ordered = arrayMove(lists, from, to);
    const prev = ordered[to - 1] ?? null;
    const next = ordered[to + 1] ?? null;
    moveList({
      list: lists[from]!,
      prevId: prev?.id ?? null,
      nextId: next?.id ?? null,
      prevPosition: prev?.position ?? null,
      nextPosition: next?.position ?? null,
    });
  };

  const commitCard = (cardId: string, overId: UniqueIdentifier) => {
    const state = dragState ?? derived;
    const listId = findContainer(cardId, state);
    const card = cardById.get(cardId);
    if (!listId || !card) return;

    let ids = state[listId] ?? [];
    const overIndex = ids.indexOf(String(overId));
    if (overIndex >= 0 && String(overId) !== cardId) ids = arrayMove(ids, ids.indexOf(cardId), overIndex);

    const index = ids.indexOf(cardId);
    const prev = cardById.get(ids[index - 1] ?? '') ?? null;
    const next = cardById.get(ids[index + 1] ?? '') ?? null;

    const original = derived[card.listId] ?? [];
    const originalIndex = original.indexOf(cardId);
    const unchanged =
      card.listId === listId &&
      (original[originalIndex - 1] ?? null) === (prev?.id ?? null) &&
      (original[originalIndex + 1] ?? null) === (next?.id ?? null);
    if (unchanged) return;

    moveCard({
      card: { ...card, listId },
      prevId: prev?.id ?? null,
      nextId: next?.id ?? null,
      prevPosition: prev?.position ?? null,
      nextPosition: next?.position ?? null,
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (over) {
      if (isListDndId(active.id)) commitList(fromListDndId(active.id), over.id);
      else commitCard(String(active.id), over.id);
    }
    setDragState(null);
  };

  const onDragCancel = () => {
    setActiveId(null);
    setDragState(null);
  };

  const activeCard = activeId && !isListDndId(activeId) ? (cardById.get(activeId) ?? null) : null;
  const activeList = activeId && isListDndId(activeId) ? (lists.find((l) => l.id === fromListDndId(activeId)) ?? null) : null;

  return {
    containers,
    cardById,
    activeCard,
    activeList,
    handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel },
  };
}
