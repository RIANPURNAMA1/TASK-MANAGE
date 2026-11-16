import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import type { ProjectDTO } from '@nexus/shared';
import { Button, Card, ConfirmDialog, Field, Input, Textarea, Toggle } from '../../../components/ui';
import { useArchiveProject, useUpdateProject } from '../hooks';
import { ColorSwatches } from '../ProjectFormModal';

export function GeneralSection({ project }: { project: ProjectDTO }) {
  const update = useUpdateProject(project.id);
  const archive = useArchiveProject(project.id);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [color, setColor] = useState(project.color);
  const [isPrivate, setIsPrivate] = useState(project.isPrivate);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const canManage = project.access.canManage;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ name: name.trim(), description: description.trim() || undefined, color, isPrivate });
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={!canManage} className="space-y-4">
            <Field label="Nama proyek">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Deskripsi">
              {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
            </Field>
            <Field label="Warna">{() => <ColorSwatches value={color} onChange={setColor} />}</Field>
            <div className="flex items-center justify-between rounded-lg border border-line p-3">
              <div>
                <p className="font-medium text-ink">Proyek privat</p>
                <p className="text-caption text-ink-subtle">
                  Jika nonaktif, semua anggota divisi dapat melihat proyek ini.
                </p>
              </div>
              <Toggle label="Proyek privat" checked={isPrivate} onChange={setIsPrivate} disabled={!canManage} />
            </div>
          </fieldset>
          {canManage && (
            <div className="flex justify-end">
              <Button type="submit" loading={update.isPending}>
                Simpan perubahan
              </Button>
            </div>
          )}
        </form>
      </Card>

      {canManage && (
        <Card className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold text-ink">{project.archivedAt ? 'Pulihkan proyek' : 'Arsipkan proyek'}</p>
            <p className="text-ink-muted">
              {project.archivedAt
                ? 'Proyek akan kembali tampil di daftar dan bisa diubah.'
                : 'Proyek disembunyikan dari daftar dan menjadi baca-saja. Bisa dipulihkan kapan saja.'}
            </p>
          </div>
          <Button
            variant={project.archivedAt ? 'secondary' : 'danger'}
            icon={project.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            loading={archive.isPending}
            onClick={() => (project.archivedAt ? archive.mutate(false) : setConfirmArchive(true))}
          >
            {project.archivedAt ? 'Pulihkan' : 'Arsipkan'}
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={confirmArchive}
        title="Arsipkan proyek?"
        description={`"${project.name}" akan disembunyikan dari daftar proyek.`}
        confirmLabel="Arsipkan"
        destructive
        loading={archive.isPending}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => archive.mutate(true, { onSuccess: () => setConfirmArchive(false) })}
      />
    </div>
  );
}
