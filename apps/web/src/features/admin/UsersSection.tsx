import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { LogOut, Monitor, MoreHorizontal, Search, UserCheck, UserPlus, UserX } from 'lucide-react';
import {
  ORG_ROLES,
  ORG_ROLE_LABEL,
  canAssignOrgRole,
  type AdminUserDTO,
  type OrgRole,
  type UserSummary,
} from '@nexus/shared';
import {
  Avatar,
  Button,
  ConfirmDialog,
  ErrorState,
  Input,
  Menu,
  MenuItem,
  Segmented,
  Select,
  Skeleton,
} from '../../components/ui';
import { useCurrentUser } from '../../stores/auth';
import { UserPicker } from '../divisions/UserPicker';
import { AddUserModal } from './AddUserModal';
import { ADMIN_SURFACE, StatusPill } from './AdminUi';
import { useAdminUserMutations, useAdminUsers } from './hooks';

/** Organization user management (FR-47, FR-48). */
export function UsersSection() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'deactivated'>('active');
  const [deactivating, setDeactivating] = useState<AdminUserDTO | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);

  const users = useAdminUsers({ q: q || undefined, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Cari nama atau email…"
            aria-label="Cari pengguna"
            className="h-10 w-72 rounded-xl bg-surface pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          {users.data && (
            <span className="text-[0.8125rem] font-medium tabular-nums text-ink-subtle">{users.data.length} pengguna</span>
          )}
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Tambah pengguna
          </Button>
          <Segmented
            value={status}
            onChange={setStatus}
            items={[
              { value: 'active', label: 'Aktif' },
              { value: 'deactivated', label: 'Nonaktif' },
            ]}
          />
        </div>
      </div>

      {users.isPending ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <div className={clsx(ADMIN_SURFACE, 'overflow-x-auto')}>
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-line text-[0.8125rem] font-medium text-ink-subtle">
                <th className="h-12 px-4 pl-6 font-medium">Pengguna</th>
                <th className="h-12 px-4 font-medium">Peran</th>
                <th className="h-12 px-4 font-medium">Status</th>
                <th className="h-12 px-4 text-right font-medium">Task aktif</th>
                <th className="h-12 px-4 text-right font-medium">Sesi</th>
                <th className="h-12 w-14 px-4 pr-6" aria-label="Aksi" />
              </tr>
            </thead>
            <tbody>
              {users.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[0.875rem] text-ink-subtle">
                    {q ? `Tidak ada pengguna yang cocok dengan “${q}”.` : 'Tidak ada pengguna.'}
                  </td>
                </tr>
              )}
              {users.data.map((u) => (
                <UserRow key={u.id} user={u} onDeactivate={() => setDeactivating(u)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddUserModal onClose={() => setAdding(false)} />}
      {deactivating && <DeactivateDialog user={deactivating} onClose={() => setDeactivating(null)} />}
    </div>
  );
}

function UserRow({ user, onDeactivate }: { user: AdminUserDTO; onDeactivate: () => void }) {
  const me = useCurrentUser();
  const m = useAdminUserMutations();
  const isSelf = me.id === user.id;
  const canEditRole = !isSelf && !user.deactivatedAt && canAssignOrgRole(me.orgRole, user.orgRole);

  return (
    <tr className="border-b border-line-subtle transition-colors last:border-0 hover:bg-canvas/70">
      <td className="py-3.5 pl-6 pr-4">
        <div className="flex items-center gap-3">
          <Avatar user={user} size="lg" className={clsx(user.deactivatedAt && 'opacity-50 grayscale')} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-[0.875rem] font-semibold text-ink">
              {user.name}
              {isSelf && (
                <span className="rounded-full bg-brand-subtle px-2 py-px text-[11px] font-bold text-brand-strong">Anda</span>
              )}
            </p>
            <p className="truncate text-caption text-ink-subtle">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        {canEditRole ? (
          <Select
            aria-label={`Peran ${user.name}`}
            className="h-9 w-40 rounded-xl"
            value={user.orgRole}
            onChange={(e) => m.setRole.mutate({ id: user.id, role: e.target.value as OrgRole })}
          >
            {ORG_ROLES.filter((r) => canAssignOrgRole(me.orgRole, r)).map((r) => (
              <option key={r} value={r}>
                {ORG_ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        ) : (
          <span className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-caption font-medium text-ink-muted">
            {ORG_ROLE_LABEL[user.orgRole]}
          </span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {user.deactivatedAt ? (
          <StatusPill tone="danger">Nonaktif</StatusPill>
        ) : user.emailVerified ? (
          <StatusPill tone="success">Aktif</StatusPill>
        ) : (
          <StatusPill tone="warning">Belum verifikasi</StatusPill>
        )}
      </td>
      <td className="px-4 py-3.5 text-right text-[0.875rem] font-semibold tabular-nums text-ink">
        {user.openTaskCount || <span className="font-normal text-ink-subtle/60">—</span>}
      </td>
      <td className="px-4 py-3.5 text-right">
        <span
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold tabular-nums text-ink-muted"
          title={`${user.activeSessionCount} sesi aktif`}
        >
          <Monitor className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />
          {user.activeSessionCount}
        </span>
      </td>
      <td className="py-3.5 pl-4 pr-6 text-right">
        {!isSelf && canAssignOrgRole(me.orgRole, user.orgRole) && (
          <Menu
            className="w-52"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label={`Aksi untuk ${user.name}`}
                className={clsx(
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-canvas-deep hover:text-ink',
                  open && 'bg-canvas-deep text-ink',
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<LogOut />} disabled={user.activeSessionCount === 0} onSelect={() => (close(), m.revokeSessions.mutate(user.id))}>
                  Reset semua sesi
                </MenuItem>
                {user.deactivatedAt ? (
                  <MenuItem icon={<UserCheck />} onSelect={() => (close(), m.reactivate.mutate(user.id))}>
                    Aktifkan kembali
                  </MenuItem>
                ) : (
                  <MenuItem icon={<UserX />} danger onSelect={() => (close(), onDeactivate())}>
                    Nonaktifkan akun
                  </MenuItem>
                )}
              </>
            )}
          </Menu>
        )}
      </td>
    </tr>
  );
}

function DeactivateDialog({ user, onClose }: { user: AdminUserDTO; onClose: () => void }) {
  const { deactivate } = useAdminUserMutations();
  const [transferTo, setTransferTo] = useState<UserSummary | null>(null);

  return (
    <ConfirmDialog
      open
      title={`Nonaktifkan ${user.name}?`}
      description="Pengguna tidak bisa masuk lagi dan semua sesinya diakhiri. Task tetap tersimpan."
      confirmLabel="Nonaktifkan"
      destructive
      loading={deactivate.isPending}
      onClose={onClose}
      onConfirm={() =>
        deactivate.mutate({ id: user.id, transferToUserId: transferTo?.id ?? null }, { onSuccess: onClose })
      }
    >
      <div className="space-y-2">
        <p className="font-medium text-ink">
          Pindahkan {user.openTaskCount} task aktif ke <span className="text-ink-subtle">(opsional)</span>
        </p>
        {transferTo ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-line p-2.5">
            <Avatar user={transferTo} size="md" />
            <span className="flex-1 font-medium">{transferTo.name}</span>
            <button type="button" className="text-caption font-medium text-brand" onClick={() => setTransferTo(null)}>
              Ganti
            </button>
          </div>
        ) : (
          <UserPicker excludeIds={[user.id]} onPick={setTransferTo} placeholder="Pilih pengguna penerima…" />
        )}
        <p className="text-caption text-ink-subtle">Jika kosong, task tetap ada tanpa assignee ini.</p>
      </div>
    </ConfirmDialog>
  );
}
