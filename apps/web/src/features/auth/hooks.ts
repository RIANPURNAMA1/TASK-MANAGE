import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AuthResponse } from '@nexus/shared';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryKeys';
import { queryClient } from '../../lib/queryClient';
import { connectSocket, disconnectSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/auth';

export function useMetaQuery() {
  return useQuery({ queryKey: qk.meta, queryFn: api.meta, staleTime: Infinity });
}

/**
 * Restores the session from the refresh cookie once metadata is known, and keeps the
 * socket connection in step with the auth status.
 */
export function useSessionBootstrap(setupRequired: boolean | undefined) {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (setupRequired === undefined) return;
    if (setupRequired) {
      useAuthStore.getState().signOut();
      return;
    }
    api.auth
      .refresh()
      .then((auth) => !auth && useAuthStore.getState().signOut())
      .catch(() => useAuthStore.getState().signOut());
  }, [setupRequired]);

  useEffect(() => {
    if (status === 'authenticated') connectSocket();
    if (status === 'anonymous') {
      disconnectSocket();
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'meta' });
    }
  }, [status]);
}

/** Stores a fresh login and moves into the app. */
export function useCompleteLogin() {
  const navigate = useNavigate();
  return (auth: AuthResponse, redirectTo = '/my-tasks') => {
    api.http.setAccessToken(auth.accessToken);
    useAuthStore.getState().setUser(auth.user);
    queryClient.setQueryData(qk.meta, (meta: Awaited<ReturnType<typeof api.meta>> | undefined) =>
      meta ? { ...meta, setupRequired: false } : meta,
    );
    navigate(redirectTo, { replace: true });
  };
}

export function useLogout() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSettled: () => {
      api.http.setAccessToken(null);
      useAuthStore.getState().signOut();
      navigate('/login', { replace: true });
    },
  });
}
