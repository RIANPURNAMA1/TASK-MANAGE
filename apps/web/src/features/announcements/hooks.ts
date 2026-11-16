import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  AnnouncementCommentInput,
  AnnouncementScope,
  CreateAnnouncementInput,
  ServerToClientEvents,
  UpdateAnnouncementInput,
} from '@nexus/shared';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { qk } from '../../lib/queryKeys';
import { socket } from '../../lib/socket';

export interface AnnouncementFilter {
  scope?: AnnouncementScope;
  q?: string;
  unread?: boolean;
}

export function useAnnouncementList(filter: AnnouncementFilter) {
  return useInfiniteQuery({
    queryKey: qk.announcementList(filter),
    queryFn: ({ pageParam }) => api.announcements.list({ ...filter, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useAnnouncement(id: string | undefined) {
  return useQuery({
    queryKey: qk.announcement(id ?? ''),
    queryFn: () => api.announcements.get(id!),
    enabled: Boolean(id),
  });
}

export function useAnnouncementComments(id: string) {
  return useQuery({ queryKey: qk.announcementComments(id), queryFn: () => api.announcements.comments(id) });
}

export function useAnnouncementTargets() {
  return useQuery({ queryKey: qk.announcementTargets, queryFn: api.announcements.targets, staleTime: 60_000 });
}

export function useAnnouncementUnread(): number {
  const q = useQuery({ queryKey: qk.announcementUnread, queryFn: api.announcements.unreadCount, refetchInterval: 120_000 });
  return q.data?.count ?? 0;
}

/** Keeps every announcement view fresh when someone posts, edits, pins or comments. */
export function useAnnouncementRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const onChanged: ServerToClientEvents['announcement:changed'] = ({ announcementId, deleted }) => {
      if (deleted) qc.removeQueries({ queryKey: qk.announcement(announcementId) });
      void qc.invalidateQueries({ queryKey: qk.announcements });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    };
    socket.on('announcement:changed', onChanged);
    return () => void socket.off('announcement:changed', onChanged);
  }, [qc]);
}

export function useAnnouncementMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.announcements });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
  };

  return {
    create: useMutation({
      mutationFn: (input: CreateAnnouncementInput) => api.announcements.create(input),
      onSuccess: (a) => {
        qc.setQueryData(qk.announcement(a.id), a);
        refresh();
        toast.success('Pengumuman diterbitkan.');
      },
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateAnnouncementInput }) => api.announcements.update(id, input),
      onSuccess: (a) => {
        qc.setQueryData(qk.announcement(a.id), a);
        refresh();
        toast.success('Pengumuman diperbarui.');
      },
    }),
    pin: useMutation({
      mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.announcements.pin(id, pinned),
      onSuccess: (a) => {
        qc.setQueryData(qk.announcement(a.id), a);
        refresh();
        toast.success(a.pinnedAt ? 'Pengumuman disematkan.' : 'Sematan dilepas.');
      },
      onError: (e) => toastError(e),
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.announcements.remove(id),
      onSuccess: (_v, id) => {
        qc.removeQueries({ queryKey: qk.announcement(id) });
        refresh();
        toast.success('Pengumuman dihapus.');
      },
      onError: (e) => toastError(e),
    }),
    markRead: useMutation({
      mutationFn: (id: string) => api.announcements.markRead(id),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: qk.announcementUnread });
        void qc.invalidateQueries({ queryKey: ['announcements', 'list'] });
      },
    }),
    markAllRead: useMutation({
      mutationFn: () => api.announcements.markAllRead(),
      onSuccess: () => {
        refresh();
        toast.success('Semua pengumuman ditandai sudah dibaca.');
      },
      onError: (e) => toastError(e),
    }),
  };
}

export function useAnnouncementCommentMutations(announcementId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.announcementComments(announcementId) });
    void qc.invalidateQueries({ queryKey: qk.announcement(announcementId) });
    void qc.invalidateQueries({ queryKey: ['announcements', 'list'] });
  };
  return {
    add: useMutation({
      mutationFn: (input: AnnouncementCommentInput) => api.announcements.addComment(announcementId, input),
      onSuccess: refresh,
      onError: (e) => toastError(e, 'Komentar gagal dikirim.'),
    }),
    edit: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) => api.announcements.editComment(id, { body }),
      onSuccess: refresh,
      onError: (e) => toastError(e),
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.announcements.removeComment(id),
      onSuccess: refresh,
      onError: (e) => toastError(e),
    }),
  };
}
