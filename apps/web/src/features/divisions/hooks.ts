import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateDivisionInput, DivisionMemberInput, DivisionRole, UpdateDivisionInput } from '@nexus/shared';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { qk } from '../../lib/queryKeys';

export function useDivisionsQuery() {
  return useQuery({ queryKey: qk.divisions, queryFn: api.divisions.list });
}

export function useUserSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: qk.users(q),
    queryFn: () => api.users.search(q || undefined),
    enabled,
    staleTime: 60_000,
  });
}

export function useDivisionMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.divisions });
  return {
    create: useMutation({
      mutationFn: (input: CreateDivisionInput) => api.divisions.create(input),
      onSuccess: (d) => {
        refresh();
        toast.success(`Divisi "${d.name}" dibuat.`);
      },
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: { id: string } & UpdateDivisionInput) => api.divisions.update(id, input),
      onSuccess: () => {
        refresh();
        toast.success('Divisi diperbarui.');
      },
      onError: (error) => toastError(error),
    }),
    archive: useMutation({
      mutationFn: (id: string) => api.divisions.archive(id),
      onSuccess: () => {
        refresh();
        void qc.invalidateQueries({ queryKey: qk.projects });
        toast.success('Divisi diarsipkan.');
      },
      onError: (error) => toastError(error),
    }),
  };
}

export function useDivisionMembers(id: string, enabled = true) {
  return useQuery({ queryKey: qk.divisionMembers(id), queryFn: () => api.divisions.members(id), enabled });
}

export function useDivisionMemberMutations(id: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.divisionMembers(id) });
    void qc.invalidateQueries({ queryKey: qk.divisions });
  };
  const onError = (error: unknown) => toastError(error);
  return {
    add: useMutation({
      mutationFn: (input: DivisionMemberInput) => api.divisions.addMember(id, input),
      onSuccess: refresh,
      onError,
    }),
    setRole: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: DivisionRole }) => api.divisions.updateMember(id, userId, role),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({
      mutationFn: (userId: string) => api.divisions.removeMember(id, userId),
      onSuccess: refresh,
      onError,
    }),
  };
}
