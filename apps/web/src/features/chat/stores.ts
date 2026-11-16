import { create } from 'zustand';
import type { AttachmentDTO, MessageDTO, SendMessageInput } from '@nexus/shared';

/** Channel currently open on screen; its incoming messages don't count as unread. */
interface ActiveChannelState {
  channelId: string | null;
  setChannelId: (id: string | null) => void;
}

export const useActiveChannel = create<ActiveChannelState>((set) => ({
  channelId: null,
  setChannelId: (channelId) => set({ channelId }),
}));

/** User ids online in the organization (FR-33). Seeded via REST, kept fresh by `presence:changed`. */
interface PresenceState {
  online: Set<string>;
  replace: (ids: string[]) => void;
  setOnline: (userId: string, online: boolean) => void;
}

export const usePresence = create<PresenceState>((set) => ({
  online: new Set(),
  replace: (ids) => set({ online: new Set(ids) }),
  setOnline: (userId, online) =>
    set((s) => {
      const next = new Set(s.online);
      if (online) next.add(userId);
      else next.delete(userId);
      return { online: next };
    }),
}));

export function useIsOnline(userId: string | undefined): boolean {
  return usePresence((s) => (userId ? s.online.has(userId) : false));
}

/** Who is typing where. Entries expire on read (see TYPING_TTL_MS). */
export const TYPING_TTL_MS = 4000;

interface TypingState {
  byChannel: Record<string, Record<string, { name: string; at: number }>>;
  touch: (channelId: string, user: { id: string; name: string }) => void;
  clear: (channelId: string, userId: string) => void;
}

export const useTyping = create<TypingState>((set) => ({
  byChannel: {},
  touch: (channelId, user) =>
    set((s) => ({
      byChannel: {
        ...s.byChannel,
        [channelId]: { ...s.byChannel[channelId], [user.id]: { name: user.name, at: Date.now() } },
      },
    })),
  clear: (channelId, userId) =>
    set((s) => {
      const current = s.byChannel[channelId];
      if (!current?.[userId]) return s;
      const { [userId]: _removed, ...rest } = current;
      return { byChannel: { ...s.byChannel, [channelId]: rest } };
    }),
}));

/**
 * Optimistic outgoing messages (not yet confirmed by the server). A failed message keeps
 * its `clientMessageId`, so "Coba lagi" can never create a duplicate (PRD §6).
 */
export interface PendingMessage {
  channelId: string;
  input: Required<Pick<SendMessageInput, 'clientMessageId' | 'body'>> & {
    replyToId: string | null;
    mentionIds: string[];
    attachmentIds: string[];
  };
  replyTo: MessageDTO['replyTo'];
  attachments: AttachmentDTO[];
  status: 'sending' | 'failed';
  createdAt: string;
}

interface PendingState {
  byChannel: Record<string, PendingMessage[]>;
  add: (message: PendingMessage) => void;
  setStatus: (channelId: string, clientMessageId: string, status: PendingMessage['status']) => void;
  remove: (channelId: string, clientMessageId: string) => void;
}

export const usePending = create<PendingState>((set) => ({
  byChannel: {},
  add: (message) =>
    set((s) => ({
      byChannel: { ...s.byChannel, [message.channelId]: [...(s.byChannel[message.channelId] ?? []), message] },
    })),
  setStatus: (channelId, clientMessageId, status) =>
    set((s) => ({
      byChannel: {
        ...s.byChannel,
        [channelId]: (s.byChannel[channelId] ?? []).map((m) =>
          m.input.clientMessageId === clientMessageId ? { ...m, status } : m,
        ),
      },
    })),
  remove: (channelId, clientMessageId) =>
    set((s) => {
      const list = s.byChannel[channelId];
      if (!list?.some((m) => m.input.clientMessageId === clientMessageId)) return s;
      return {
        byChannel: { ...s.byChannel, [channelId]: list.filter((m) => m.input.clientMessageId !== clientMessageId) },
      };
    }),
}));
