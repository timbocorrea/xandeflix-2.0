import type { ReactNode } from 'react';

import { AppHeader } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { TvSidebar } from './TvSidebar';

interface AppShellProps {
  children: ReactNode;
  userEmail?: string;
  onSignOut: () => void;
}

export function AppShell({ children, userEmail, onSignOut }: AppShellProps) {
  return (
    <div className="xf-app min-h-screen">
      <TvSidebar />

      <div className="min-h-screen md:pl-24">
        <AppHeader userEmail={userEmail} onSignOut={onSignOut} />

        <main className="px-4 pb-28 pt-2 md:px-8 md:pb-10 lg:px-10">
          {children}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}