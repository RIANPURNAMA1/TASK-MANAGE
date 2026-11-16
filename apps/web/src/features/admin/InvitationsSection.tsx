import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Clock, Copy, Link2, Mail, MailPlus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  ORG_ROLES,
  ORG_ROLE_LABEL,
  canAssignOrgRole,
  createInvitationSchema,
  type InvitationDTO,
  type OrgRole,
} from '@nexus/shared';
import { Avatar, Button, ErrorState, Field, Input, Modal, Segmented, Select, Skeleton } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import { useCurrentUser } from '../../stores/auth';
import { useDivisionsQuery } from '../divisions/hooks';
import { ADMIN_SURFACE, StatusPill } from './AdminUi';
import { useInvitationMutations, useInvitations } from './hooks';

/** Email or shareable-link invitations (FR-03). */
export function InvitationsSection() {
  const invitations = useInvitations();
  const [creating, setCreating] = useState(false);
  const { revoke } = useInvitationMutations();

  const pending = (invitations.data ?? []).filter((inv) => statusOf(inv) === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-ink-subtle">
          {invitations.data ? (
            <>
              <span className="font-semibold text-ink">{pending} undangan menunggu</span> · {invitations.data.length} total
            </>
          ) : (
            'Undang lewat email atau bagikan tautan undangan.'
          )}
        </p>
        <Button icon={<MailPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          Undang pengguna
        </Button>
      </div>

      {invitations.isPending ? (
        <Skeleton className="h-60 rounded-2xl" />
      ) : invitations.isError ? (
        <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />
      ) : (
        <div className={ADMIN_SURFACE}>
          {invitations.data.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
                <MailPlus className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[0.9375rem] font-bold text-ink">Belum ada undangan</p>
              <p className="mt-1 max-w-sm text-[0.8125rem] text-ink-subtle">
                Undang rekan lewat email atau buat tautan undangan yang bisa dibagikan.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {invitations.data.map((inv) => {
                const status = statusOf(inv);
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 transition-colors hover:bg-canvas/70">
                    <span
                      className={clsx(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        status === 'pending' ? 'bg-brand-subtle text-brand' : 'bg-canvas-deep text-ink-subtle',
                      )}
                    >
                      {inv.email ? <Mail className="h-[18px] w-[18px]" /> : <Link2 className="h-[18px] w-[18px]" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[0.875rem] font-semibold text-ink">
                        <span className="truncate">{inv.email ?? 'Tautan undangan'}</span>
                        <span className="inline-flex h-5 items-center rounded-full border border-line px-2 text-[11px] font-medium text-ink-muted">
                          {ORG_ROLE_LABEL[inv.role]}
                        </span>
                        {inv.divisionName && (
                          <span className="inline-flex h-5 items-center rounded-full bg-canvas-deep px-2 text-[11px] font-medium text-ink-muted">
                            {inv.divisionName}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-ink-subtle">
                        <Avatar user={inv.invitedBy} size="xs" />
                        <span>oleh {inv.invitedBy.name}</span>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1" title={formatDateTime(inv.expiresAt)}>
                          <Clock className="h-3 w-3" aria-hidden />
                          {status === 'expired' ? 'kedaluwarsa' : 'berlaku hingga'} {formatDateTime(inv.expiresAt)}
                          {status === 'pending' && ` (${formatRelative(inv.expiresAt)})`}
                        </span>
                      </p>
                    </div>
                    <InvitationStatus status={status} />
                    {status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<XCircle className="h-4 w-4" />}
                        loading={revoke.isPending && revoke.variables === inv.id}
                        onClick={() => revoke.mutate(inv.id)}
                        className="hover:!text-danger"
                      >
                        Cabut
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {creating && <InviteModal onClose={() => setCreating(false)} />}
    </div>
  );
}

type InviteStatus = 'accepted' | 'revoked' | 'expired' | 'pending';

function statusOf(invitation: InvitationDTO): InviteStatus {
  if (invitation.acceptedAt) return 'accepted';
  if (invitation.revokedAt) return 'revoked';
  if (new Date(invitation.expiresAt) < new Date()) return 'expired';
  return 'pending';
}

function InvitationStatus({ status }: { status: InviteStatus }) {
  if (status === 'accepted') return <StatusPill tone="success">Diterima</StatusPill>;
  if (status === 'revoked') return <StatusPill tone="neutral">Dicabut</StatusPill>;
  if (status === 'expired') return <StatusPill tone="warning">Kedaluwarsa</StatusPill>;
  return <StatusPill tone="info">Menunggu</StatusPill>;
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const me = useCurrentUser();
  const divisions = useDivisionsQuery();
  const { create } = useInvitationMutations();
  const [mode, setMode] = useState<'email' | 'link'>('email');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('MEMBER');
  const [divisionId, setDivisionId] = useState('');
  const [expiresInDays, setExpires] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = createInvitationSchema.safeParse({
      email: mode === 'email' ? email : undefined,
      role,
      divisionId: divisionId || undefined,
      expiresInDays,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Data tidak valid');
    create.mutate(parsed.data, {
      onSuccess: (res) => setLink(res.link),
      onError: (err) => setError(errorMessage(err)),
    });
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success('Tautan disalin.');
  };

  return (
    <Modal open onClose={onClose} title="Undang pengguna">
      {link ? (
        <div className="space-y-4">
          <p className="text-ink-muted">
            {mode === 'email' ? `Undangan telah dikirim ke ${email}. ` : ''}
            Tautan ini hanya ditampilkan sekali — salin sekarang bila ingin membagikannya.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Tautan undangan" onFocus={(e) => e.target.select()} />
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copy()}>
              Salin
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Selesai</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Segmented
            value={mode}
            onChange={setMode}
            items={[
              { value: 'email', label: 'Via email', icon: <Mail /> },
              { value: 'link', label: 'Tautan', icon: <Link2 /> },
            ]}
          />
          {error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[0.8125rem] text-danger-ink">{error}</p>}
          {mode === 'email' && (
            <Field label="Email">{(id) => <Input id={id} type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Peran">
              {(id) => (
                <Select id={id} value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
                  {ORG_ROLES.filter((r) => r !== 'OWNER' && canAssignOrgRole(me.orgRole, r)).map((r) => (
                    <option key={r} value={r}>
                      {ORG_ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Berlaku (hari)">
              {(id) => (
                <Input id={id} type="number" min={1} max={30} value={expiresInDays} onChange={(e) => setExpires(Number(e.target.value))} />
              )}
            </Field>
          </div>
          <Field label="Divisi (opsional)">
            {(id) => (
              <Select id={id} value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                <option value="">— Tanpa divisi —</option>
                {(divisions.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" loading={create.isPending}>
              {mode === 'email' ? 'Kirim undangan' : 'Buat tautan'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
