import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  positionBetween,
  type BoardData,
  type CardSummary,
  type LabelDTO,
  type LabelInput,
  type ListDTO,
} from '@nexus/shared';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { qk } from '../../lib/queryKeys';
import { socket } from '../../lib/socket';
import { invalidateCardViews, removeList, setLabels, upsertCard, upsertList } from './cache';

export function useBoardQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.board(projectId ?? ''),
    queryFn: () => api.projects.board(projectId!),
    enabled: Boolean(projectId),
  });
}

/** Joins the project's real-time room while mounted (and again after reconnects). */
export function useProjectRoom(projectId: string | undefined) {
  useEffect(() => {
    if (!projectId) return;
    const join = () => socket.emit('project:join', projectId, () => undefined);
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('project:leave', projectId);
    };
  }, [projectId]);
}

export interface MoveVars {
  prevId: string | null;
  nextId: string | null;
  prevPosition: string | null;
  nextPosition: string | null;
}

/**
 * Applies the optimistic patch synchronously (so a drop never flickers back), then
 * persists it. The server derives the authoritative position from the neighbour ids.
 */
function useOptimisticMove<T>(
  projectId: string,
  applyLocal: (qc: ReturnType<typeof useQueryClient>, vars: T & MoveVars) => void,
  persist: (vars: T & MoveVars) => Promise<unknown>,
  errorText: string,
) {
  const qc = useQueryClient();
  const mutation = useMutation({ mutationFn: persist });
  return (vars: T & MoveVars) => {
    const key = qk.board(projectId);
    const snapshot = qc.getQueryData<BoardData>(key);
    void qc.cancelQueries({ queryKey: key });
    applyLocal(qc, vars);
    mutation.mutate(vars, {
      onError: (error) => {
        if (snapshot) qc.setQueryData(key, snapshot);
        toastError(error, errorText);
      },
    });
  };
}

/** Optimistic list reorder (FR-08). */
export function useMoveList(projectId: string) {
  const qc = useQueryClient();
  return useOptimisticMove<{ list: ListDTO }>(
    projectId,
    (client, { list, prevPosition, nextPosition }) =>
      upsertList(client, { ...list, position: positionBetween(prevPosition, nextPosition) }),
    async ({ list, prevId, nextId }) => upsertList(qc, await api.lists.move(list.id, { prevId, nextId })),
    'Gagal memindahkan kolom.',
  );
}

/** Optimistic card move across lists/positions (FR-10). `card.listId` is the target list. */
export function useMoveCard(projectId: string) {
  const qc = useQueryClient();
  return useOptimisticMove<{ card: CardSummary }>(
    projectId,
    (client, { card, prevPosition, nextPosition }) =>
      upsertCard(client, { ...card, position: positionBetween(prevPosition, nextPosition) }),
    async ({ card, prevId, nextId }) => {
      const saved = await api.cards.move(card.id, { listId: card.listId, prevId, nextId });
      upsertCard(qc, saved);
      invalidateCardViews(qc, saved.id);
    },
    'Gagal memindahkan kartu.',
  );
}

export function useCreateCard(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    /** `beforeId` places the new card above that card (e.g. "+" at the top of a column). */
    mutationFn: async ({ beforeId, ...input }: { listId: string; title: string; beforeId?: string | null }) => {
      const card = await api.cards.create(projectId, input);
      return beforeId ? api.cards.move(card.id, { listId: input.listId, prevId: null, nextId: beforeId }) : card;
    },
    onSuccess: (card) => {
      upsertCard(qc, card);
      invalidateCardViews(qc);
    },
    onError: (error) => toastError(error, 'Gagal membuat kartu.'),
  });
}

export function useCreateList(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.lists.create(projectId, { name }),
    onSuccess: (list) => upsertList(qc, list),
    onError: (error) => toastError(error, 'Gagal membuat kolom.'),
  });
}

export function useRenameList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.lists.rename(id, name),
    onSuccess: (list) => upsertList(qc, list),
    onError: (error) => toastError(error, 'Gagal mengubah nama kolom.'),
  });
}

export function useArchiveList(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (list: ListDTO) => api.lists.archive(list.id),
    onSuccess: (list) => {
      removeList(qc, projectId, list.id);
      void qc.invalidateQueries({ queryKey: qk.projectArchived(projectId) });
      toast.success(`Kolom "${list.name}" diarsipkan.`);
    },
    onError: (error) => toastError(error, 'Gagal mengarsipkan kolom.'),
  });
}

/** Label CRUD; the server echoes `labels:changed`, but we also patch locally for snappiness. */
export function useLabelMutations(projectId: string) {
  const qc = useQueryClient();
  const current = () => qc.getQueryData<BoardData>(qk.board(projectId))?.labels ?? [];
  const onError = (error: unknown) => toastError(error, 'Gagal menyimpan label.');

  const create = useMutation({
    mutationFn: (input: LabelInput) => api.labels.create(projectId, input),
    onSuccess: (label: LabelDTO) => setLabels(qc, projectId, [...current(), label]),
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<LabelInput>) => api.labels.update(id, input),
    onSuccess: (label: LabelDTO) =>
      setLabels(qc, projectId, current().map((l) => (l.id === label.id ? label : l))),
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.labels.remove(id),
    onSuccess: (_void, id) => setLabels(qc, projectId, current().filter((l) => l.id !== id)),
    onError,
  });
  return { create, update, remove };
}
