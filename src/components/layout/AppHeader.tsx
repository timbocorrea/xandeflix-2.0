import { LogOut, Search, UserRound } from 'lucide-react';

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

      <div className="flex items-center gap-3">
        <button
          className="tv-focusable hidden rounded-full bg-xf-surface-soft p-3 text-white md:inline-flex"
          type="button"
          data-nav-id="header-search-button"
          aria-label="Pesquisar"
        >
          <Search size={22} />
        </button>

        <button
          className="tv-focusable hidden rounded-full bg-xf-surface-soft p-3 text-white md:inline-flex"
          type="button"
          data-nav-id="header-profile-button"
          aria-label="Perfil"
        >
          <UserRound size={22} />
        </button>

        <button
          className="tv-focusable inline-flex items-center gap-2 rounded-full bg-xf-red px-4 py-3 text-sm font-bold text-white"
          type="button"
          onClick={onSignOut}
          data-nav-id="header-logout-button"
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}