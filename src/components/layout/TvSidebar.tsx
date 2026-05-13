import {
  Clapperboard,
  Home,
  MonitorPlay,
  Search,
  Settings,
  Tv,
  UserRound,
  LogOut,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { FOCUS_KEYS } from '@/lib/spatial/focusKeys';
import { focusLastCatalogItem } from '@/lib/spatial/focusNavigation';
import { FocusableButton } from '../tv/FocusableButton';
import { FocusableSection } from '../tv/FocusableSection';

const menuItems = [
  {
    label: 'Início',
    icon: Home,
    navId: 'sidebar-home',
    path: '/',
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
    path: '/live',
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
    path: '/settings',
  },
];

interface TvSidebarProps {
  onSignOut: () => void;
}

export function TvSidebar({ onSignOut }: TvSidebarProps) {
  const navigate = useNavigate();

  function handleSidebarArrowPress(direction: string) {
    if (direction === 'right' && window.location.pathname === '/') {
      return focusLastCatalogItem();
    }

    return true;
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col items-center bg-black/80 py-5 backdrop-blur">
      <div className="mb-8 flex size-10 items-center justify-center rounded-xl bg-xf-red text-lg font-black text-white">
        X
      </div>

      <FocusableSection
        focusKey={FOCUS_KEYS.SIDEBAR_SECTION}
        className="flex min-h-0 flex-1 flex-col items-center"
      >
        <div className="flex flex-col items-center gap-3">
          <FocusableButton
            focusKey={FOCUS_KEYS.SIDEBAR_PROFILE}
            className="group flex size-11 items-center justify-center rounded-xl bg-transparent text-xf-muted hover:text-white"
            aria-label="Perfil"
            title="Perfil"
            onEnterPress={() => {
              spatialDebug('sidebar', 'Perfil');
            }}
            onClick={() => {
              spatialDebug('sidebar', 'Perfil');
            }}
            onArrowPress={handleSidebarArrowPress}
          >
            <UserRound size={20} />
          </FocusableButton>

          {menuItems.map((item) => {
            const Icon = item.icon;

            const handlePress = () => {
              if (item.path) {
                navigate(item.path);
                return;
              }

              spatialDebug('sidebar', 'Menu:', item.label);
            };

            return (
              <FocusableButton
                key={item.navId}
                focusKey={item.navId}
                className="group flex size-11 items-center justify-center rounded-xl bg-transparent text-xf-muted hover:text-white"
                aria-label={item.label}
                title={item.label}
                onEnterPress={handlePress}
                onClick={handlePress}
                onArrowPress={handleSidebarArrowPress}
              >
                <Icon size={20} />
              </FocusableButton>
            );
          })}
        </div>

        <FocusableButton
          focusKey={FOCUS_KEYS.SIDEBAR_LOGOUT}
          className="mt-auto flex size-11 items-center justify-center rounded-xl bg-xf-red text-white"
          aria-label="Sair"
          title="Sair"
          onEnterPress={onSignOut}
          onClick={onSignOut}
          onArrowPress={handleSidebarArrowPress}
        >
          <LogOut size={19} />
        </FocusableButton>
      </FocusableSection>
    </aside>
  );
}
