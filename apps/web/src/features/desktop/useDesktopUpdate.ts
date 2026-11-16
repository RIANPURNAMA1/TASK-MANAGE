import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { platform, type AvailableUpdate } from '@nexus/platform';

/** Compares dotted versions ("0.10.2" > "0.9.9"); pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split('-')[0]!.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

type Status = 'idle' | 'checking' | 'up-to-date' | 'available' | 'installing' | 'error';

/** Check / install flow for the signed desktop updater (PRD §4). No-op on the web. */
export function useDesktopUpdate() {
  const [status, setStatus] = useState<Status>('idle');
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const check = useCallback(async (opts: { quiet?: boolean } = {}) => {
    if (!platform.updater) return null;
    setStatus('checking');
    try {
      const found = await platform.updater.check();
      setUpdate(found);
      setStatus(found ? 'available' : 'up-to-date');
      return found;
    } catch {
      setStatus('error');
      if (!opts.quiet) toast.error('Tidak dapat memeriksa pembaruan. Periksa koneksi internet Anda.');
      return null;
    }
  }, []);

  const install = useCallback(async (target?: AvailableUpdate | null) => {
    const pkg = target ?? update;
    if (!pkg) return;
    setStatus('installing');
    setProgress(null);
    try {
      // Restarts the app when done.
      await pkg.install(setProgress);
    } catch {
      setStatus('error');
      toast.error('Pembaruan gagal dipasang. Silakan coba lagi.');
    }
  }, [update]);

  return { status, update, progress, check, install };
}
