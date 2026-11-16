import type { AvailableUpdate, DesktopGoogleResult, NotificationPermission, Platform } from './index';
import { detectOs } from './web';

/**
 * Tauri v2 implementation (PRD §4). Tauri modules are imported lazily so the web bundle
 * never loads them; every call goes through the minimal capabilities declared in
 * apps/desktop/src-tauri/capabilities.
 */

export const DEEP_LINK_SCHEME = 'taskapp';
const KEYCHAIN_ACCOUNT = 'refresh-token';
const GOOGLE_TIMEOUT_MS = 5 * 60 * 1000;

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const core = () => import('@tauri-apps/api/core');

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function createDesktopPlatform(): Platform {
  const os = detectOs(navigator.userAgent);
  const deepLinkHandlers = new Set<(url: URL) => void>();
  let deepLinksStarted = false;
  /** URLs that arrived before any handler subscribed (e.g. the one that launched the app). */
  const pending: URL[] = [];

  const dispatch = (raw: string) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return;
    if (deepLinkHandlers.size === 0) pending.push(url);
    for (const handler of deepLinkHandlers) handler(url);
  };

  const startDeepLinks = async () => {
    if (deepLinksStarted) return;
    deepLinksStarted = true;
    const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
    // Links forwarded by the single-instance plugin also arrive through onOpenUrl.
    await onOpenUrl((urls) => urls.forEach(dispatch));
    (await getCurrent())?.forEach(dispatch);
  };

  const subscribe = (handler: (url: URL) => void) => {
    deepLinkHandlers.add(handler);
    void startDeepLinks();
    pending.splice(0).forEach(handler);
    return () => void deepLinkHandlers.delete(handler);
  };

  const platform: Platform = {
    kind: 'desktop',
    clientHeaders: { 'x-desktop-device': `NexusTask Desktop di ${os}` },

    deviceName() {
      return `NexusTask Desktop di ${os}`;
    },

    async appVersion() {
      const { getVersion } = await import('@tauri-apps/api/app');
      return getVersion();
    },

    // ── secure storage: OS keychain via Rust commands (see src-tauri/src/secrets.rs) ──
    refreshTokenStore: {
      async get() {
        const { invoke } = await core();
        return invoke<string | null>('secret_get', { account: KEYCHAIN_ACCOUNT });
      },
      async set(token) {
        const { invoke } = await core();
        if (token) await invoke('secret_set', { account: KEYCHAIN_ACCOUNT, value: token });
        else await invoke('secret_delete', { account: KEYCHAIN_ACCOUNT });
      },
    },

    // ── notifications ──
    async notificationPermission(): Promise<NotificationPermission> {
      const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
      return (await isPermissionGranted()) ? 'granted' : 'default';
    },

    async requestNotificationPermission() {
      const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
      if (await isPermissionGranted()) return true;
      return (await requestPermission()) === 'granted';
    },

    async notify({ title, body }) {
      const [{ getCurrentWindow }, notification] = await Promise.all([
        import('@tauri-apps/api/window'),
        import('@tauri-apps/plugin-notification'),
      ]);
      // In-app toasts cover the focused case; native notifications are for when we're away.
      const win = getCurrentWindow();
      if ((await win.isFocused()) && (await win.isVisible())) return false;
      if (!(await notification.isPermissionGranted())) return false;
      notification.sendNotification({ title, body });
      return true;
    },

    setBadgeCount(count) {
      void core().then(({ invoke }) => invoke('set_badge', { count }).catch(() => undefined));
    },

    openExternal(url) {
      void import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url));
    },

    onDeepLink: subscribe,

    // ── Google SSO through the system browser + taskapp://auth/callback ──
    async googleSignIn(startUrl): Promise<DesktopGoogleResult> {
      const verifier = randomString(32);
      const state = randomString(24);
      const challenge = await pkceChallenge(verifier);

      const result = new Promise<DesktopGoogleResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          unsubscribe();
          reject(new Error('timeout'));
        }, GOOGLE_TIMEOUT_MS);
        const unsubscribe = subscribe((url) => {
          if (url.host !== 'auth' || url.pathname !== '/callback' || url.searchParams.get('state') !== state) return;
          clearTimeout(timer);
          unsubscribe();
          const error = url.searchParams.get('error');
          const code = url.searchParams.get('code');
          if (error || !code) reject(new Error(error ?? 'google_error'));
          else resolve({ code, verifier });
        });
      });

      platform.openExternal(startUrl({ challenge, state }));
      return result;
    },

    autostart: {
      async isEnabled() {
        const { isEnabled } = await import('@tauri-apps/plugin-autostart');
        return isEnabled();
      },
      async setEnabled(enabled) {
        const { enable, disable } = await import('@tauri-apps/plugin-autostart');
        await (enabled ? enable() : disable());
      },
    },

    updater: {
      async check(): Promise<AvailableUpdate | null> {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (!update) return null;
        return {
          version: update.version,
          notes: update.body ?? null,
          async install(onProgress) {
            let total = 0;
            let received = 0;
            // The plugin verifies the package signature before installing (PRD §8).
            await update.downloadAndInstall((event) => {
              if (event.event === 'Started') total = event.data.contentLength ?? 0;
              if (event.event === 'Progress') {
                received += event.data.chunkLength;
                onProgress?.(total > 0 ? Math.round((received / total) * 100) : null);
              }
            });
            const { relaunch } = await import('@tauri-apps/plugin-process');
            await relaunch();
          },
        };
      },
    },
  };
  return platform;
}
