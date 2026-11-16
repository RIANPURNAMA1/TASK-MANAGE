import { CheckCheck } from 'lucide-react';
import { Button, Card, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { useNotificationMutations, useNotificationsQuery, useUnreadCount } from './hooks';
import { NotificationList } from './NotificationList';

export function NotificationsPage() {
  const feed = useNotificationsQuery();
  const unread = useUnreadCount();
  const { markAllRead } = useNotificationMutations();
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageHeader
        title="Notifikasi"
        description={unread > 0 ? `${unread} belum dibaca` : 'Semua notifikasi sudah dibaca'}
        actions={
          unread > 0 && (
            <Button variant="secondary" size="sm" icon={<CheckCheck className="h-4 w-4" />} onClick={() => markAllRead.mutate()}>
              Tandai semua dibaca
            </Button>
          )
        }
      />
      {feed.isPending ? (
        <Skeleton className="h-64" />
      ) : feed.isError ? (
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <NotificationList items={items} />
          {feed.hasNextPage && (
            <div className="border-t border-line-subtle p-3 text-center">
              <Button variant="ghost" size="sm" loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
                Muat lagi
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
