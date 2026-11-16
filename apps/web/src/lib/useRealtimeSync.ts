import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ServerToClientEvents } from '@nexus/shared';
import { platform } from '@nexus/platform';
import { invalidateCardViews, removeCard, removeList, setLabels, upsertCard, upsertList } from '../features/board/cache';
import { prependNotification } from '../features/notifications/hooks';
import { notificationPath, notificationText } from '../features/notifications/notificationText';
import { useAuthStore } from '../stores/auth';
import { api } from './api';
import { qk } from './queryKeys';
import { socket } from './socket';

/** Chat/presence events are handled by `useChatRealtime`, announcements by `useAnnouncementRealtime`. */
type CoreEvent = Exclude<keyof ServerToClientEvents, `chat:${string}` | 'presence:changed' | 'announcement:changed'>;
type Handlers = { [E in CoreEvent]: ServerToClientEvents[E] };

/**
 * Applies server-pushed events to the TanStack Query cache so every open view updates
 * within the NFR-03 budget (< 1 s) without refetching. Mounted once in the app shell.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const handlers: Handlers = {
      'card:upserted': ({ card }) => {
        upsertCard(qc, card);
        invalidateCardViews(qc, card.id);
      },
      'card:removed': ({ projectId, cardId }) => {
        removeCard(qc, projectId, cardId);
        invalidateCardViews(qc, cardId);
      },
      'card:detail-changed': ({ cardId }) => void qc.invalidateQueries({ queryKey: qk.card(cardId) }),
      'list:upserted': ({ list }) => upsertList(qc, list),
      'list:removed': ({ projectId, listId }) => removeList(qc, projectId, listId),
      'labels:changed': ({ projectId, labels }) => setLabels(qc, projectId, labels),
      'project:changed': ({ projectId }) => {
        void qc.invalidateQueries({ queryKey: qk.project(projectId) });
        void qc.invalidateQueries({ queryKey: qk.board(projectId) });
        void qc.invalidateQueries({ queryKey: qk.projects });
      },
      'notification:new': ({ notification }) => {
        prependNotification(qc, notification);
        const { title, body } = notificationText(notification);
        const path = notificationPath(notification);
        const open = () => path && navigate(path);
        toast(title, { description: body, action: path ? { label: 'Buka', onClick: open } : undefined });
        void platform.notify({ title, body, onClick: open });
      },
      'session:revoked': () => {
        api.http.setAccessToken(null);
        useAuthStore.getState().signOut();
        toast.error('Sesi Anda telah diakhiri dari perangkat lain.');
      },
    };

    // When a reconnect is refused because the access token expired, refresh and retry.
    const onConnectError = async (error: Error) => {
      if (!/unauth|jwt|token/i.test(error.message)) return;
      const auth = await api.auth.refresh().catch(() => null);
      if (auth) socket.connect();
      else useAuthStore.getState().signOut();
    };

    // Data may have changed while we were offline.
    const onReconnect = () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'meta' });

    for (const [event, handler] of Object.entries(handlers)) socket.on(event as keyof Handlers, handler);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect', onReconnect);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event as keyof Handlers, handler);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect', onReconnect);
    };
  }, [qc, navigate]);
}
