import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './providers/AuthProvider';
import { isCurrentUserAdmin } from '../features/admin/services';
import { AdminDashboardPage } from '../features/admin/pages/AdminDashboardPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { CatalogPage } from '../features/catalog/pages/CatalogPage';
import { PlaylistRuntimeProvider } from '../features/playlists/providers/PlaylistRuntimeProvider';

const UniversalPlayerPage = lazy(
  () => import('../features/player/pages/UniversalPlayerPage'),
);

const TestPlaylistPage = lazy(
  () => import('../features/player/pages/TestPlaylistPage'),
);

const DirectSourcePlaylistPage = lazy(
  () => import('../features/playlists/pages/DirectSourcePlaylistPage'),
);

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="xf-app flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold text-xf-muted">Carregando...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
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
    return <Navigate to="/login" replace />;
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
  return (
    <BrowserRouter>
      <PlaylistRuntimeProvider>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <CatalogPage />
                </ProtectedRoute>
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
              path="/player"
              element={
                <ProtectedRoute>
                  <UniversalPlayerPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/player/test-playlist"
              element={
                <ProtectedRoute>
                  <TestPlaylistPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/playlists/direct-source"
              element={
                <ProtectedRoute>
                  <DirectSourcePlaylistPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </PlaylistRuntimeProvider>
    </BrowserRouter>
  );
}
