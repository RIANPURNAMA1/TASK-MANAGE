import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlarmClock, AtSign, BellOff, Megaphone, MessageSquare, UserPlus } from 'lucide-react';
import type { NotificationDTO, NotificationType } from '@nexus/shared';
import { Avatar, EmptyState } from '../../components/ui';
import { formatRelative } from '../../lib/format';
import { useNavigate } from 'react-router-dom';
import { useNotificationMutations } from './hooks';
import { notificationPath, notificationText } from './notificationText';

const typeIcon: Record<NotificationType, ReactNode> = {
  CARD_ASSIGNED: <UserPlus />,
  MENTIONED: <AtSign />,
  COMMENT_ADDED: <MessageSquare />,
  DUE_SOON: <AlarmClock />,
  OVERDUE: <AlarmClock />,
  CHAT_MENTION: <AtSign />,
  ANNOUNCEMENT: <Megaphone />,
};

export function NotificationList({ items, onNavigate }: { items: NotificationDTO[]; onNavigate?: () => void }) {
  const { markRead } = useNotificationMutations();
  const navigate = useNavigate();

  if (items.length === 0) {
    return <EmptyState icon={<BellOff />} title="Tidak ada notifikasi" description="Semua sudah beres untuk saat ini." />;
  }

  const activate = (n: NotificationDTO) => {
    if (!n.readAt) markRead.mutate(n.id);
    const path = notificationPath(n);
    if (path) {
      navigate(path);
      onNavigate?.();
    }
  };

  return (
    <ul className="divide-y divide-line-subtle">
      {items.map((n) => {
        const { title, body } = notificationText(n);
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => activate(n)}
              className={clsx('flex w-full gap-3 px-4 py-3 text-left hover:bg-canvas', !n.readAt && 'bg-brand-soft/60')}
            >
              {n.actor ? (
                <Avatar user={n.actor} size="md" />
              ) : (
                <span
                  className={clsx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4',
                    n.type === 'OVERDUE' ? 'bg-danger-soft text-danger-ink' : 'bg-warning-soft text-warning-ink',
                  )}
                >
                  {typeIcon[n.type]}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{title}</span>
                {body && <span className="line-clamp-2 block text-ink-muted">{body}</span>}
                <span className="mt-0.5 block text-caption text-ink-subtle">
                  {n.data.projectName && `${n.data.projectName} · `}
                  {formatRelative(n.createdAt)}
                </span>
              </span>
              {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Belum dibaca" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
