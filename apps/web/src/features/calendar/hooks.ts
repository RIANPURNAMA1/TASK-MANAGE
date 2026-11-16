import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardData, MyTaskDTO } from '@nexus/shared';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { qk } from '../../lib/queryKeys';
import { upsertCard } from '../board/cache';
import type { CalendarScope } from './calendarUtils';

export function useCalendarQuery(range: { from: Date; to: Date }, scope: CalendarScope, projectId?: string) {
  const params = { from: range.from.toISOString(), to: range.to.toISOString(), scope, projectId };
  return useQuery({
    queryKey: qk.calendarRange(params),
    queryFn: () => api.me.calendar(params),
    // Keep the previous month on screen while the next one loads (no flash when paging).
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
  });
}

/** Drag a card to another day. Optimistic; rolled back by refetching if the server refuses. */
export function useRescheduleCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, dueDate, startDate }: { cardId: string; dueDate: string; startDate: string | null }) =>
      api.cards.update(cardId, startDate ? { startDate, dueDate } : { dueDate }),
    onMutate: async ({ cardId, dueDate, startDate }) => {
      await qc.cancelQueries({ queryKey: qk.calendar });
      qc.setQueriesData<MyTaskDTO[]>({ queryKey: qk.calendar }, (old) =>
        old?.map((t) => (t.id === cardId ? { ...t, dueDate, startDate } : t)),
      );
      // The project board's calendar tab reads the board cache, so move the card there too.
      await qc.cancelQueries({ queryKey: ['board'] });
      qc.setQueriesData<BoardData>({ queryKey: ['board'] }, (old) =>
        old && { ...old, cards: old.cards.map((c) => (c.id === cardId ? { ...c, dueDate, startDate } : c)) },
      );
    },
    onSuccess: (summary) => upsertCard(qc, summary),
    onError: (error) => toastError(error, 'Tidak bisa memindahkan tenggat kartu ini.'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.calendar });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: qk.myTasks });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}
