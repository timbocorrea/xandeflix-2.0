import {
  Clapperboard,
  Home,
  MonitorPlay,
  Search,
  Settings,
  Tv,
} from 'lucide-react';

const menuItems = [
  {
    label: 'Início',
    icon: Home,
    navId: 'sidebar-home',
  },
  {
    label: 'Pesquisar',
    icon: Search,
    navId: 'sidebar-search',
  },
  {
    label: 'Canais',
    icon: Tv,
    navId: 'sidebar-channels',
  },
  {
    label: 'Filmes',
    icon: Clapperboard,
    navId: 'sidebar-movies',
  },
  {
    label: 'Séries',
    icon: MonitorPlay,
    navId: 'sidebar-series',
  },
  {
    label: 'Configurações',
    icon: Settings,
    navId: 'sidebar-settings',
  },
];

export function TvSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-24 flex-col items-center border-r border-white/5 bg-black/80 py-6 backdrop-blur md:flex">
      <div className="mb-10 flex size-12 items-center justify-center rounded-2xl bg-xf-red text-xl font-black text-white">
        X
      </div>

      <nav className="flex flex-1 flex-col items-center gap-4">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.navId}
              className="tv-focusable group flex size-14 items-center justify-center rounded-2xl bg-transparent text-xf-muted hover:text-white"
              type="button"
              data-nav-id={item.navId}
              aria-label={item.label}
              title={item.label}
            >
              <Icon size={26} />
            </button>
          );
        })}
      </nav>
    </aside>
  );
}