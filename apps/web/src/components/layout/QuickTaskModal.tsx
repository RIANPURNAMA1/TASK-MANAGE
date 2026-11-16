import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMatch } from 'react-router-dom';
import { sortByPosition } from '@nexus/shared';
import { useBoardQuery, useCreateCard } from '../../features/board/hooks';
import { useCardModal } from '../../features/card/useCardModal';
import { useProjectsQuery } from '../../features/projects/hooks';
import { useUiStore } from '../../stores/ui';
import { Button, Field, Input, Modal, Select } from '../ui';

/** "+ Task" from the top bar: pick a project + column, then open the new card. */
export function QuickTaskModal() {
  const open = useUiStore((s) => s.quickTaskOpen);
  const setOpen = useUiStore((s) => s.setQuickTaskOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Buat task baru">
      {open && <QuickTaskForm onDone={() => setOpen(false)} />}
    </Modal>
  );
}

function QuickTaskForm({ onDone }: { onDone: () => void }) {
  const routeProject = useMatch('/projects/:projectId/*')?.params.projectId;
  const projects = useProjectsQuery();
  const editable = useMemo(() => (projects.data ?? []).filter((p) => p.access.canEdit && !p.archivedAt), [projects.data]);
  const [projectId, setProjectId] = useState(routeProject ?? '');
  const [listId, setListId] = useState('');
  const [title, setTitle] = useState('');
  const board = useBoardQuery(projectId || undefined);
  const lists = useMemo(() => sortByPosition(board.data?.lists ?? []), [board.data]);
  const createCard = useCreateCard(projectId);
  const { openInProject } = useCardModal();

  useEffect(() => {
    if (!projectId && editable[0]) setProjectId(editable[0].id);
  }, [editable, projectId]);
  useEffect(() => {
    if (!lists.some((l) => l.id === listId)) setListId(lists[0]?.id ?? '');
  }, [lists, listId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !listId) return;
    createCard.mutate(
      { listId, title: title.trim() },
      {
        onSuccess: (card) => {
          onDone();
          openInProject(card.projectId, card.id);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Judul">
        {(id) => <Input id={id} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Apa yang perlu dikerjakan?" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Proyek">
          {(id) => (
            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {editable.length === 0 && <option value="">Tidak ada proyek</option>}
              {editable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Kolom">
          {(id) => (
            <Select id={id} value={listId} onChange={(e) => setListId(e.target.value)} disabled={!lists.length}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" loading={createCard.isPending} disabled={!title.trim() || !listId}>
          Buat task
        </Button>
      </div>
    </form>
  );
}
