import {
  Clapperboard,
  Home,
  MonitorPlay,
  Search,
  Settings,
  Tv,
} from 'lucide-react';

import { FocusableButton } from '../tv/FocusableButton';
import { FocusableSection } from '../tv/FocusableSection';

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

      <FocusableSection
        focusKey="sidebar-section"
        className="flex flex-1 flex-col items-center gap-4"
      >
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <FocusableButton
              key={item.navId}
              focusKey={item.navId}
              className="group flex size-14 items-center justify-center rounded-2xl bg-transparent text-xf-muted hover:text-white"
              aria-label={item.label}
              title={item.label}
              onEnterPress={() => {
                console.log(`[D-Pad] Menu: ${item.label}`);
              }}
            >
              <Icon size={26} />
            </FocusableButton>
          );
        })}
      </FocusableSection>
    </aside>
  );
}