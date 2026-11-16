import { useState, type FormEvent } from 'react';
import { createProjectSchema, type CreateProjectInput } from '@nexus/shared';
import { Button, Field, Input, Modal, Textarea, Toggle } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { useCreateProject } from './hooks';

export const PALETTE = ['#2652A0', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#0EA5E9', '#475569'];

export function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Warna">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={c}
          onClick={() => onChange(c)}
          className="h-7 w-7 rounded-full ring-offset-2 transition-shadow"
          style={{ backgroundColor: c, boxShadow: c === value ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined }}
        />
      ))}
    </div>
  );
}

export function CreateProjectModal({ divisionId, open, onClose }: { divisionId: string; open: boolean; onClose: () => void }) {
  const create = useCreateProject();
  const [values, setValues] = useState<CreateProjectInput>({ divisionId, name: '', description: '', color: PALETTE[0], isPrivate: false });
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = createProjectSchema.safeParse({ ...values, divisionId });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Data tidak valid');
    create.mutate(parsed.data, {
      onSuccess: () => {
        onClose();
        setValues((v) => ({ ...v, name: '', description: '' }));
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Proyek baru" description="Proyek berisi board kanban untuk tim Anda.">
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger-ink">{error}</p>}
        <Field label="Nama proyek">
          {(id) => <Input id={id} autoFocus value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />}
        </Field>
        <Field label="Deskripsi">
          {(id) => (
            <Textarea id={id} value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />
          )}
        </Field>
        <Field label="Warna">{() => <ColorSwatches value={values.color ?? PALETTE[0]!} onChange={(color) => setValues({ ...values, color })} />}</Field>
        <div className="flex items-center justify-between rounded-lg border border-line p-3">
          <div>
            <p className="font-medium text-ink">Proyek privat</p>
            <p className="text-caption text-ink-subtle">Hanya anggota yang diundang yang bisa melihat.</p>
          </div>
          <Toggle label="Proyek privat" checked={values.isPrivate} onChange={(isPrivate) => setValues({ ...values, isPrivate })} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={create.isPending}>
            Buat proyek
          </Button>
        </div>
      </form>
    </Modal>
  );
}
