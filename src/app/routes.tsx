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
import { AdminPlaybackSessionsPage } from '../features/admin/pages/AdminPlaybackSessionsPage';
import { AdminAppInstallationsPage } from '../features/admin/pages/AdminAppInstallationsPage';
import { AdminAppInstallationDetailsPage } from '../features/admin/pages/AdminAppInstallationDetailsPage';
import { AdminAuditLogsPage } from '../features/admin/pages/AdminAuditLogsPage';
import { AdminUsersPage } from '../features/admin/pages/AdminUsersPage';
import { AdminDashboardPage } from '../features/admin/pages/AdminDashboardPage';
import { AdminLoginPage } from '../features/admin/pages/AdminLoginPage';
import { SuperAdminOnly } from '../features/admin/components/SuperAdminOnly';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { getStoredLicenseActivation } from '../features/licensing/lib/licenseActivationStorage';
import { validateStoredLicenseSession } from '../features/licensing/services/licenseSessionValidation.service';
import { CatalogPage } from '../features/catalog/pages/CatalogPage';
import { CatalogLaunchesPage } from '../features/catalog/pages/CatalogLaunchesPage';
import { CatalogCategoryPage } from '../features/catalog/pages/CatalogCategoryPage';
import { PreparingHomePage } from '../features/catalog/pages/PreparingHomePage';
import { clearClientRuntimeAccessState } from '../features/bootstrap/services/appBootstrap.service';
import { PlaylistRuntimeProvider, usePlaylistRuntime } from '../features/playlists/providers/PlaylistRuntimeProvider';
import { env } from '../config/env';
import { LOCAL_CATALOG_SEARCH_ROUTE } from '../features/localCatalog/lib/localCatalogSearchUiContract';
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

const LocalCatalogSearchPage = lazy(
  () => import('../features/localCatalog/pages/LocalCatalogSearchPage'),
);

function LicenseRoute({ children }: { children: ReactNode }) {
  const { source: playlistSource } = usePlaylistRuntime();
  const storedActivation = getStoredLicenseActivation();
  const licenseCode = storedActivation?.licenseCode?.trim() ?? '';
  const deviceIdentifier = storedActivation?.deviceIdentifier?.trim() ?? '';
  const [validationStatus, setValidationStatus] = useState<
    'checking' | 'valid' | 'invalid'
  >('checking');

  useEffect(() => {
    let isMounted = true;

    if (!licenseCode || !deviceIdentifier) {
      setValidationStatus('invalid');
      return () => {
        isMounted = false;
      };
    }

    setValidationStatus('checking');

    void validateStoredLicenseSession({
      licenseCode,
      deviceIdentifier,
    }).then((result) => {
      if (!isMounted) {
        return;
      }

      if (result.valid) {
        setValidationStatus('valid');
        return;
      }

      clearClientRuntimeAccessState();
      setValidationStatus('invalid');
    });

    return () => {
      isMounted = false;
    };
  }, [licenseCode, deviceIdentifier]);

  if (!licenseCode || !deviceIdentifier || validationStatus === 'invalid') {
    return <Navigate to="/login" replace />;
  }

  if (validationStatus !== 'valid') {
    return (
      <main className="xf-app flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold text-xf-muted">
          Validando licença...
        </p>
      </main>
    );
  }

  if (playlistSource?.sourceId) {
    return children;
  }

  return <Navigate to="/preparing-home" replace />;
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
              path={LOCAL_CATALOG_SEARCH_ROUTE}
              element={
                <LicenseRoute>
                  <LocalCatalogSearchPage />
                </LicenseRoute>
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
