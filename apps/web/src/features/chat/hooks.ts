import { useCallback, useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { MessageDTO } from '@nexus/shared';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { qk } from '../../lib/queryKeys';
import { socket } from '../../lib/socket';
import { useAuthStore } from '../../stores/auth';
import { appendMessage, bumpChannel, clearUnread, replaceMessage } from './cache';
import { useTyping, usePending, type PendingMessage } from './stores';

const PAGE_SIZE = 50;
const TYPING_THROTTLE_MS = 3000;

export function useChannelsQuery() {
  const authenticated = useAuthStore((s) => s.status === 'authenticated');
  return useQuery({ queryKey: qk.chatChannels, queryFn: api.chat.channels, enabled: authenticated, staleTime: 30_000 });
}

/** Sum of unread messages across channels, for the top tab and rail badges. */
export function useChatUnreadTotal(): number {
  const { data } = useChannelsQuery();
  return (data ?? []).reduce((sum, c) => sum + c.unreadCount, 0);
}

export function useChannelQuery(channelId: string) {
  return useQuery({ queryKey: qk.chatChannel(channelId), queryFn: () => api.chat.channel(channelId) });
}

/** Newest page first; `fetchNextPage` loads older messages (infinite scroll upward). */
export function useMessagesQuery(channelId: string) {
  return useInfiniteQuery({
    queryKey: qk.chatMessages(channelId),
    queryFn: ({ pageParam }) => api.chat.messages(channelId, { before: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** Joins the channel room (typing events) while open, re-joining after reconnects. */
export function useChannelRoom(channelId: string) {
  const touch = useTyping((s) => s.touch);
  useEffect(() => {
    const join = () => socket.emit('channel:join', channelId, () => undefined);
    const onTyping = (payload: { channelId: string; user: { id: string; name: string } }) => {
      if (payload.channelId === channelId) touch(channelId, payload.user);
    };
    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('chat:typing', onTyping);
    return () => {
      socket.off('connect', join);
      socket.off('chat:typing', onTyping);
      socket.emit('channel:leave', channelId);
    };
  }, [channelId, touch]);
}

/** Returns a function to call on every keystroke; emits at most once per 3 s. */
export function useTypingEmitter(channelId: string) {
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current < TYPING_THROTTLE_MS) return;
    last.current = now;
    socket.emit('chat:typing', channelId);
  }, [channelId]);
}

export function useMarkRead(channelId: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    clearUnread(qc, channelId);
    api.chat.markRead(channelId).catch(() => undefined);
  }, [qc, channelId]);
}

/**
 * Optimistic send. The pending entry is shown immediately; it disappears once the
 * confirmed message (from the response or the socket echo) is in the feed.
 */
export function useSendMessage() {
  const qc = useQueryClient();
  const { add, setStatus, remove } = usePending();

  const deliver = useCallback(
    async (pending: PendingMessage) => {
      const { channelId, input } = pending;
      setStatus(channelId, input.clientMessageId, 'sending');
      try {
        const message = await api.chat.send(channelId, input);
        appendMessage(qc, message);
        bumpChannel(qc, message, false);
        remove(channelId, input.clientMessageId);
      } catch (error) {
        setStatus(channelId, input.clientMessageId, 'failed');
        toastError(error, 'Pesan gagal terkirim.');
      }
    },
    [qc, setStatus, remove],
  );

  const send = useCallback(
    (pending: PendingMessage) => {
      add(pending);
      void deliver(pending);
    },
    [add, deliver],
  );

  /** Resends with the SAME clientMessageId, so the server can never store it twice. */
  const retry = deliver;
  return { send, retry };
}

export function useMessageMutations() {
  const qc = useQueryClient();
  const apply = (message: MessageDTO) => replaceMessage(qc, message);
  const onError = (error: unknown) => toastError(error, 'Gagal memperbarui pesan.');
  return {
    edit: useMutation({
      mutationFn: ({ id, body, mentionIds }: { id: string; body: string; mentionIds: string[] }) =>
        api.chat.edit(id, { body, mentionIds }),
      onSuccess: apply,
      onError,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.chat.remove(id), onSuccess: apply, onError }),
    react: useMutation({
      mutationFn: ({ id, emoji }: { id: string; emoji: string }) => api.chat.react(id, emoji),
      onSuccess: apply,
      onError,
    }),
  };
}

export function useOpenDirect() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (userId: string) => api.chat.openDirect(userId),
    onSuccess: (channel) => {
      void qc.invalidateQueries({ queryKey: qk.chatChannels });
      navigate(`/chat/${channel.id}`);
    },
    onError: (error) => toastError(error, 'Gagal membuka percakapan.'),
  });
}

export function useOpenProjectChannel() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (projectId: string) => api.chat.projectChannel(projectId),
    onSuccess: (channel) => navigate(`/chat/${channel.id}`),
    onError: (error) => toastError(error, 'Gagal membuka chat proyek.'),
  });
}
