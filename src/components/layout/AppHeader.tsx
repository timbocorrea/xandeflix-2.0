import { LogOut, Search, UserRound } from 'lucide-react';

import { FocusableButton } from '../tv/FocusableButton';
import { FocusableSection } from '../tv/FocusableSection';

interface AppHeaderProps {
  userEmail?: string;
  onSignOut: () => void;
}

export function AppHeader({ userEmail, onSignOut }: AppHeaderProps) {
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

      <FocusableSection
        focusKey="header-actions-section"
        className="flex items-center gap-3"
      >
        <FocusableButton
          focusKey="header-search-button"
          className="hidden rounded-full bg-xf-surface-soft p-3 text-white md:inline-flex"
          aria-label="Pesquisar"
          onEnterPress={() => {
            console.log('[D-Pad] Pesquisar');
          }}
        >
          <Search size={22} />
        </FocusableButton>

        <FocusableButton
          focusKey="header-profile-button"
          className="hidden rounded-full bg-xf-surface-soft p-3 text-white md:inline-flex"
          aria-label="Perfil"
          onEnterPress={() => {
            console.log('[D-Pad] Perfil');
          }}
        >
          <UserRound size={22} />
        </FocusableButton>

        <FocusableButton
          focusKey="header-logout-button"
          className="inline-flex items-center gap-2 rounded-full bg-xf-red px-4 py-3 text-sm font-bold text-white"
          onEnterPress={onSignOut}
          onClick={onSignOut}
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Sair</span>
        </FocusableButton>
      </FocusableSection>
    </header>
  );
}