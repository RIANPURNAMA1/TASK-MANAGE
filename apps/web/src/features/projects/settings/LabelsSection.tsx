import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { LabelDTO, ProjectDTO } from '@nexus/shared';
import { Button, Card, EmptyState, Input, LabelPill, Skeleton } from '../../../components/ui';
import { useBoardQuery, useLabelMutations } from '../../board/hooks';
import { PALETTE } from '../ProjectFormModal';

export function LabelsSection({ project }: { project: ProjectDTO }) {
  const board = useBoardQuery(project.id);
  const m = useLabelMutations(project.id);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]!);
  const canEdit = project.access.canEdit;

  if (board.isPending) return <Skeleton className="h-40" />;
  const labels = board.data?.labels ?? [];

  const create = () => {
    if (!name.trim()) return;
    m.create.mutate({ name: name.trim(), color }, { onSuccess: () => setName('') });
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Input
            className="w-56"
            placeholder="Nama label"
            aria-label="Nama label"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <ColorDots value={color} onChange={setColor} />
          <Button size="sm" icon={<Plus className="h-4 w-4" />} loading={m.create.isPending} onClick={create}>
            Tambah label
          </Button>
        </Card>
      )}
      {labels.length === 0 ? (
        <EmptyState title="Belum ada label" description="Label membantu mengelompokkan kartu, misal #Feature atau #Bug." />
      ) : (
        <Card>
          <ul className="divide-y divide-line-subtle">
            {labels.map((label) => (
              <LabelRow key={label.id} label={label} canEdit={canEdit} m={m} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function LabelRow({ label, canEdit, m }: { label: LabelDTO; canEdit: boolean; m: ReturnType<typeof useLabelMutations> }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="w-40">
        <LabelPill name={label.name} color={label.color} />
      </div>
      {canEdit ? (
        <>
          <Input
            className="h-8 w-48"
            aria-label={`Ubah nama ${label.name}`}
            defaultValue={label.name}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== label.name) m.update.mutate({ id: label.id, name: next });
            }}
          />
          <ColorDots value={label.color} onChange={(color) => m.update.mutate({ id: label.id, color })} />
          <button
            type="button"
            aria-label={`Hapus label ${label.name}`}
            onClick={() => m.remove.mutate(label.id)}
            className="ml-auto rounded-md p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      ) : null}
    </li>
  );
}

function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Warna ${c}`}
          aria-pressed={c.toLowerCase() === value.toLowerCase()}
          onClick={() => onChange(c)}
          className="h-5 w-5 rounded-full"
          style={{ backgroundColor: c, boxShadow: c.toLowerCase() === value.toLowerCase() ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined }}
        />
      ))}
    </div>
  );
}
