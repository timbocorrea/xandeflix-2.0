import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useCurrentAdminProfile } from '../hooks/useCurrentAdminProfile';
import { isSuperAdmin } from '../lib/adminPermissions';

export function SuperAdminOnly({ children }: { children: ReactNode }) {
  const { adminProfile, isLoading } = useCurrentAdminProfile();

  if (isLoading) {
    return (
      <main className="xf-app flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold text-xf-muted">
          Verificando permissão de Super Admin...
        </p>
      </main>
    );
  }

  if (!isSuperAdmin(adminProfile)) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}
