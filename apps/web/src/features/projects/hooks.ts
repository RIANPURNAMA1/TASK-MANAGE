import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CreateProjectInput,
  ProjectDTO,
  ProjectMemberInput,
  ProjectRole,
  UpdateProjectInput,
} from '@nexus/shared';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { qk } from '../../lib/queryKeys';
import { upsertCard, upsertList } from '../board/cache';

export function useProjectsQuery(filter: { divisionId?: string; archived?: boolean } = {}) {
  return useQuery({ queryKey: qk.projectList(filter), queryFn: () => api.projects.list(filter) });
}

export function useProjectQuery(id: string) {
  return useQuery({ queryKey: qk.project(id), queryFn: () => api.projects.get(id), enabled: Boolean(id) });
}

/** Refreshes every cached view that embeds project metadata. */
function useProjectChanged() {
  const qc = useQueryClient();
  return (project: ProjectDTO) => {
    qc.setQueryData(qk.project(project.id), project);
    void qc.invalidateQueries({ queryKey: qk.projects });
    void qc.invalidateQueries({ queryKey: qk.board(project.id) });
    void qc.invalidateQueries({ queryKey: qk.divisions });
  };
}

export function useCreateProject() {
  const onChanged = useProjectChanged();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.projects.create(input),
    onSuccess: (project) => {
      onChanged(project);
      toast.success(`Proyek "${project.name}" dibuat.`);
    },
  });
}

export function useUpdateProject(id: string) {
  const onChanged = useProjectChanged();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => api.projects.update(id, input),
    onSuccess: (project) => {
      onChanged(project);
      toast.success('Pengaturan proyek disimpan.');
    },
    onError: (error) => toastError(error),
  });
}

export function useArchiveProject(id: string) {
  const onChanged = useProjectChanged();
  return useMutation({
    mutationFn: (archive: boolean) => (archive ? api.projects.archive(id) : api.projects.restore(id)),
    onSuccess: (project) => {
      onChanged(project);
      toast.success(project.archivedAt ? 'Proyek diarsipkan.' : 'Proyek dipulihkan.');
    },
    onError: (error) => toastError(error),
  });
}

export function useJoinProject() {
  const onChanged = useProjectChanged();
  return useMutation({
    mutationFn: (id: string) => api.projects.join(id),
    onSuccess: (project) => {
      onChanged(project);
      toast.success(`Anda bergabung ke "${project.name}".`);
    },
    onError: (error) => toastError(error),
  });
}

export function useSetProjectMuted(id: string) {
  const onChanged = useProjectChanged();
  return useMutation({
    mutationFn: (muted: boolean) => api.projects.setMuted(id, muted),
    onSuccess: (project) => {
      onChanged(project);
      toast.success(project.isMuted ? 'Notifikasi proyek dibisukan.' : 'Notifikasi proyek diaktifkan.');
    },
    onError: (error) => toastError(error),
  });
}

export function useProjectMembers(id: string) {
  return useQuery({ queryKey: qk.projectMembers(id), queryFn: () => api.projects.members(id), enabled: Boolean(id) });
}

export function useProjectMemberMutations(id: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.projectMembers(id) });
    void qc.invalidateQueries({ queryKey: qk.board(id) });
    void qc.invalidateQueries({ queryKey: qk.project(id) });
  };
  const onError = (error: unknown) => toastError(error);

  return {
    add: useMutation({
      mutationFn: (input: ProjectMemberInput) => api.projects.addMember(id, input),
      onSuccess: refresh,
      onError,
    }),
    setRole: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) => api.projects.updateMember(id, userId, role),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({
      mutationFn: (userId: string) => api.projects.removeMember(id, userId),
      onSuccess: refresh,
      onError,
    }),
  };
}

export function useProjectActivity(id: string) {
  return useInfiniteQuery({
    queryKey: qk.projectActivity(id),
    queryFn: ({ pageParam }) => api.projects.activity(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useArchivedItems(id: string) {
  return useQuery({ queryKey: qk.projectArchived(id), queryFn: () => api.projects.archived(id) });
}

/** Restore archived cards and lists (FR-08 / FR-13). */
export function useRestoreMutations(projectId: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.projectArchived(projectId) });
  return {
    card: useMutation({
      mutationFn: (cardId: string) => api.cards.restore(cardId),
      onSuccess: (card) => {
        upsertCard(qc, card);
        refresh();
        toast.success('Kartu dipulihkan.');
      },
      onError: (error) => toastError(error),
    }),
    list: useMutation({
      mutationFn: (listId: string) => api.lists.restore(listId),
      onSuccess: (list) => {
        upsertList(qc, list);
        // Cards of a restored list re-appear; simplest is to reload the board.
        void qc.invalidateQueries({ queryKey: qk.board(projectId) });
        refresh();
        toast.success('Kolom dipulihkan.');
      },
      onError: (error) => toastError(error),
    }),
  };
}
