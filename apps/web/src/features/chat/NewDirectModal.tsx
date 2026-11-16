import { Modal, Spinner } from '../../components/ui';
import { useCurrentUser } from '../../stores/auth';
import { UserPicker } from '../divisions/UserPicker';
import { useOpenDirect } from './hooks';

/** Starts (or reopens) a 1-on-1 conversation (FR-32). */
export function NewDirectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useCurrentUser();
  const openDirect = useOpenDirect();

  return (
    <Modal open={open} onClose={onClose} title="Pesan baru" description="Pilih rekan kerja untuk memulai percakapan pribadi.">
      <div className="min-h-[220px] space-y-3">
        <UserPicker
          excludeIds={[me.id]}
          placeholder="Cari nama atau email…"
          onPick={(user) => openDirect.mutate(user.id, { onSuccess: onClose })}
        />
        {openDirect.isPending && (
          <p className="flex items-center gap-2 text-ink-muted">
            <Spinner className="h-4 w-4" /> Membuka percakapan…
          </p>
        )}
      </div>
    </Modal>
  );
}
