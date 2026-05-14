import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { useCurrentAdminProfile } from '../hooks/useCurrentAdminProfile';
import { canViewAuditLogs } from '../lib/adminPermissions';

const adminNavItems = [
  { label: 'Visão geral', to: '/admin' },
  { label: 'Clientes', to: '/admin/clients' },
  { label: 'Dispositivos', to: '/admin/devices' },
  { label: 'Licenças', to: '/admin/licenses' },
  { label: 'Fontes IPTV', to: '/admin/iptv-sources' },
];

const superAdminNavItems = [
  { label: 'Administradores', to: '/admin/admin-users' },
  { label: 'Auditoria', to: '/admin/audit-logs' },
];

function getAdminRoleLabel(role?: string) {
  if (role === 'super_admin') {
    return 'Super Admin';
  }

  if (role === 'admin') {
    return 'Admin';
  }

  return 'Admin';
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { adminProfile, isLoading } = useCurrentAdminProfile();
  const adminRoleLabel = getAdminRoleLabel(adminProfile?.role);
  const visibleAdminNavItems = canViewAuditLogs(adminProfile)
    ? [...adminNavItems, ...superAdminNavItems]
    : adminNavItems;

  return (
    <main className="xf-app min-h-screen text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-black/30 px-5 py-6 lg:block">
          <Link to="/admin" className="block">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-xf-muted">
              Xandeflix
            </p>
            <h1 className="mt-2 text-2xl font-black">Admin</h1>
          </Link>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.24em] text-xf-muted">
              Perfil atual
            </p>
            <p className="mt-2 break-all text-sm font-bold text-white">
              {isLoading ? 'Carregando...' : adminProfile?.email ?? 'Admin autenticado'}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-xf-red">
              {adminRoleLabel}
            </p>
          </div>

          <nav className="mt-8 flex flex-col gap-2">
            {visibleAdminNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className={({ isActive }) =>
                  [
                    'rounded-xl px-4 py-3 text-sm font-semibold transition',
                    isActive
                      ? 'bg-white text-black'
                      : 'text-xf-muted hover:bg-white/10 hover:text-white',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Link
            to="/"
            className="mt-8 block rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-xf-muted transition hover:bg-white/10 hover:text-white"
          >
            Voltar ao catálogo
          </Link>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-white/10 bg-black/20 px-5 py-4 lg:hidden">
            <div className="flex flex-col gap-1">
              <Link to="/admin" className="text-lg font-black">
                Xandeflix Admin
              </Link>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-xf-red">
                {adminRoleLabel}
              </p>
            </div>

            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {visibleAdminNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/admin'}
                  className={({ isActive }) =>
                    [
                      'whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold',
                      isActive
                        ? 'bg-white text-black'
                        : 'bg-white/5 text-xf-muted',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </header>

          <div className="flex-1 px-5 py-8 lg:px-10">{children}</div>
        </section>
      </div>
    </main>
  );
}
