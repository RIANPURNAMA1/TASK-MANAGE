import type { ActivityDTO } from '@nexus/shared';
import { Avatar } from '../../components/ui';
import { formatDateTime, formatRelative } from '../../lib/format';
import { activitySentence } from './activityText';

/** Vertical timeline: avatars sit on a thin line connecting consecutive events. */
export function ActivityList({ items }: { items: ActivityDTO[] }) {
  if (items.length === 0) return <p className="py-6 text-center text-[0.875rem] text-ink-subtle">Belum ada aktivitas.</p>;
  return (
    <ol className="relative">
      {items.map((a, i) => (
        <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-3 top-7 h-[calc(100%-1.75rem)] w-px bg-line" aria-hidden />}
          <Avatar user={a.actor} size="sm" />
          <p className="min-w-0 flex-1 pt-0.5 text-[0.875rem] leading-snug text-ink-muted">
            <span className="font-bold text-ink">{a.actor.name}</span> {activitySentence(a)}
            <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)} className="mt-0.5 block text-caption text-ink-subtle">
              {formatRelative(a.createdAt)}
            </time>
          </p>
        </li>
      ))}
    </ol>
  );
}
