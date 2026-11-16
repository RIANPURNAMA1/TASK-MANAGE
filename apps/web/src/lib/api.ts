import { createApiClient } from '@nexus/api-client';
import { platform } from '@nexus/platform';
import { useAuthStore } from '../stores/auth';
import { API_BASE } from './apiBase';
import { setSocketTokenProvider, socket } from './socket';

/** Application-wide API SDK. The access token lives only inside `api.http` (memory). */
export const api = createApiClient({
  baseUrl: API_BASE,
  // Desktop: identifies the device and keeps the refresh token in the OS keychain.
  clientHeaders: platform.clientHeaders,
  refreshTokenStore: platform.refreshTokenStore ?? undefined,
  getSocketId: () => socket.id,
  onAuthenticated: (auth) => useAuthStore.getState().setUser(auth.user),
  onSessionExpired: () => useAuthStore.getState().signOut(),
});

setSocketTokenProvider(() => api.http.getAccessToken());
