import { Search, UserRound, LogOut } from 'lucide-react';
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
  userEmail?: string;
  onSignOut: () => void;
  navigation?: HeaderNavigationHandlers;
}

export function AppHeader({
  userEmail,
  onSignOut,
  navigation,
}: AppHeaderProps) {
  const { isMobile, isTv } = useDeviceType();
  const shouldShowActions = !isTv;

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between bg-gradient-to-b from-black via-xf-bg to-transparent px-4 md:px-8 lg:px-10">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red md:text-sm">
          Xandeflix
        </p>

        <p className="mt-1 hidden text-sm text-xf-muted md:block">
          {userEmail ? `Conectado como ${userEmail}` : 'Streaming premium'}
        </p>
      </div>

      {shouldShowActions ? (
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
      ) : null}
    </header>
  );
}
