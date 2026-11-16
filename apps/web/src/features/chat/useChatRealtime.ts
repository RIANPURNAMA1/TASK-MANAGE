import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MessageDTO } from '@nexus/shared';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryKeys';
import { socket } from '../../lib/socket';
import { useAuthStore } from '../../stores/auth';
import { appendMessage, applyRead, bumpChannel, clearUnread, replaceMessage } from './cache';
import { useActiveChannel, usePending, usePresence, useTyping } from './stores';

/**
 * Applies chat events to the cache. Messages arrive on the user room, so the sidebar
 * (unread counts, previews) stays current on every page, not only inside /chat.
 */
export function useChatRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const isOpenAndVisible = (channelId: string) =>
      useActiveChannel.getState().channelId === channelId && document.visibilityState === 'visible';

    const onMessage = ({ message }: { channelId: string; message: MessageDTO }) => {
      const mine = message.author.id === useAuthStore.getState().user?.id;
      appendMessage(qc, message);
      if (mine) usePending.getState().remove(message.channelId, message.clientMessageId);
      useTyping.getState().clear(message.channelId, message.author.id);
      const known = bumpChannel(qc, message, !mine && !isOpenAndVisible(message.channelId));
      if (!known) void qc.invalidateQueries({ queryKey: qk.chatChannels });
    };

    const onUpdated = ({ message }: { channelId: string; message: MessageDTO }) => replaceMessage(qc, message);

    const onRead = ({ channelId, userId, lastReadAt }: { channelId: string; userId: string; lastReadAt: string }) => {
      applyRead(qc, channelId, userId, lastReadAt);
      // Read on another device of mine.
      if (userId === useAuthStore.getState().user?.id) clearUnread(qc, channelId);
    };

    const onPresence = ({ userId, online }: { userId: string; online: boolean }) =>
      usePresence.getState().setOnline(userId, online);

    const seedPresence = () => {
      api.chat
        .presence()
        .then((ids) => usePresence.getState().replace(ids))
        .catch(() => undefined);
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:message-updated', onUpdated);
    socket.on('chat:read', onRead);
    socket.on('presence:changed', onPresence);
    socket.on('connect', seedPresence);
    if (socket.connected) seedPresence();

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:message-updated', onUpdated);
      socket.off('chat:read', onRead);
      socket.off('presence:changed', onPresence);
      socket.off('connect', seedPresence);
    };
  }, [qc]);
}
