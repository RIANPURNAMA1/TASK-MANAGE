import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAnnouncementRealtime } from '../../features/announcements/hooks';
import { CardModal } from '../../features/card/CardModal';
import { DesktopBridge } from '../../features/desktop/DesktopBridge';
import { useChatRealtime } from '../../features/chat/useChatRealtime';
import { useUnreadBadge } from '../../features/notifications/hooks';
import { useRealtimeSync } from '../../lib/useRealtimeSync';
import { CommandPalette } from './CommandPalette';
import { AppRail } from './AppRail';
import { ProjectSidebar } from './ProjectSidebar';
import { QuickTaskModal } from './QuickTaskModal';

/** Sections whose pages carry their own sub-navigation, so the project sidebar is hidden. */
const OWN_SUBNAV = ['/chat', '/divisions', '/settings', '/admin', '/announcements'];

/** Authenticated layout: icon rail + project sidebar + main canvas. */
export function AppShell() {
  useRealtimeSync();
  useChatRealtime();
  useUnreadBadge();
  useAnnouncementRealtime();
  const { pathname } = useLocation();
  const showProjects = !OWN_SUBNAV.some((prefix) => pathname.startsWith(prefix));

  return (
    <div className="flex h-full overflow-hidden">
      <AppRail />
      {showProjects && <ProjectSidebar />}
      <main className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-canvas">
        <Outlet />
      </main>
      <CardModal />
      <DesktopBridge />
      <CommandPalette />
      <QuickTaskModal />
    </div>
  );
}

/** Optional left sub-navigation column (240–280px) used by section pages. */
export function SubNavLayout({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-subnav shrink-0 overflow-y-auto border-r border-line bg-surface">{nav}</aside>
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
