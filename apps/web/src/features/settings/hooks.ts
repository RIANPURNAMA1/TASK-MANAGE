import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ChangePasswordInput, UpdateMeInput } from '@nexus/shared';
import { api } from '../../lib/api';
import { uploadAvatar } from '../../lib/avatarUpload';
import { toastError } from '../../lib/errors';
import { qk } from '../../lib/queryKeys';
import { useAuthStore } from '../../stores/auth';

export function useUpdateMe() {
  return useMutation({
    mutationFn: (input: UpdateMeInput) => api.me.update(input),
    onSuccess: (me) => {
      useAuthStore.getState().setUser(me);
      toast.success('Profil disimpan.');
    },
    onError: (error) => toastError(error),
  });
}

/** Upload / remove the profile photo. Other cached views refetch so they show it too. */
export function useAvatarMutations() {
  const qc = useQueryClient();
  const done = (message: string) => (me: Awaited<ReturnType<typeof api.me.get>>) => {
    useAuthStore.getState().setUser(me);
    void qc.invalidateQueries();
    toast.success(message);
  };
  return {
    upload: useMutation({
      mutationFn: (file: File) => uploadAvatar(file),
      onSuccess: done('Foto profil diperbarui.'),
      onError: (error) => toastError(error, 'Gagal mengunggah foto.'),
    }),
    remove: useMutation({
      mutationFn: () => api.me.removeAvatar(),
      onSuccess: done('Foto profil dihapus.'),
      onError: (error) => toastError(error),
    }),
  };
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api.me.changePassword(input),
    onSuccess: () => toast.success('Kata sandi diubah.'),
  });
}

export function useSessions() {
  return useQuery({ queryKey: qk.sessions, queryFn: api.auth.sessions });
}

export function useSessionMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.sessions });
  return {
    revoke: useMutation({
      mutationFn: (id: string) => api.auth.revokeSession(id),
      onSuccess: () => {
        refresh();
        toast.success('Sesi diakhiri.');
      },
      onError: (error) => toastError(error),
    }),
    revokeOthers: useMutation({
      mutationFn: () => api.auth.revokeOtherSessions(),
      onSuccess: () => {
        refresh();
        toast.success('Semua sesi lain telah diakhiri.');
      },
      onError: (error) => toastError(error),
    }),
  };
}
