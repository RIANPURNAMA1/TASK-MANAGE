import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { platform } from '@nexus/platform';
import { api } from '../../lib/api';
import { useDesktopUpdate } from './useDesktopUpdate';

/**
 * Desktop-only glue, mounted inside the signed-in shell (renders nothing):
 *  - deep links `taskapp://card/<id>` and `taskapp://announcements/<id>` (PRD §4);
 *  - a quiet update check shortly after start, offering a one-click signed update.
 */
export function DesktopBridge() {
  const navigate = useNavigate();
  const { check, install } = useDesktopUpdate();
  const checked = useRef(false);

  useEffect(() => {
    if (platform.kind !== 'desktop') return;
    return platform.onDeepLink(async (url) => {
      const [, id] = url.pathname.split('/');
      if (url.host === 'card' && id) {
        try {
          const card = await api.cards.get(id);
          navigate(`/projects/${card.projectId}?card=${card.id}`);
        } catch {
          toast.error('Kartu tidak ditemukan atau Anda tidak punya akses.');
        }
      } else if (url.host === 'announcements' && id) {
        navigate(`/announcements/${id}`);
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (platform.kind !== 'desktop' || checked.current) return;
    checked.current = true;
    const timer = setTimeout(async () => {
      const found = await check({ quiet: true });
      if (found) {
        toast(`Versi baru ${found.version} tersedia`, {
          description: 'Pasang sekarang; aplikasi akan dimulai ulang.',
          duration: 20_000,
          action: { label: 'Perbarui', onClick: () => void install(found) },
        });
      }
    }, 8_000);
    return () => clearTimeout(timer);
  }, [check, install]);

  return null;
}
