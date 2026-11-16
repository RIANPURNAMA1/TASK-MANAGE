import { useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui';
import { useDesktopUpdate } from './useDesktopUpdate';

/**
 * Blocks an outdated desktop app (PRD §4: backend publishes `minDesktopVersion`).
 * Offers the signed in-app update; the API stays backward compatible meanwhile.
 */
export function UpdateRequired({ current, minimum }: { current: string; minimum: string }) {
  const { status, update, progress, check, install } = useDesktopUpdate();

  useEffect(() => {
    void check({ quiet: true });
  }, [check]);

  return (
    <div className="flex h-full items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface p-8 text-center shadow-card ring-1 ring-inset ring-line-subtle">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_10px_24px_-12px_rgba(38,82,160,0.7)]">
          <Download className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-[1.25rem] font-semibold text-ink">Perbarui Mendunia Workbase</h1>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-muted">
          Versi aplikasi Anda ({current}) sudah tidak didukung. Versi minimum yang diperlukan adalah {minimum}.
        </p>

        <div className="mt-6">
          {status === 'installing' ? (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-canvas-deep">
                <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress ?? 15}%` }} />
              </div>
              <p className="mt-2 text-caption text-ink-subtle">
                Mengunduh pembaruan{progress !== null ? ` · ${progress}%` : '…'} Aplikasi akan dimulai ulang otomatis.
              </p>
            </div>
          ) : update ? (
            <Button className="w-full justify-center" icon={<Download className="h-4 w-4" />} onClick={() => void install()}>
              Pasang versi {update.version}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="w-full justify-center"
              loading={status === 'checking'}
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void check()}
            >
              Periksa pembaruan
            </Button>
          )}
          {status === 'up-to-date' && (
            <p className="mt-3 text-caption text-ink-subtle">
              Belum ada paket pembaruan yang ditemukan. Hubungi admin atau unduh versi terbaru secara manual.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
