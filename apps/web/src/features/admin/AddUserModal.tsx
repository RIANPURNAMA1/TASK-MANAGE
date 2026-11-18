import { useState, type FormEvent } from 'react';
import { Copy, Dices } from 'lucide-react';
import { toast } from 'sonner';
import { ORG_ROLES, ORG_ROLE_LABEL, canAssignOrgRole, createUserSchema, type OrgRole } from '@nexus/shared';
import { Button, Field, Input, Modal, Select } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { useCurrentUser } from '../../stores/auth';
import { useDivisionsQuery } from '../divisions/hooks';
import { useAdminUserMutations } from './hooks';

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function randomPassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join('');
}

/** Admin menambahkan pengguna langsung: tanpa undangan dan tanpa verifikasi email. */
export function AddUserModal({ onClose }: { onClose: () => void }) {
  const me = useCurrentUser();
  const divisions = useDivisionsQuery();
  const { create } = useAdminUserMutations();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => randomPassword());
  const [role, setRole] = useState<OrgRole>('MEMBER');
  const [divisionId, setDivisionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = createUserSchema.safeParse({ name, email, password, role, divisionId: divisionId || undefined });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Data tidak valid');
    create.mutate(parsed.data, {
      onSuccess: (user) => setCreated({ name: user.name, email: user.email, password }),
      onError: (err) => setError(errorMessage(err)),
    });
  };

  const copyCredentials = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(`Email: ${created.email}\nKata sandi: ${created.password}`);
    toast.success('Email dan kata sandi disalin.');
  };

  return (
    <Modal open onClose={onClose} title="Tambah pengguna">
      {created ? (
        <div className="space-y-4">
          <p className="text-ink-muted">
            Akun <span className="font-semibold text-ink">{created.name}</span> sudah aktif dan bisa langsung masuk. Kata
            sandi ini hanya ditampilkan sekarang — salin dan berikan ke pengguna.
          </p>
          <div className="space-y-1 rounded-xl border border-line bg-canvas px-4 py-3 text-[0.875rem]">
            <p>
              <span className="text-ink-subtle">Email:</span> <span className="font-medium text-ink">{created.email}</span>
            </p>
            <p>
              <span className="text-ink-subtle">Kata sandi:</span>{' '}
              <span className="font-mono font-medium text-ink">{created.password}</span>
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copyCredentials()}>
              Salin
            </Button>
            <Button onClick={onClose}>Selesai</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[0.8125rem] text-danger-ink">
              {error}
            </p>
          )}
          <Field label="Nama">{(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Email">
            {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Kata sandi awal">
            {(id) => (
              <div className="flex gap-2">
                <Input id={id} value={password} autoComplete="off" onChange={(e) => setPassword(e.target.value)} />
                <Button variant="secondary" icon={<Dices className="h-4 w-4" />} onClick={() => setPassword(randomPassword())}>
                  Acak
                </Button>
              </div>
            )}
          </Field>
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
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" loading={create.isPending}>
              Tambah pengguna
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
