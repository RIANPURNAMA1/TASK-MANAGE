import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { CountBadge, Menu, Spinner, Tooltip } from '../ui';
import { railItemClass } from './railItem';
import { useNotificationMutations, useNotificationsQuery, useUnreadCount } from '../../features/notifications/hooks';
import { NotificationList } from '../../features/notifications/NotificationList';

export function NotificationBell() {
  const feed = useNotificationsQuery();
  const unread = useUnreadCount();
  const { markAllRead } = useNotificationMutations();
  const items = (feed.data?.pages[0]?.items ?? []).slice(0, 8);

  return (
    <Menu
      placement="side-start"
      className="w-[380px] overflow-hidden p-0"
      trigger={({ toggle, open }) => (
        <Tooltip content="Notifikasi" side="right">
          <button
            type="button"
            onClick={toggle}
            aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ''}`}
            aria-expanded={open}
            className={railItemClass(open)}
          >
            <Bell />
            <CountBadge count={unread} />
          </button>
        </Tooltip>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
            <h2 className="text-h3 text-ink">Notifikasi</h2>
            {unread > 0 && (
              <button type="button" onClick={() => markAllRead.mutate()} className="text-caption font-medium text-brand hover:underline">
                Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {feed.isPending ? (
              <div className="flex justify-center p-6 text-brand">
                <Spinner />
              </div>
            ) : (
              <NotificationList items={items} onNavigate={close} />
            )}
          </div>
          <Link
            to="/notifications"
            onClick={close}
            className="block border-t border-line-subtle py-2.5 text-center font-medium text-brand hover:bg-canvas"
          >
            Lihat semua
          </Link>
        </div>
      )}
    </Menu>
  );
}
