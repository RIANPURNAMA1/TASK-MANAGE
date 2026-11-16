/**
 * OS-integration boundary (PRD §4). UI components call `platform.*` and never touch
 * browser- or Tauri-specific APIs directly. The web and desktop implementations both
 * satisfy `Platform`; the right one is picked at startup.
 */

export type NotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

export interface AvailableUpdate {
  version: string;
  notes: string | null;
  /** Downloads, installs (signature-verified) and restarts the app. */
  install(onProgress?: (percent: number | null) => void): Promise<void>;
}

/** Result of the desktop Google SSO round-trip through the system browser. */
export interface DesktopGoogleResult {
  code: string;
  verifier: string;
}

export interface Platform {
  readonly kind: 'web' | 'desktop';
  /** Human-readable device label recorded on the login session (FR-04). */
  deviceName(): string;
  /** App version on desktop (e.g. "0.1.0"); null on the web. */
  appVersion(): Promise<string | null>;

  /** Shows a native notification when permitted. Resolves to whether it was shown. */
  notify(input: { title: string; body: string; onClick?: () => void }): Promise<boolean>;
  notificationPermission(): Promise<NotificationPermission>;
  requestNotificationPermission(): Promise<boolean>;
  /** Unread counter: tab title on the web, dock/taskbar badge + tray tooltip on desktop. */
  setBadgeCount(count: number): void;
  openExternal(url: string): void;

  /** Desktop keeps the refresh token in the OS keychain; null on the web (httpOnly cookie). */
  readonly refreshTokenStore: RefreshTokenStore | null;
  /** Extra headers on every API request (desktop identifies itself). */
  readonly clientHeaders: Record<string, string>;

  /**
   * Deep links (`taskapp://card/<id>`, `taskapp://announcements/<id>`). Receives each URL,
   * including the one that launched the app. Returns an unsubscribe function.
   */
  onDeepLink(handler: (url: URL) => void): () => void;

  /**
   * Desktop only: opens Google sign-in in the system browser and resolves with the
   * one-time code delivered back through `taskapp://auth/callback` (PKCE-bound).
   */
  googleSignIn: ((startUrl: (pkce: { challenge: string; state: string }) => string) => Promise<DesktopGoogleResult>) | null;

  /** Desktop only: launch at login (optional per user, PRD §4). */
  readonly autostart: { isEnabled(): Promise<boolean>; setEnabled(enabled: boolean): Promise<void> } | null;
  /** Desktop only: signed auto-update. Resolves null when up to date. */
  readonly updater: { check(): Promise<AvailableUpdate | null> } | null;
}

export { createWebPlatform } from './web';
export { createDesktopPlatform, isDesktopRuntime } from './desktop';

import { createDesktopPlatform, isDesktopRuntime } from './desktop';
import { createWebPlatform } from './web';

export const platform: Platform = isDesktopRuntime() ? createDesktopPlatform() : createWebPlatform();
