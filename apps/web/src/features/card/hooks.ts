import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CardDetail,
  CardSummary,
  CreateCommentInput,
  UpdateCardInput,
  UpdateChecklistItemInput,
  UpdateCommentInput,
} from '@nexus/shared';
import { api } from '../../lib/api';
import { resolveApiUrl } from '../../lib/apiBase';
import { toastError } from '../../lib/errors';
import { qk } from '../../lib/queryKeys';
import { uploadFile } from '../../lib/upload';
import { invalidateCardViews, upsertCard } from '../board/cache';

export function useCardQuery(id: string | null) {
  return useQuery({ queryKey: qk.card(id ?? ''), queryFn: () => api.cards.get(id!), enabled: Boolean(id) });
}

/** Applies a server-returned summary everywhere it is cached. */
function useApplySummary() {
  const qc = useQueryClient();
  return (summary: CardSummary) => {
    upsertCard(qc, summary);
    qc.setQueryData<CardDetail>(qk.card(summary.id), (d) => (d ? { ...d, ...summary } : d));
    invalidateCardViews(qc, summary.id);
  };
}

export function useCardMutations(cardId: string) {
  const apply = useApplySummary();
  const onError = (error: unknown) => toastError(error, 'Gagal menyimpan perubahan kartu.');

  return {
    update: useMutation({
      mutationFn: (input: UpdateCardInput) => api.cards.update(cardId, input),
      onSuccess: apply,
      onError,
    }),
    setAssignees: useMutation({
      mutationFn: (userIds: string[]) => api.cards.setAssignees(cardId, userIds),
      onSuccess: apply,
      onError,
    }),
    setLabels: useMutation({
      mutationFn: (labelIds: string[]) => api.cards.setLabels(cardId, labelIds),
      onSuccess: apply,
      onError,
    }),
    move: useMutation({
      mutationFn: (input: { listId: string; prevId: string | null }) =>
        api.cards.move(cardId, { listId: input.listId, prevId: input.prevId, nextId: null }),
      onSuccess: apply,
      onError,
    }),
    archive: useMutation({
      mutationFn: (archive: boolean) => (archive ? api.cards.archive(cardId) : api.cards.restore(cardId)),
      onSuccess: (summary) => {
        apply(summary);
        toast.success(summary.archivedAt ? 'Kartu diarsipkan.' : 'Kartu dipulihkan.');
      },
      onError,
    }),
  };
}

/** Checklist changes re-fetch the card so counters and the board tile stay correct. */
export function useChecklistMutations(cardId: string) {
  const qc = useQueryClient();
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: qk.card(cardId) });
    const detail = qc.getQueryData<CardDetail>(qk.card(cardId));
    if (detail) upsertCard(qc, detail);
  };
  const onError = (error: unknown) => toastError(error, 'Gagal menyimpan checklist.');
  return {
    create: useMutation({
      mutationFn: (title: string) => api.checklist.create(cardId, { title }),
      onSuccess: refresh,
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: { id: string } & UpdateChecklistItemInput) => api.checklist.update(id, input),
      onMutate: ({ id, ...input }) => {
        qc.setQueryData<CardDetail>(qk.card(cardId), (d) =>
          d ? { ...d, checklistItems: d.checklistItems.map((i) => (i.id === id ? { ...i, ...input } : i)) } : d,
        );
      },
      onSettled: refresh,
      onError,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.checklist.remove(id),
      onSuccess: refresh,
      onError,
    }),
  };
}

export function useCommentsQuery(cardId: string) {
  return useQuery({ queryKey: qk.cardComments(cardId), queryFn: () => api.comments.list(cardId) });
}

export function useCommentMutations(cardId: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.card(cardId) });
  const onError = (error: unknown) => toastError(error, 'Gagal menyimpan komentar.');
  return {
    create: useMutation({
      mutationFn: (input: CreateCommentInput) => api.comments.create(cardId, input),
      onSuccess: refresh,
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: { id: string } & UpdateCommentInput) => api.comments.update(id, input),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.comments.remove(id),
      onSuccess: refresh,
      onError,
    }),
  };
}

export function useAttachmentMutations(projectId: string, cardId: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.card(cardId) });
  return {
    upload: useMutation({
      mutationFn: (files: File[]) => Promise.all(files.map((f) => uploadFile(projectId, f, cardId))),
      onSuccess: (uploaded) => {
        refresh();
        toast.success(`${uploaded.length} file diunggah.`);
      },
      onError: (error) => toastError(error, 'Gagal mengunggah file.'),
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.attachments.remove(id),
      onSuccess: refresh,
      onError: (error) => toastError(error, 'Gagal menghapus file.'),
    }),
  };
}

export function useSignedUrl(attachmentId: string, disposition: 'inline' | 'attachment', enabled = true) {
  return useQuery({
    queryKey: qk.signedUrl(attachmentId, disposition),
    queryFn: async () => {
      const signed = await api.attachments.signedUrl(attachmentId, disposition);
      return { ...signed, url: resolveApiUrl(signed.url) };
    },
    enabled,
    // Signed URLs live ~5 minutes; refresh well before expiry.
    staleTime: 3 * 60_000,
    gcTime: 4 * 60_000,
  });
}

export function useCardActivity(cardId: string, enabled: boolean) {
  return useQuery({ queryKey: qk.cardActivity(cardId), queryFn: () => api.cards.activity(cardId), enabled });
}
