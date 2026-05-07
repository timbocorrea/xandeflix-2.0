import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

const adminNavItems = [
  { label: 'Visão geral', to: '/admin' },
  { label: 'Clientes', to: '/admin/clients' },
  { label: 'Dispositivos', to: '/admin/devices' },
  { label: 'Fontes IPTV', to: '/admin/iptv-sources' },
  { label: 'Auditoria', to: '/admin/audit-logs' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
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

          <nav className="mt-8 flex flex-col gap-2">
            {adminNavItems.map((item) => (
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
            <Link to="/admin" className="text-lg font-black">
              Xandeflix Admin
            </Link>

            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {adminNavItems.map((item) => (
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
