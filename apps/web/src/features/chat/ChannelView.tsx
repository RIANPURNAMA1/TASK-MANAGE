import { useEffect, useMemo, useState } from 'react';
import type { ChannelDetail, MessageDTO } from '@nexus/shared';
import { ErrorState, Skeleton } from '../../components/ui';
import { useCurrentUser } from '../../stores/auth';
import { flattenFeed } from './cache';
import { ChannelHeader } from './ChannelHeader';
import { Composer } from './Composer';
import { useChannelQuery, useChannelRoom, useMarkRead, useMessagesQuery } from './hooks';
import { MessageList, type ViewMessage } from './MessageList';
import { useActiveChannel, usePending, type PendingMessage } from './stores';
import { TypingIndicator } from './TypingIndicator';

const NO_PENDING: PendingMessage[] = [];

export function ChannelView({ channelId }: { channelId: string }) {
  const channel = useChannelQuery(channelId);
  useChannelRoom(channelId);

  const setActive = useActiveChannel((s) => s.setChannelId);
  useEffect(() => {
    setActive(channelId);
    return () => setActive(null);
  }, [channelId, setActive]);

  if (channel.isPending) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-16 w-1/2" />
      </div>
    );
  }
  if (channel.isError) {
    return (
      <div className="m-auto w-full max-w-md p-6">
        <ErrorState error={channel.error} onRetry={() => void channel.refetch()} />
      </div>
    );
  }
  return <Conversation channel={channel.data} />;
}

function Conversation({ channel }: { channel: ChannelDetail }) {
  const me = useCurrentUser();
  const feed = useMessagesQuery(channel.id);
  const pending = usePending((s) => s.byChannel[channel.id] ?? NO_PENDING);
  const markRead = useMarkRead(channel.id);
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);

  const confirmed = useMemo(() => flattenFeed(feed.data), [feed.data]);

  const messages = useMemo<ViewMessage[]>(() => {
    const sent = new Set(confirmed.map((m) => m.clientMessageId));
    const outgoing = pending
      .filter((p) => !sent.has(p.input.clientMessageId))
      .map((p) => pendingToView(p, me, channel));
    return [...confirmed, ...outgoing];
  }, [confirmed, pending, me, channel]);

  // Mark as read on open, whenever someone else posts while we're looking, and on tab focus.
  const newestFromOthers = useMemo(
    () => [...confirmed].reverse().find((m) => m.author.id !== me.id)?.id,
    [confirmed, me.id],
  );
  useEffect(() => {
    if (document.visibilityState === 'visible') markRead();
  }, [newestFromOthers, markRead]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && markRead();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  const members = useMemo(() => channel.members.map((m) => m.user).filter((u) => u.id !== me.id), [channel.members, me.id]);

  return (
    <>
      <ChannelHeader channel={channel} />
      <MessageList
        channel={channel}
        messages={messages}
        loading={feed.isPending}
        error={feed.isError ? feed.error : null}
        hasOlder={Boolean(feed.hasNextPage)}
        loadingOlder={feed.isFetchingNextPage}
        onLoadOlder={() => void feed.fetchNextPage()}
        onRetryLoad={() => void feed.refetch()}
        onReply={setReplyTo}
        members={members}
      />
      <TypingIndicator channelId={channel.id} />
      <Composer channel={channel} members={members} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
    </>
  );
}

/** Renders an unconfirmed outgoing message with the same component as real ones. */
function pendingToView(p: PendingMessage, me: ReturnType<typeof useCurrentUser>, channel: ChannelDetail): ViewMessage {
  return {
    id: `pending:${p.input.clientMessageId}`,
    channelId: p.channelId,
    clientMessageId: p.input.clientMessageId,
    author: { id: me.id, name: me.name, email: me.email, avatarUrl: me.avatarUrl },
    body: p.input.body,
    replyTo: p.replyTo,
    mentions: channel.members.map((m) => m.user).filter((u) => p.input.mentionIds.includes(u.id)),
    reactions: [],
    attachments: p.attachments,
    editedAt: null,
    deletedAt: null,
    createdAt: p.createdAt,
    pending: p,
  };
}
