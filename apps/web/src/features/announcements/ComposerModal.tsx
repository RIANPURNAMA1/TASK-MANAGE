import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Building2, FolderKanban, Globe2, Pin, Send } from 'lucide-react';
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  type AnnouncementDetail,
  type AnnouncementScope,
} from '@nexus/shared';
import { Button, Field, Input, Modal, Select, Spinner, Toggle } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { useAnnouncementMutations, useAnnouncementTargets } from './hooks';
import { RichEditor } from './RichEditor';

const SCOPE_OPTIONS: { value: AnnouncementScope; label: string; hint: string; icon: ReactNode }[] = [
  { value: 'ORGANIZATION', label: 'Perusahaan', hint: 'Semua anggota (kecuali tamu)', icon: <Globe2 /> },
  { value: 'DIVISION', label: 'Divisi', hint: 'Anggota satu divisi', icon: <Building2 /> },
  { value: 'PROJECT', label: 'Proyek', hint: 'Anggota satu proyek', icon: <FolderKanban /> },
];

/** Create a new announcement, or edit the title/body of an existing one. */
export function ComposerModal({
  open,
  onClose,
  editing,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  editing?: AnnouncementDetail;
  onCreated?: (id: string) => void;
}) {
  const targets = useAnnouncementTargets();
  const { create, update } = useAnnouncementMutations();

  const allowed = useMemo(() => {
    const t = targets.data;
    if (!t) return [];
    return SCOPE_OPTIONS.filter(
      (o) =>
        (o.value === 'ORGANIZATION' && t.organization) ||
        (o.value === 'DIVISION' && t.divisions.length > 0) ||
        (o.value === 'PROJECT' && t.projects.length > 0),
    );
  }, [targets.data]);

  const [scope, setScope] = useState<AnnouncementScope | null>(null);
  const [divisionId, setDivisionId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeScope = scope ?? allowed[0]?.value ?? null;
  const saving = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (editing) {
      const parsed = updateAnnouncementSchema.safeParse({ title, body });
      if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Data tidak valid');
      if (!body) return setError('Isi pengumuman tidak boleh kosong');
      update.mutate({ id: editing.id, input: parsed.data }, { onSuccess: onClose, onError: (err) => setError(errorMessage(err)) });
      return;
    }
    if (!activeScope) return;
    const parsed = createAnnouncementSchema.safeParse({
      scope: activeScope,
      divisionId: activeScope === 'DIVISION' ? divisionId || targets.data?.divisions[0]?.id : undefined,
      projectId: activeScope === 'PROJECT' ? projectId || targets.data?.projects[0]?.id : undefined,
      title,
      body,
      pinned,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Data tidak valid');
    if (!body) return setError('Isi pengumuman tidak boleh kosong');
    create.mutate(parsed.data, {
      onSuccess: (a) => {
        onClose();
        onCreated?.(a.id);
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={editing ? 'Ubah pengumuman' : 'Buat pengumuman'}
      description={editing ? 'Perubahan langsung terlihat oleh semua penerima.' : 'Penerima akan mendapat notifikasi di aplikasi dan email.'}
    >
      {targets.isPending && !editing ? (
        <div className="flex justify-center py-10 text-brand">
          <Spinner />
        </div>
      ) : !editing && allowed.length === 0 ? (
        <p className="rounded-xl bg-canvas px-4 py-6 text-center text-[0.875rem] text-ink-muted">
          Anda belum bisa membuat pengumuman. Hanya admin, lead divisi, dan admin proyek yang dapat menerbitkan pengumuman.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {error && (
            <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[0.8125rem] text-danger-ink">
              {error}
            </p>
          )}

          {!editing && (
            <fieldset>
              <legend className="mb-2 text-body font-medium text-ink">Kirim ke</legend>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
                {allowed.map((o) => {
                  const checked = activeScope === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setScope(o.value)}
                      className={clsx(
                        'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                        checked ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <span
                        className={clsx(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&>svg]:h-4 [&>svg]:w-4',
                          checked ? 'bg-brand text-white' : 'bg-canvas-deep text-ink-muted',
                        )}
                      >
                        {o.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.875rem] font-semibold text-ink">{o.label}</span>
                        <span className="block truncate text-caption text-ink-subtle">{o.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {!editing && activeScope === 'DIVISION' && targets.data && (
            <Field label="Divisi">
              {(id) => (
                <Select id={id} value={divisionId || targets.data.divisions[0]?.id} onChange={(e) => setDivisionId(e.target.value)}>
                  {targets.data.divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {!editing && activeScope === 'PROJECT' && targets.data && (
            <Field label="Proyek">
              {(id) => (
                <Select id={id} value={projectId || targets.data.projects[0]?.id} onChange={(e) => setProjectId(e.target.value)}>
                  {targets.data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.divisionName} · {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <Field label="Judul">
            {(id) => (
              <Input
                id={id}
                value={title}
                maxLength={200}
                autoFocus={Boolean(editing)}
                placeholder="Contoh: Libur nasional 17 Agustus"
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>

          <div className="space-y-1.5">
            <p className="text-body font-medium text-ink">Isi pengumuman</p>
            <RichEditor value={body} onChange={setBody} />
          </div>

          {!editing && (
            <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning text-white">
                  <Pin className="h-4 w-4 rotate-45" />
                </span>
                <span>
                  <span className="block text-[0.875rem] font-semibold text-ink">Sematkan di atas</span>
                  <span className="block text-caption text-ink-subtle">Untuk info penting yang harus selalu terlihat.</span>
                </span>
              </span>
              <Toggle checked={pinned} onChange={setPinned} label="Sematkan pengumuman" />
            </label>
          )}

          <div className="flex justify-end gap-2 border-t border-line-subtle pt-4">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" loading={saving} icon={editing ? undefined : <Send className="h-4 w-4" />}>
              {editing ? 'Simpan perubahan' : 'Terbitkan'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
