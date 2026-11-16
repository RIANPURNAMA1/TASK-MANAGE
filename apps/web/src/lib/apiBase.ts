/**
 * Where the API lives. The web app is served next to it (same origin, `/api/v1`, proxied
 * by Vite in development). The desktop build loads its files from `tauri://localhost`,
 * so it is compiled with an absolute `VITE_API_URL` (e.g. https://api.example.com/api/v1).
 */
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api/v1';

/** Origin for Socket.IO, or undefined when the API is same-origin. */
export const API_ORIGIN: string | undefined = /^https?:\/\//.test(API_BASE) ? new URL(API_BASE).origin : undefined;

/**
 * The API returns some URLs relative to itself (local file storage, avatars). Those must
 * point at the API origin when the app is not served from it (desktop).
 */
export function resolveApiUrl(url: string): string;
export function resolveApiUrl(url: string | null): string | null;
export function resolveApiUrl(url: string | null): string | null {
  if (!url || !API_ORIGIN || !url.startsWith('/')) return url;
  return API_ORIGIN + url;
}
