import { create } from 'zustand';
import type { Me } from '@nexus/shared';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: Me | null;
  setUser: (user: Me) => void;
  /** Local sign-out only; callers are responsible for the server-side logout. */
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  setUser: (user) => set({ user, status: 'authenticated' }),
  signOut: () => set({ user: null, status: 'anonymous' }),
}));

export function useCurrentUser(): Me {
  const user = useAuthStore((s) => s.user);
  if (!user) throw new Error('useCurrentUser must be used inside an authenticated route');
  return user;
}
