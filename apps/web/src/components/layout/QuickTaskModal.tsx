import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMatch } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { sortByPosition } from '@nexus/shared';
import { useBoardQuery, useCreateCard } from '../../features/board/hooks';
import { upsertCard } from '../../features/board/cache';
import { api } from '../../lib/api';
import { useCardModal } from '../../features/card/useCardModal';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk } from '../../lib/queryKeys';
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
  const qc = useQueryClient();
  const presetDate = useUiStore((s) => s.quickTaskDate);

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
        onSuccess: async (card) => {
          let created = card;
          if (presetDate) {
            // Created from a calendar day: default to end of the working day (17:00 local).
            try {
              created = await api.cards.update(card.id, { dueDate: new Date(`${presetDate}T17:00:00`).toISOString() });
              upsertCard(qc, created);
              void qc.invalidateQueries({ queryKey: qk.calendar });
            } catch {
              toast.error('Task dibuat, tetapi tenggatnya gagal diatur.');
            }
          }
          onDone();
          openInProject(created.projectId, created.id);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {presetDate && (
        <p className="rounded-lg bg-brand-subtle px-3 py-2 text-[0.8125rem] text-brand">
          Tenggat: {format(parseISO(presetDate), 'EEEE, d MMMM yyyy', { locale: localeId })}
        </p>
      )}
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
