import { Search, UserRound, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { FocusableButton } from '../tv/FocusableButton';
import { FocusableSection } from '../tv/FocusableSection';
import { useDeviceType } from '../../hooks/useDeviceType';
import { FOCUS_KEYS } from '../../lib/spatial/focusKeys';

export interface HeaderNavigationHandlers {
  onSearchArrowPress?: (direction: string) => boolean;
  onProfileArrowPress?: (direction: string) => boolean;
  onLogoutArrowPress?: (direction: string) => boolean;
}

interface AppHeaderProps {
  onSignOut: () => void;
  navigation?: HeaderNavigationHandlers;
}

export function AppHeader({
  onSignOut,
  navigation,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const { isMobile, isTablet, isTv } = useDeviceType();

  if (isTablet && !isTv) {
    return (
      <header className="sticky top-0 z-30 flex h-16 items-center justify-center bg-gradient-to-b from-black via-xf-bg to-transparent px-4">
        <FocusableSection
          focusKey="tablet-header-primary-nav"
          className="grid w-full max-w-md grid-cols-2 gap-2"
        >
          <FocusableButton
            focusKey="tablet-header-live"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-white/10 px-3 text-sm font-black uppercase tracking-[0.16em] text-white"
            onEnterPress={() => navigate('/live')}
            onClick={() => navigate('/live')}
          >
            Ao Vivo
          </FocusableButton>

          <FocusableButton
            focusKey="tablet-header-movies"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-white/10 px-3 text-sm font-black uppercase tracking-[0.16em] text-white"
            onEnterPress={() => navigate('/launches')}
            onClick={() => navigate('/launches')}
          >
            Filmes
          </FocusableButton>
        </FocusableSection>
      </header>
    );
  }

  const shouldShowActions = !isMobile && !isTablet && !isTv;

  if (!shouldShowActions) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-end bg-gradient-to-b from-black via-xf-bg to-transparent px-4 md:px-8 lg:px-10">
      <FocusableSection
        focusKey={FOCUS_KEYS.HEADER_ACTIONS_SECTION}
        className="flex items-center gap-3"
      >
        {!isMobile && (
          <FocusableButton
            focusKey={FOCUS_KEYS.HEADER_SEARCH_BUTTON}
            className="inline-flex rounded-full bg-xf-surface-soft p-3 text-white"
            aria-label="Pesquisar"
            onEnterPress={() => {
              spatialDebug('header', 'Pesquisar');
            }}
            onArrowPress={navigation?.onSearchArrowPress}
          >
            <Search size={22} />
          </FocusableButton>
        )}

        {!isMobile && (
          <FocusableButton
            focusKey={FOCUS_KEYS.HEADER_PROFILE_BUTTON}
            className="inline-flex rounded-full bg-xf-surface-soft p-3 text-white"
            aria-label="Perfil"
            onEnterPress={() => {
              spatialDebug('header', 'Perfil');
            }}
            onArrowPress={navigation?.onProfileArrowPress}
          >
            <UserRound size={22} />
          </FocusableButton>
        )}

        <FocusableButton
          focusKey={FOCUS_KEYS.HEADER_LOGOUT_BUTTON}
          className="inline-flex items-center gap-2 rounded-full bg-xf-red px-4 py-3 text-sm font-bold text-white"
          onEnterPress={onSignOut}
          onClick={onSignOut}
          onArrowPress={navigation?.onLogoutArrowPress}
        >
          <LogOut size={18} />
          <span className={isMobile ? 'hidden' : 'inline'}>Sair</span>
        </FocusableButton>
      </FocusableSection>
    </header>
  );
}
