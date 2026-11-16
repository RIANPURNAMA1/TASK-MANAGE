import type { ReactNode } from 'react';
import { ArchiveRestore, Columns3, CreditCard } from 'lucide-react';
import type { ProjectDTO } from '@nexus/shared';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '../../../components/ui';
import { useCardModal } from '../../card/useCardModal';
import { useArchivedItems, useRestoreMutations } from '../hooks';

/** Archived lists and cards with restore (FR-08, FR-13). */
export function ArchiveSection({ project }: { project: ProjectDTO }) {
  const archived = useArchivedItems(project.id);
  const restore = useRestoreMutations(project.id);
  const { openInProject } = useCardModal();
  const canEdit = project.access.canEdit;

  if (archived.isPending) return <Skeleton className="h-40" />;
  if (archived.isError) return <ErrorState error={archived.error} onRetry={() => void archived.refetch()} />;

  const { lists, cards } = archived.data;
  if (lists.length === 0 && cards.length === 0) {
    return <EmptyState icon={<ArchiveRestore />} title="Arsip kosong" description="Kolom dan kartu yang diarsipkan akan muncul di sini." />;
  }

  return (
    <div className="space-y-6">
      {lists.length > 0 && (
        <ArchiveGroup title="Kolom" icon={<Columns3 className="h-4 w-4" />}>
          {lists.map((l) => (
            <Row key={l.id} title={l.name}>
              {canEdit && (
                <Button size="sm" variant="secondary" loading={restore.list.isPending && restore.list.variables === l.id} onClick={() => restore.list.mutate(l.id)}>
                  Pulihkan
                </Button>
              )}
            </Row>
          ))}
        </ArchiveGroup>
      )}
      {cards.length > 0 && (
        <ArchiveGroup title="Kartu" icon={<CreditCard className="h-4 w-4" />}>
          {cards.map((c) => (
            <Row key={c.id} title={c.title} onOpen={() => openInProject(project.id, c.id)}>
              {canEdit && (
                <Button size="sm" variant="secondary" loading={restore.card.isPending && restore.card.variables === c.id} onClick={() => restore.card.mutate(c.id)}>
                  Pulihkan
                </Button>
              )}
            </Row>
          ))}
        </ArchiveGroup>
      )}
    </div>
  );
}

function ArchiveGroup({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-h3 text-ink">
        {icon} {title}
      </h3>
      <Card>
        <ul className="divide-y divide-line-subtle">{children}</ul>
      </Card>
    </section>
  );
}

function Row({ title, onOpen, children }: { title: string; onOpen?: () => void; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex-1 truncate text-left font-medium text-ink hover:text-brand">
          {title}
        </button>
      ) : (
        <span className="flex-1 truncate font-medium text-ink">{title}</span>
      )}
      {children}
    </li>
  );
}
