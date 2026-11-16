import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { platform } from '@nexus/platform';
import { isOrgAdmin } from '@nexus/shared';
import { AppShell } from './components/layout/AppShell';
import { EmptyState, ErrorState, PageSpinner } from './components/ui';
import { AdminPage } from './features/admin/AdminPage';
import { AnnouncementsPage } from './features/announcements/AnnouncementsPage';
import { AuthCallbackPage } from './features/auth/AuthCallbackPage';
import { useMetaQuery, useSessionBootstrap } from './features/auth/hooks';
import { InvitePage } from './features/auth/InvitePage';
import { LoginPage } from './features/auth/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from './features/auth/PasswordPages';
import { SetupPage } from './features/auth/SetupPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { BoardPage } from './features/board/BoardPage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { ChatPage } from './features/chat/ChatPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { compareVersions } from './features/desktop/useDesktopUpdate';
import { UpdateRequired } from './features/desktop/UpdateRequired';
import { DivisionsPage } from './features/divisions/DivisionsPage';
import { MyTasksPage } from './features/my-tasks/MyTasksPage';
import { NotificationsPage } from './features/notifications/NotificationsPage';
import { ProjectsIndexPage } from './features/projects/ProjectsIndexPage';
import { ProjectSettingsPage } from './features/projects/settings/ProjectSettingsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { useAuthStore } from './stores/auth';

/** Loads app metadata, restores the session and sends first-run installs to /setup. */
function RootLayout() {
  const meta = useMetaQuery();
  const { pathname } = useLocation();
  const appVersion = useQuery({ queryKey: ['app-version'], queryFn: () => platform.appVersion(), staleTime: Infinity });
  useSessionBootstrap(meta.data?.setupRequired);

  if (meta.isPending) return <PageSpinner />;
  if (meta.isError) {
    return (
      <div className="mx-auto max-w-md p-10">
        <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />
      </div>
    );
  }
  // Desktop builds older than the server's minimum must update first (PRD §4).
  const version = appVersion.data;
  if (version && compareVersions(version, meta.data.minDesktopVersion) < 0) {
    return <UpdateRequired current={version} minimum={meta.data.minDesktopVersion} />;
  }
  if (meta.data.setupRequired && pathname !== '/setup') return <Navigate to="/setup" replace />;
  if (!meta.data.setupRequired && pathname === '/setup') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Only for signed-out visitors (login, password reset…). */
function GuestOnly() {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <PageSpinner />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <PageSpinner />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

function RequireAdmin() {
  const user = useAuthStore((s) => s.user);
  if (!user || !isOrgAdmin(user.orgRole)) return <Navigate to="/my-tasks" replace />;
  return <Outlet />;
}

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md p-10">
      <EmptyState
        title="Halaman tidak ditemukan"
        description="Tautan mungkin salah atau halaman sudah dipindahkan."
        action={
          <Link to="/" className="font-medium text-brand hover:underline">
            Kembali ke beranda
          </Link>
        }
      />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/setup', element: <SetupPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/invite/:token', element: <InvitePage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/dashboard" replace /> },
              { path: '/dashboard', element: <DashboardPage /> },
              { path: '/announcements', element: <AnnouncementsPage /> },
              { path: '/announcements/:announcementId', element: <AnnouncementsPage /> },
              { path: '/my-tasks', element: <MyTasksPage /> },
              { path: '/calendar', element: <CalendarPage /> },
              { path: '/divisions', element: <DivisionsPage /> },
              { path: '/divisions/:divisionId', element: <DivisionsPage /> },
              { path: '/projects', element: <ProjectsIndexPage /> },
              { path: '/projects/:projectId', element: <BoardPage /> },
              { path: '/projects/:projectId/settings', element: <ProjectSettingsPage /> },
              { path: '/chat', element: <ChatPage /> },
              { path: '/chat/:channelId', element: <ChatPage /> },
              { path: '/notifications', element: <NotificationsPage /> },
              { path: '/settings', element: <SettingsPage /> },
              { element: <RequireAdmin />, children: [{ path: '/admin', element: <AdminPage /> }] },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
