import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { Button, ErrorState, Skeleton } from '../../components/ui';
import { formatDateTime, formatRelative } from '../../lib/format';
import { useSessionMutations, useSessions } from './hooks';
import { SettingsCard } from './SettingsCard';

/** Active sessions per device with remote logout (FR-04). */
export function SessionsSection() {
  const sessions = useSessions();
  const { revoke, revokeOthers } = useSessionMutations();

  if (sessions.isPending) return <Skeleton className="h-48 rounded-2xl" />;
  if (sessions.isError) return <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />;

  const hasOthers = sessions.data.some((s) => !s.isCurrent);

  return (
    <SettingsCard
      title="Sesi aktif"
      description="Perangkat yang sedang masuk ke akun Anda. Keluarkan perangkat yang tidak Anda kenali."
      actions={
        hasOthers && (
          <Button variant="secondary" size="sm" icon={<LogOut className="h-4 w-4" />} loading={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
            Keluar dari perangkat lain
          </Button>
        )
      }
      bodyClassName=""
    >
      <ul className="divide-y divide-line-subtle">
        {sessions.data.map((s) => (
          <li key={s.id} className="flex items-center gap-4 px-6 py-4">
            <span
              className={
                s.isCurrent
                  ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand'
                  : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas-deep text-ink-muted'
              }
            >
              {s.deviceType === 'DESKTOP' ? <Monitor className="h-[18px] w-[18px]" /> : <Smartphone className="h-[18px] w-[18px]" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[0.875rem] font-semibold text-ink">
                {s.deviceName}
                {s.isCurrent && (
                  <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-soft px-2 text-[11px] font-bold text-success-ink">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Perangkat ini
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-caption text-ink-subtle">
                {s.ipAddress ?? 'IP tidak diketahui'} · aktif {formatRelative(s.lastUsedAt)} · masuk {formatDateTime(s.createdAt)}
              </p>
            </div>
            {!s.isCurrent && (
              <Button
                variant="ghost"
                size="sm"
                icon={<LogOut className="h-4 w-4" />}
                loading={revoke.isPending && revoke.variables === s.id}
                onClick={() => revoke.mutate(s.id)}
              >
                Keluarkan
              </Button>
            )}
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
