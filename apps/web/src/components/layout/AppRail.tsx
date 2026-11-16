import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  CircleCheckBig,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Megaphone,
  MessageCircle,
  Settings,
  ShieldCheck,
  SquarePen,
  UsersRound,
} from 'lucide-react';
import { ORG_ROLE_LABEL, isOrgAdmin } from '@nexus/shared';
import { useAnnouncementUnread } from '../../features/announcements/hooks';
import { useLogout } from '../../features/auth/hooks';
import { useChatUnreadTotal } from '../../features/chat/hooks';
import { useCurrentUser } from '../../stores/auth';
import { useUiStore } from '../../stores/ui';
import { Avatar, Menu, MenuItem, MenuSeparator, Tooltip } from '../ui';
import { NotificationBell } from './NotificationBell';
import { railItemClass } from './railItem';

interface RailEntry {
  label: string;
  to: string;
  icon: ReactNode;
  /** Other path prefixes that also mark this entry active. */
  match?: string[];
  badge?: number;
}

function RailBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white ring-2 ring-surface">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function RailLink({ entry }: { entry: RailEntry }) {
  const { pathname } = useLocation();
  return (
    <Tooltip content={entry.label} side="right">
      <NavLink
        to={entry.to}
        aria-label={entry.label}
        className={({ isActive }) => railItemClass(isActive || Boolean(entry.match?.some((p) => pathname.startsWith(p))))}
      >
        {entry.icon}
        <RailBadge count={entry.badge ?? 0} />
      </NavLink>
    </Tooltip>
  );
}

/**
 * Primary navigation (replaces the old top bar): logo, module icons with badges,
 * notifications, quick task, settings and the profile menu.
 */
export function AppRail() {
  const user = useCurrentUser();
  const chatUnread = useChatUnreadTotal();
  const announcementUnread = useAnnouncementUnread();
  const openQuickTask = useUiStore((s) => s.setQuickTaskOpen);

  const entries: RailEntry[] = [
    { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard /> },
    { label: 'Divisi & Proyek', to: '/divisions', icon: <LayoutGrid /> },
    { label: 'Chat Tim', to: '/chat', icon: <MessageCircle />, badge: chatUnread },
    { label: 'Pengumuman', to: '/announcements', icon: <Megaphone />, badge: announcementUnread },
    { label: 'Board Proyek', to: '/projects', icon: <FolderKanban />, match: ['/projects'] },
    { label: 'Tugas Saya', to: '/my-tasks', icon: <CircleCheckBig /> },
  ];

  return (
    <nav
      aria-label="Navigasi utama"
      className="flex w-[76px] shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-5"
    >
      <NavLink
        to="/dashboard"
        aria-label={`${user.organization.name} — beranda`}
        title={user.organization.name}
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-canvas-deep text-[22px] font-black text-ink shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] transition-transform hover:scale-105"
      >
        {user.organization.name.trim().charAt(0).toUpperCase()}
      </NavLink>

      {entries.map((entry) => (
        <RailLink key={entry.to} entry={entry} />
      ))}
      <NotificationBell />
      {isOrgAdmin(user.orgRole) && (
        <RailLink entry={{ label: 'Admin organisasi', to: '/admin', icon: <UsersRound /> }} />
      )}
      <RailLink entry={{ label: 'Pengaturan', to: '/settings', icon: <Settings /> }} />

      <div className="mt-auto flex flex-col items-center gap-3">
        <Tooltip content="Buat tugas baru (Ctrl+K untuk mencari)" side="right">
          <button
            type="button"
            onClick={() => openQuickTask(true)}
            aria-label="Buat tugas baru"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white shadow-[0_6px_16px_-6px_rgba(0,112,243,0.6)] transition-colors hover:bg-brand-hover [&_svg]:h-5 [&_svg]:w-5"
          >
            <SquarePen />
          </button>
        </Tooltip>
        <ProfileMenu />
      </div>
    </nav>
  );
}

function ProfileMenu() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <Menu
      placement="side-end"
      className="w-64"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-label="Menu profil" className="rounded-full">
          <Avatar user={user} size="lg" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="px-2.5 py-2">
            <p className="truncate font-bold text-ink">{user.name}</p>
            <p className="truncate text-caption text-ink-subtle">{user.email}</p>
            <p className="mt-1 text-caption font-semibold text-brand">
              {ORG_ROLE_LABEL[user.orgRole]} · {user.organization.name}
            </p>
          </div>
          <MenuSeparator />
          <MenuItem icon={<Settings />} onSelect={() => (close(), navigate('/settings'))}>
            Pengaturan akun
          </MenuItem>
          {isOrgAdmin(user.orgRole) && (
            <MenuItem icon={<ShieldCheck />} onSelect={() => (close(), navigate('/admin'))}>
              Admin organisasi
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<LogOut />} danger onSelect={() => (close(), logout.mutate())}>
            Keluar
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
