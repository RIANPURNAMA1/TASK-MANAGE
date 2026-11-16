import { useEffect } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type { NotificationDTO, NotificationPage } from '@nexus/shared';
import { platform } from '@nexus/platform';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryKeys';

type Feed = InfiniteData<NotificationPage, string | undefined>;

export function useNotificationsQuery() {
  return useInfiniteQuery({
    queryKey: qk.notifications,
    queryFn: ({ pageParam }) => api.notifications.list({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useUnreadCount(): number {
  const { data } = useNotificationsQuery();
  return data?.pages[0]?.unreadCount ?? 0;
}

/** Mirrors the unread count onto the tab title / OS badge. */
export function useUnreadBadge() {
  const unread = useUnreadCount();
  useEffect(() => platform.setBadgeCount(unread), [unread]);
}

function patchFeed(qc: QueryClient, fn: (feed: Feed) => Feed) {
  qc.setQueryData<Feed>(qk.notifications, (feed) => (feed ? fn(feed) : feed));
}

/** Called for `notification:new` events. */
export function prependNotification(qc: QueryClient, notification: NotificationDTO) {
  patchFeed(qc, (feed) => {
    const [first, ...rest] = feed.pages;
    if (!first || first.items.some((n) => n.id === notification.id)) return feed;
    return {
      ...feed,
      pages: [
        { ...first, items: [notification, ...first.items], unreadCount: first.unreadCount + 1 },
        ...rest,
      ],
    };
  });
}

export function useNotificationMutations() {
  const qc = useQueryClient();
  const now = () => new Date().toISOString();

  const markRead = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onMutate: (id) =>
      patchFeed(qc, (feed) => {
        const wasUnread = feed.pages.some((p) => p.items.some((n) => n.id === id && !n.readAt));
        return {
          ...feed,
          pages: feed.pages.map((p, i) => ({
            ...p,
            unreadCount: i === 0 && wasUnread ? Math.max(0, p.unreadCount - 1) : p.unreadCount,
            items: p.items.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now() } : n)),
          })),
        };
      }),
    onError: () => void qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onMutate: () =>
      patchFeed(qc, (feed) => ({
        ...feed,
        pages: feed.pages.map((p) => ({
          ...p,
          unreadCount: 0,
          items: p.items.map((n) => (n.readAt ? n : { ...n, readAt: now() })),
        })),
      })),
    onError: () => void qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  return { markRead, markAllRead };
}
