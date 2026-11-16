import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import clsx from 'clsx';
import type { CardSummary, ListDTO } from '@nexus/shared';
import { useCreateList } from './hooks';
import { InlineComposer } from './InlineComposer';
import { CardTile } from './KanbanCard';
import { COLUMN_WIDTH, KanbanColumn, columnAccent } from './KanbanColumn';
import { kanbanCollision, listDndId, useKanbanDnd } from './useKanbanDnd';

interface KanbanBoardProps {
  projectId: string;
  lists: ListDTO[];
  cards: CardSummary[];
  canEdit: boolean;
  onOpenCard: (id: string) => void;
}

export function KanbanBoard({ projectId, lists, cards, canEdit, onOpenCard }: KanbanBoardProps) {
  const { containers, cardById, activeCard, activeList, handlers } = useKanbanDnd(projectId, lists, cards);
  const createList = useCreateList(projectId);

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks working for opening cards.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  return (
    <DndContext sensors={sensors} collisionDetection={kanbanCollision} {...handlers}>
      <div className="scrollbar-thin flex min-h-full items-start gap-5 overflow-x-auto px-8 pb-10">
        <SortableContext items={lists.map((l) => listDndId(l.id))} strategy={horizontalListSortingStrategy}>
          {lists.map((list) => (
            <KanbanColumn
              key={list.id}
              list={list}
              cards={(containers[list.id] ?? []).flatMap((id) => cardById.get(id) ?? [])}
              canEdit={canEdit}
              dndDisabled={!canEdit}
              onOpenCard={onOpenCard}
            />
          ))}
        </SortableContext>

        {canEdit && (
          <div className={clsx('shrink-0', COLUMN_WIDTH)}>
            <InlineComposer
              label="Tambah kolom"
              placeholder="Nama kolom…"
              submitLabel="Tambah"
              className="flex h-10 w-full items-center gap-1.5 rounded-xl px-3 text-[0.875rem] font-medium text-ink-subtle transition-colors hover:bg-surface hover:text-ink"
              onSubmit={(name) => createList.mutateAsync(name)}
            />
          </div>
        )}
      </div>

      {createPortal(
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {activeCard && (
            <div className="w-[300px] cursor-grabbing">
              <CardTile card={activeCard} overlay />
            </div>
          )}
          {activeList && (
            <div
              className={clsx(
                'flex h-10 cursor-grabbing items-center gap-2.5 rounded-xl border border-line bg-surface px-3 shadow-card-hover',
                COLUMN_WIDTH,
              )}
            >
              <span className={clsx('h-2 w-2 rounded-full', columnAccent(activeList.name))} aria-hidden />
              <span className="text-[0.9375rem] font-semibold text-ink">{activeList.name}</span>
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
