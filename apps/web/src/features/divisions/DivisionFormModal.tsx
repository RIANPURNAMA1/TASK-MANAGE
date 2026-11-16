import { useState, type FormEvent } from 'react';
import { createDivisionSchema, type DivisionDTO } from '@nexus/shared';
import { Button, Field, Input, Modal, Textarea } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { ColorSwatches, PALETTE } from '../projects/ProjectFormModal';
import { useDivisionMutations } from './hooks';

/** Create (no `division`) or edit a division. */
export function DivisionFormModal({
  open,
  onClose,
  division,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  division?: DivisionDTO;
  onSaved?: (division: DivisionDTO) => void;
}) {
  const { create, update } = useDivisionMutations();
  const [name, setName] = useState(division?.name ?? '');
  const [description, setDescription] = useState(division?.description ?? '');
  const [color, setColor] = useState(division?.color ?? PALETTE[0]!);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = createDivisionSchema.safeParse({ name, description: description || undefined, color });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Data tidak valid');
    const options = {
      onSuccess: (d: DivisionDTO) => {
        onSaved?.(d);
        onClose();
      },
      onError: (err: unknown) => setError(errorMessage(err)),
    };
    if (division) update.mutate({ id: division.id, ...parsed.data }, options);
    else create.mutate(parsed.data, options);
  };

  return (
    <Modal open={open} onClose={onClose} title={division ? 'Ubah divisi' : 'Divisi baru'}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger-ink">{error}</p>}
        <Field label="Nama divisi">{(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Deskripsi">
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Warna">{() => <ColorSwatches value={color} onChange={setColor} />}</Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={pending}>
            Simpan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
