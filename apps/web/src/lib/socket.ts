import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@nexus/shared';
import { API_ORIGIN } from './apiBase';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let tokenProvider: () => string | null = () => null;

/** Registers where the socket reads its access token from on every (re)connect. */
export function setSocketTokenProvider(provider: () => string | null): void {
  tokenProvider = provider;
}

/**
 * Single same-origin Socket.IO connection (proxied by Vite in development).
 * `auth` is a callback so each reconnect presents the latest in-memory access token.
 */
const options = {
  autoConnect: false,
  transports: ['websocket'],
  auth: (cb: (data: object) => void) => cb({ token: tokenProvider() }),
};

/** Same origin on the web; the API origin on desktop (VITE_API_URL). */
export const socket: AppSocket = API_ORIGIN ? io(API_ORIGIN, options) : io(options);

export function connectSocket(): void {
  if (!socket.connected) socket.connect();
}

export function disconnectSocket(): void {
  socket.disconnect();
}
