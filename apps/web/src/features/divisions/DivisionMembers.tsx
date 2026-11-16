import { Crown, Trash2, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import { ORG_ROLE_LABEL, type DivisionDTO, type DivisionRole } from '@nexus/shared';
import { Avatar, ErrorState, Select, Skeleton } from '../../components/ui';
import { SettingsCard } from '../settings/SettingsCard';
import { useDivisionMemberMutations, useDivisionMembers } from './hooks';
import { UserPicker } from './UserPicker';

const ROLE_LABEL: Record<DivisionRole, string> = { LEAD: 'Lead divisi', MEMBER: 'Anggota' };

export function DivisionMembers({ division }: { division: DivisionDTO }) {
  const members = useDivisionMembers(division.id);
  const m = useDivisionMemberMutations(division.id);

  if (members.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (members.isError) return <ErrorState error={members.error} onRetry={() => void members.refetch()} />;

  // Leads first, then alphabetical.
  const rows = [...members.data].sort(
    (a, b) => Number(b.role === 'LEAD') - Number(a.role === 'LEAD') || a.user.name.localeCompare(b.user.name),
  );

  return (
    <div className="max-w-4xl space-y-5">
      {division.canManage && (
        <SettingsCard title="Tambah anggota" description="Cari rekan di organisasi lalu pilih untuk menambahkannya sebagai anggota.">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand">
              <UserPlus className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <UserPicker
                excludeIds={members.data.map((x) => x.user.id)}
                onPick={(u) => m.add.mutate({ userId: u.id, role: 'MEMBER' })}
              />
            </div>
          </div>
        </SettingsCard>
      )}

      <SettingsCard
        title="Anggota divisi"
        description={`${rows.length} orang · lead dapat mengelola proyek dan anggota divisi.`}
        bodyClassName=""
      >
        <ul className="divide-y divide-line-subtle">
          {rows.map(({ user, role, orgRole }) => (
            <li key={user.id} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5 transition-colors hover:bg-canvas/70">
              <Avatar user={user} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[0.875rem] font-semibold text-ink">
                  {user.name}
                  {role === 'LEAD' && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Lead divisi" />}
                </p>
                <p className="truncate text-caption text-ink-subtle">{user.email}</p>
              </div>

              <span
                className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-caption font-medium text-ink-muted"
                title="Peran di organisasi"
              >
                {ORG_ROLE_LABEL[orgRole]}
              </span>

              {division.canManage ? (
                <div className="flex items-center gap-1">
                  <Select
                    aria-label={`Peran ${user.name} di divisi`}
                    className="h-9 w-36 rounded-xl"
                    value={role}
                    onChange={(e) => m.setRole.mutate({ userId: user.id, role: e.target.value as DivisionRole })}
                  >
                    <option value="MEMBER">{ROLE_LABEL.MEMBER}</option>
                    <option value="LEAD">{ROLE_LABEL.LEAD}</option>
                  </Select>
                  <button
                    type="button"
                    aria-label={`Keluarkan ${user.name}`}
                    title="Keluarkan dari divisi"
                    onClick={() => m.remove.mutate(user.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-subtle opacity-60 transition hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <span
                  className={clsx(
                    'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-bold',
                    role === 'LEAD' ? 'bg-warning-soft text-warning-ink' : 'bg-canvas-deep text-ink-muted',
                  )}
                >
                  {ROLE_LABEL[role]}
                </span>
              )}
            </li>
          ))}
        </ul>
      </SettingsCard>
    </div>
  );
}
