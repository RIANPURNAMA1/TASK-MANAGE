import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BellOff, BellRing } from 'lucide-react';
import type { ProjectDTO } from '@nexus/shared';
import { Button, Card, ErrorState, PageHeader, Skeleton, Tabs, Toggle } from '../../../components/ui';
import { ActivityList } from '../../card/ActivityList';
import { useProjectActivity, useProjectQuery, useSetProjectMuted } from '../hooks';
import { ArchiveSection } from './ArchiveSection';
import { GeneralSection } from './GeneralSection';
import { LabelsSection } from './LabelsSection';
import { MembersSection } from './MembersSection';

type Section = 'general' | 'members' | 'labels' | 'archive' | 'notifications' | 'activity';

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'general', label: 'Umum' },
  { value: 'members', label: 'Anggota' },
  { value: 'labels', label: 'Label' },
  { value: 'archive', label: 'Arsip' },
  { value: 'notifications', label: 'Notifikasi' },
  { value: 'activity', label: 'Aktivitas' },
];

export function ProjectSettingsPage() {
  const { projectId = '' } = useParams();
  const project = useProjectQuery(projectId);
  // The section lives in the URL so the board header can deep-link (e.g. ?section=activity).
  const [params, setParams] = useSearchParams();
  const requested = params.get('section');
  const section: Section = SECTIONS.some((s) => s.value === requested) ? (requested as Section) : 'general';
  const setSection = (next: Section) => setParams({ section: next }, { replace: true });

  if (project.isPending) return <Skeleton className="m-6 h-64" />;
  if (project.isError) return <div className="p-6"><ErrorState error={project.error} /></div>;

  const p = project.data;
  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link to={`/projects/${p.id}`} className="mb-3 inline-flex items-center gap-1.5 font-medium text-ink-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Kembali ke board
      </Link>
      <PageHeader title={`Pengaturan ${p.name}`} description={p.divisionName} />
      <Tabs className="mb-6" items={SECTIONS} value={section} onChange={setSection} />
      {section === 'general' && <GeneralSection project={p} />}
      {section === 'members' && <MembersSection project={p} />}
      {section === 'labels' && <LabelsSection project={p} />}
      {section === 'archive' && <ArchiveSection project={p} />}
      {section === 'notifications' && <NotificationSection project={p} />}
      {section === 'activity' && <ActivitySection projectId={p.id} />}
    </div>
  );
}

function NotificationSection({ project }: { project: ProjectDTO }) {
  const setMuted = useSetProjectMuted(project.id);
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-subtle text-brand">
        {project.isMuted ? <BellOff className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
      </span>
      <div className="flex-1">
        <p className="font-semibold text-ink">Bisukan notifikasi proyek</p>
        <p className="text-ink-muted">
          Anda tidak akan menerima notifikasi komentar dari proyek ini. Mention dan penugasan langsung tetap dikirim.
        </p>
      </div>
      <Toggle label="Bisukan notifikasi" checked={project.isMuted} disabled={setMuted.isPending} onChange={(muted) => setMuted.mutate(muted)} />
    </Card>
  );
}

function ActivitySection({ projectId }: { projectId: string }) {
  const activity = useProjectActivity(projectId);
  if (activity.isPending) return <Skeleton className="h-48" />;
  if (activity.isError) return <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />;
  return (
    <Card className="p-5">
      <ActivityList items={activity.data.pages.flatMap((p) => p.items)} />
      {activity.hasNextPage && (
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" loading={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>
            Muat lagi
          </Button>
        </div>
      )}
    </Card>
  );
}
