import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateInvitationInput, DeactivateUserInput, OrgRole } from '@nexus/shared';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { qk } from '../../lib/queryKeys';

export function useAdminUsers(filter: { q?: string; status?: 'active' | 'deactivated' }) {
  return useQuery({ queryKey: qk.adminUsers(filter), queryFn: () => api.admin.users(filter) });
}

export function useAdminUserMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.adminUsersAll });
    void qc.invalidateQueries({ queryKey: ['users'] });
  };
  const onError = (error: unknown) => toastError(error);

  return {
    setRole: useMutation({
      mutationFn: ({ id, role }: { id: string; role: OrgRole }) => api.admin.setRole(id, role),
      onSuccess: () => {
        refresh();
        toast.success('Peran diperbarui.');
      },
      onError,
    }),
    deactivate: useMutation({
      mutationFn: ({ id, ...input }: { id: string } & DeactivateUserInput) => api.admin.deactivate(id, input),
      onSuccess: (user) => {
        refresh();
        toast.success(`${user.name} dinonaktifkan.`);
      },
      onError,
    }),
    reactivate: useMutation({
      mutationFn: (id: string) => api.admin.reactivate(id),
      onSuccess: (user) => {
        refresh();
        toast.success(`${user.name} diaktifkan kembali.`);
      },
      onError,
    }),
    revokeSessions: useMutation({
      mutationFn: (id: string) => api.admin.revokeSessions(id),
      onSuccess: () => {
        refresh();
        toast.success('Semua sesi pengguna diakhiri.');
      },
      onError,
    }),
  };
}

export function useInvitations() {
  return useQuery({ queryKey: qk.invitations, queryFn: api.admin.invitations });
}

export function useInvitationMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.invitations });
  return {
    create: useMutation({
      mutationFn: (input: CreateInvitationInput) => api.admin.invite(input),
      onSuccess: refresh,
    }),
    revoke: useMutation({
      mutationFn: (id: string) => api.admin.revokeInvitation(id),
      onSuccess: () => {
        refresh();
        toast.success('Undangan dicabut.');
      },
      onError: (error) => toastError(error),
    }),
  };
}
