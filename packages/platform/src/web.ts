import type { Platform } from './index';

export function detectBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Browser';
}

export function detectOs(userAgent: string): string {
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Mac OS X/.test(userAgent)) return 'macOS';
  if (/Android/.test(userAgent)) return 'Android';
  if (/iPhone|iPad/.test(userAgent)) return 'iOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'Unknown OS';
}

export function createWebPlatform(): Platform {
  let baseTitle: string | null = null;

  return {
    kind: 'web',
    refreshTokenStore: null,
    clientHeaders: {},
    googleSignIn: null,
    autostart: null,
    updater: null,

    deviceName() {
      const ua = navigator.userAgent;
      return `${detectBrowser(ua)} di ${detectOs(ua)}`;
    },

    async appVersion() {
      return null;
    },

    async notificationPermission() {
      return 'Notification' in window ? Notification.permission : 'unsupported';
    },

    async requestNotificationPermission() {
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      return (await Notification.requestPermission()) === 'granted';
    },

    async notify({ title, body, onClick }) {
      // Only interrupt when the user is looking elsewhere; in-app toasts cover the rest.
      if (!('Notification' in window) || Notification.permission !== 'granted') return false;
      if (document.visibilityState === 'visible') return false;
      const notification = new Notification(title, { body, icon: '/favicon.svg' });
      notification.onclick = () => {
        window.focus();
        onClick?.();
        notification.close();
      };
      return true;
    },

    setBadgeCount(count) {
      baseTitle ??= document.title.replace(/^\(\d+\+?\)\s*/, '');
      document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${baseTitle}` : baseTitle;
    },

    openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },

    // Web links are ordinary URLs handled by the router.
    onDeepLink() {
      return () => undefined;
    },
  };
}
