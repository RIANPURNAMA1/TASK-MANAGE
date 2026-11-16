import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { ChannelDetail, ChannelDTO, MessageDTO, MessagePage } from '@nexus/shared';
import { qk } from '../../lib/queryKeys';

/** pages[0] is the newest page; later pages hold older messages. Items inside a page are oldest-first. */
export type MessageFeed = InfiniteData<MessagePage, string | undefined>;

/** Oldest-first flat list across all loaded pages. */
export function flattenFeed(feed: { pages: MessagePage[] } | undefined): MessageDTO[] {
  if (!feed) return [];
  return [...feed.pages].reverse().flatMap((p) => p.items);
}

function feedHas(feed: MessageFeed, message: MessageDTO): boolean {
  return feed.pages.some((p) => p.items.some((m) => m.id === message.id || m.clientMessageId === message.clientMessageId));
}

/** Appends a new message to a loaded channel feed (no-op if absent or already present). */
export function appendMessage(qc: QueryClient, message: MessageDTO): void {
  qc.setQueryData<MessageFeed>(qk.chatMessages(message.channelId), (feed) => {
    if (!feed || feedHas(feed, message)) return feed;
    const [newest, ...older] = feed.pages;
    if (!newest) return feed;
    return { ...feed, pages: [{ ...newest, items: [...newest.items, message] }, ...older] };
  });
}

/** Replaces an edited / deleted / re-reacted message wherever it is loaded. */
export function replaceMessage(qc: QueryClient, message: MessageDTO): void {
  qc.setQueryData<MessageFeed>(qk.chatMessages(message.channelId), (feed) =>
    feed
      ? {
          ...feed,
          pages: feed.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === message.id ? message : m)) })),
        }
      : feed,
  );
  patchChannel(qc, message.channelId, (c) =>
    c.lastMessage?.id === message.id ? { ...c, lastMessage: { ...c.lastMessage, body: message.body } } : c,
  );
}

function patchChannel(qc: QueryClient, channelId: string, fn: (c: ChannelDTO) => ChannelDTO): void {
  qc.setQueryData<ChannelDTO[]>(qk.chatChannels, (list) => list?.map((c) => (c.id === channelId ? fn(c) : c)));
  qc.setQueryData<ChannelDetail>(qk.chatChannel(channelId), (d) => (d ? { ...d, ...fn(d) } : d));
}

/**
 * Updates the sidebar for an incoming message. Returns false when the channel is not in
 * the cached list (e.g. a brand-new DM), so the caller can refetch the list.
 */
export function bumpChannel(qc: QueryClient, message: MessageDTO, countAsUnread: boolean): boolean {
  const list = qc.getQueryData<ChannelDTO[]>(qk.chatChannels);
  if (list && !list.some((c) => c.id === message.channelId)) return false;
  patchChannel(qc, message.channelId, (c) => ({
    ...c,
    lastMessageAt: message.createdAt,
    lastMessage: { id: message.id, authorName: message.author.name, body: message.body, createdAt: message.createdAt },
    unreadCount: countAsUnread ? c.unreadCount + 1 : c.unreadCount,
  }));
  return true;
}

export function clearUnread(qc: QueryClient, channelId: string): void {
  patchChannel(qc, channelId, (c) => (c.unreadCount === 0 ? c : { ...c, unreadCount: 0 }));
}

/** Read receipt from `chat:read` (FR-33). */
export function applyRead(qc: QueryClient, channelId: string, userId: string, lastReadAt: string): void {
  qc.setQueryData<ChannelDetail>(qk.chatChannel(channelId), (d) =>
    d ? { ...d, members: d.members.map((m) => (m.user.id === userId ? { ...m, lastReadAt } : m)) } : d,
  );
}
