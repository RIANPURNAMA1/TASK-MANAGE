import { Trash2 } from 'lucide-react';
import type { ProjectDTO, ProjectRole } from '@nexus/shared';
import { Avatar, Badge, Card, ErrorState, Select, Skeleton } from '../../../components/ui';
import { useCurrentUser } from '../../../stores/auth';
import { UserPicker } from '../../divisions/UserPicker';
import { useProjectMemberMutations, useProjectMembers } from '../hooks';

export function MembersSection({ project }: { project: ProjectDTO }) {
  const me = useCurrentUser();
  const members = useProjectMembers(project.id);
  const m = useProjectMemberMutations(project.id);
  const canManage = project.access.canManage;

  if (members.isPending) return <Skeleton className="h-48" />;
  if (members.isError) return <ErrorState error={members.error} onRetry={() => void members.refetch()} />;

  return (
    <div className="space-y-4">
      {canManage && (
        <Card className="p-4">
          <p className="mb-2 font-medium text-ink">Undang anggota ke proyek</p>
          <UserPicker
            excludeIds={members.data.map((x) => x.user.id)}
            onPick={(u) => m.add.mutate({ userId: u.id, role: 'MEMBER' })}
          />
        </Card>
      )}
      <Card>
        <ul className="divide-y divide-line-subtle">
          {members.data.map(({ user, role }) => (
            <li key={user.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar user={user} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">
                  {user.name} {user.id === me.id && <span className="font-normal text-ink-subtle">(Anda)</span>}
                </p>
                <p className="truncate text-caption text-ink-subtle">{user.email}</p>
              </div>
              {canManage ? (
                <>
                  <Select
                    aria-label={`Peran ${user.name}`}
                    className="h-8 w-40"
                    value={role}
                    onChange={(e) => m.setRole.mutate({ userId: user.id, role: e.target.value as ProjectRole })}
                  >
                    <option value="MEMBER">Project Member</option>
                    <option value="ADMIN">Project Admin</option>
                  </Select>
                  <button
                    type="button"
                    aria-label={`Keluarkan ${user.name}`}
                    onClick={() => m.remove.mutate(user.id)}
                    className="rounded-md p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <Badge tone={role === 'ADMIN' ? 'brand' : 'neutral'}>{role === 'ADMIN' ? 'Project Admin' : 'Project Member'}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
