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
import {
  focusCatalogEntryPoint,
  focusLiveEntryPoint,
  focusSettingsEntryPoint,
} from '@/lib/spatial/focusNavigation';
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
    path: '/category/filmes',
  },
  {
    label: 'Séries',
    icon: MonitorPlay,
    navId: 'sidebar-series',
    path: '/category/series',
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
  isTablet?: boolean;
}

export function TvSidebar({ onSignOut, isTablet = false }: TvSidebarProps) {
  const navigate = useNavigate();

  function handleSidebarArrowPress(direction: string) {
    if (direction !== 'right') {
      return true;
    }

    if (window.location.pathname === '/') {
      return focusCatalogEntryPoint();
    }

    if (window.location.pathname.startsWith('/live')) {
      return focusLiveEntryPoint();
    }

    if (window.location.pathname.startsWith('/settings')) {
      return focusSettingsEntryPoint();
    }

    return true;
  }

  const sidebarWidthClass = isTablet ? 'w-[4.5rem]' : 'w-14';
  const logoSizeClass = isTablet ? 'size-12' : 'size-9';
  const menuButtonClass = isTablet ? 'size-14 rounded-2xl' : 'size-10 rounded-xl';
  const menuIconSize = isTablet ? 28 : 18;
  const logoutIconSize = isTablet ? 26 : 17;
  const menuGapClass = isTablet ? 'gap-4' : 'gap-2.5';

  return (
    <aside className={`fixed left-0 top-0 z-40 flex h-screen ${sidebarWidthClass} flex-col items-center bg-black/80 py-5 backdrop-blur`}>
      <div className={`mb-6 flex ${logoSizeClass} items-center justify-center rounded-xl bg-xf-red text-lg font-black text-white`}>
        X
      </div>

      <FocusableSection
        focusKey={FOCUS_KEYS.SIDEBAR_SECTION}
        className="flex min-h-0 flex-1 flex-col items-center justify-center"
      >
        <div className={`flex flex-col items-center ${menuGapClass}`}>
          <FocusableButton
            focusKey={FOCUS_KEYS.SIDEBAR_PROFILE}
            className={`group flex ${menuButtonClass} items-center justify-center bg-transparent text-xf-muted hover:text-white`}
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
            <UserRound size={menuIconSize} />
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
                className={`group flex ${menuButtonClass} items-center justify-center bg-transparent text-xf-muted hover:text-white`}
                aria-label={item.label}
                title={item.label}
                onEnterPress={handlePress}
                onClick={handlePress}
                onArrowPress={handleSidebarArrowPress}
              >
                <Icon size={menuIconSize} />
              </FocusableButton>
            );
          })}
        </div>

        <FocusableButton
          focusKey={FOCUS_KEYS.SIDEBAR_LOGOUT}
          className={`mt-auto flex ${menuButtonClass} items-center justify-center bg-xf-red text-white`}
          aria-label="Sair"
          title="Sair"
          onEnterPress={onSignOut}
          onClick={onSignOut}
          onArrowPress={handleSidebarArrowPress}
        >
          <LogOut size={logoutIconSize} />
        </FocusableButton>
      </FocusableSection>
    </aside>
  );
}
