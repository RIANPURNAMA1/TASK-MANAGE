import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { MailPlus, ShieldCheck, Users } from 'lucide-react';
import { InvitationsSection } from './InvitationsSection';
import { UsersSection } from './UsersSection';

type Tab = 'users' | 'invitations';

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'invitations' ? 'invitations' : 'users';
  const select = (next: Tab) =>
    setParams(next === 'users' ? {} : { tab: next }, { replace: true });

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="border-b border-line bg-surface px-8 pt-7">
        <h1 className="flex items-center gap-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
          <ShieldCheck className="h-[22px] w-[22px] text-brand" aria-hidden />
          Admin organisasi
        </h1>
        <p className="mt-2 text-[0.875rem] text-ink-muted">Kelola pengguna, peran, dan undangan.</p>
        <nav aria-label="Bagian admin" role="tablist" className="-mb-px mt-5 flex items-center gap-7">
          <HeaderTab active={tab === 'users'} onClick={() => select('users')} icon={<Users />}>
            Pengguna
          </HeaderTab>
          <HeaderTab active={tab === 'invitations'} onClick={() => select('invitations')} icon={<MailPlus />}>
            Undangan
          </HeaderTab>
        </nav>
      </header>

      <div className="flex-1 px-8 py-6">{tab === 'users' ? <UsersSection /> : <InvitationsSection />}</div>
    </div>
  );
}

function HeaderTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'relative inline-flex items-center gap-2 pb-3.5 text-[0.875rem] transition-colors [&>svg]:h-4 [&>svg]:w-4',
        "after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:content-['']",
        active ? 'font-semibold text-ink after:bg-brand' : 'font-medium text-ink-muted after:bg-transparent hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
