import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './providers/AuthProvider';
import { useAppInstallationHeartbeat } from '../features/app-installations/hooks/useAppInstallationHeartbeat';
import { isCurrentUserAdmin } from '../features/admin/services';
import { AdminClientsPage } from '../features/admin/pages/AdminClientsPage';
import { AdminDevicesPage } from '../features/admin/pages/AdminDevicesPage';
import { AdminIptvSourcesPage } from '../features/admin/pages/AdminIptvSourcesPage';
import { AdminLicensesPage } from '../features/admin/pages/AdminLicensesPage';
import { AdminLicenseChannelsCachePage } from '../features/admin/pages/AdminLicenseChannelsCachePage';
import { AdminPlaybackSessionsPage } from '../features/admin/pages/AdminPlaybackSessionsPage';
import { AdminAppInstallationsPage } from '../features/admin/pages/AdminAppInstallationsPage';
import { AdminAppInstallationDetailsPage } from '../features/admin/pages/AdminAppInstallationDetailsPage';
import { AdminAuditLogsPage } from '../features/admin/pages/AdminAuditLogsPage';
import { AdminLicenseImportsPage } from '../features/admin/pages/AdminLicenseImportsPage';
import { AdminUsersPage } from '../features/admin/pages/AdminUsersPage';
import { AdminDashboardPage } from '../features/admin/pages/AdminDashboardPage';
import { AdminLoginPage } from '../features/admin/pages/AdminLoginPage';
import { SuperAdminOnly } from '../features/admin/components/SuperAdminOnly';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { getStoredLicenseActivation } from '../features/licensing/lib/licenseActivationStorage';
import { CatalogPage } from '../features/catalog/pages/CatalogPage';
import { CatalogLaunchesPage } from '../features/catalog/pages/CatalogLaunchesPage';
import { CatalogCategoryPage } from '../features/catalog/pages/CatalogCategoryPage';
import { PreparingHomePage } from '../features/catalog/pages/PreparingHomePage';
import { PlaylistRuntimeProvider } from '../features/playlists/providers/PlaylistRuntimeProvider';
import { env } from '../config/env';
// Warmup VOD pausado temporariamente para validar D-pad sem carga em background.

const LocalCatalogSmokeTestPage = lazy(
  () => import('../features/localCatalog/pages/LocalCatalogSmokeTestPage'),
);

const UniversalPlayerPage = lazy(
  () => import('../features/player/pages/UniversalPlayerPage'),
);

const DirectSourcePlaylistPage = lazy(
  () => import('../features/playlists/pages/DirectSourcePlaylistPage'),
);

const LiveTvPage = lazy(
  () => import('../features/live/pages/LiveTvPage'),
);

const SettingsPage = lazy(
  () => import('../features/settings/pages/SettingsPage'),
);

function LicenseRoute({ children }: { children: ReactNode }) {
  const storedActivation = getStoredLicenseActivation();

  if (!storedActivation?.licenseCode || !storedActivation.deviceIdentifier) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function checkAdminAccess() {
      if (isLoading) {
        return;
      }

      if (!isAuthenticated) {
        if (isMounted) {
          setIsAdmin(false);
          setIsCheckingAdmin(false);
        }

        return;
      }

      try {
        const hasAdminAccess = await isCurrentUserAdmin();

        if (isMounted) {
          setIsAdmin(hasAdminAccess);
        }
      } catch {
        if (isMounted) {
          setIsAdmin(false);
        }
      } finally {
        if (isMounted) {
          setIsCheckingAdmin(false);
        }
      }
    }

    setIsCheckingAdmin(true);
    void checkAdminAccess();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, isLoading]);

  if (isLoading || isCheckingAdmin) {
    return (
      <main className="xf-app flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold text-xf-muted">
          Verificando acesso administrativo...
        </p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function RouteLoader() {
  return (
    <main className="xf-app flex min-h-screen items-center justify-center">
      <p className="text-xl font-semibold text-xf-muted">Carregando rota...</p>
    </main>
  );
}

export function AppRoutes() {
  useAppInstallationHeartbeat();

  return (
    <BrowserRouter>
      <PlaylistRuntimeProvider>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />

            <Route path="/preparing-home" element={<PreparingHomePage />} />

            {env.localCatalogSmokeTestEnabled && (
              <Route
                path="/debug/local-catalog-smoke"
                element={<LocalCatalogSmokeTestPage />}
              />
            )}

            <Route
              path="/"
              element={
                <LicenseRoute>
                  <CatalogPage />
                </LicenseRoute>
              }
            />

            <Route
              path="/launches"
              element={
                <LicenseRoute>
                  <CatalogLaunchesPage />
                </LicenseRoute>
              }
            />

            <Route
              path="/category/:groupSlug"
              element={
                <LicenseRoute>
                  <CatalogCategoryPage />
                </LicenseRoute>
              }
            />



            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboardPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/clients"
              element={
                <AdminRoute>
                  <AdminClientsPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/devices"
              element={
                <AdminRoute>
                  <AdminDevicesPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/licenses"
              element={
                <AdminRoute>
                  <AdminLicensesPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/playback-sessions"
              element={
                <AdminRoute>
                  <AdminPlaybackSessionsPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/license-channels"
              element={
                <AdminRoute>
                  <AdminLicenseChannelsCachePage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/iptv-sources"
              element={
                <AdminRoute>
                  <AdminIptvSourcesPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/app-installations"
              element={
                <AdminRoute>
                  <SuperAdminOnly>
                    <AdminAppInstallationsPage />
                  </SuperAdminOnly>
                </AdminRoute>
              }
            />

            <Route
              path="/admin/app-installations/:installationId"
              element={
                <AdminRoute>
                  <SuperAdminOnly>
                    <AdminAppInstallationDetailsPage />
                  </SuperAdminOnly>
                </AdminRoute>
              }
            />

            <Route
              path="/admin/admin-users"
              element={
                <AdminRoute>
                  <SuperAdminOnly>
                    <AdminUsersPage />
                  </SuperAdminOnly>
                </AdminRoute>
              }
            />

            <Route
              path="/admin/license-imports"
              element={
                <AdminRoute>
                  <SuperAdminOnly>
                    <AdminLicenseImportsPage />
                  </SuperAdminOnly>
                </AdminRoute>
              }
            />

            <Route
              path="/admin/audit-logs"
              element={
                <AdminRoute>
                  <SuperAdminOnly>
                    <AdminAuditLogsPage />
                  </SuperAdminOnly>
                </AdminRoute>
              }
            />

            <Route
              path="/live"
              element={
                <LicenseRoute>
                  <LiveTvPage />
                </LicenseRoute>
              }
            />

            <Route
              path="/player"
              element={
                <LicenseRoute>
                  <UniversalPlayerPage />
                </LicenseRoute>
              }
            />
              <Route
              path="/settings"
              element={
                <LicenseRoute>
                  <SettingsPage />
                </LicenseRoute>
              }
            />



            <Route
              path="/playlists/direct-source"
              element={
                <LicenseRoute>
                  <DirectSourcePlaylistPage />
                </LicenseRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </PlaylistRuntimeProvider>
    </BrowserRouter>
  );
}
