import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

import { useDeviceType } from '../../hooks/useDeviceType';
import { AppHeader, type HeaderNavigationHandlers } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { TvSidebar } from './TvSidebar';

interface AppShellProps {
  children: ReactNode;
  userEmail?: string;
  onSignOut: () => void;
  headerNavigation?: HeaderNavigationHandlers;
}

export function AppShell({
  children,
  userEmail,
  onSignOut,
  headerNavigation,
}: AppShellProps) {
  const { isTv, isMobile } = useDeviceType();

  return (
    <div className="xf-app min-h-screen">
      {isTv && <TvSidebar />}

      <div className={cn('min-h-screen', isTv && 'pl-0 md:pl-24')}>
        <AppHeader
          userEmail={userEmail}
          onSignOut={onSignOut}
          navigation={headerNavigation}
        />

        <main className="px-4 pb-28 pt-2 md:px-8 md:pb-10 lg:px-10">
          {children}
        </main>
      </div>

      {(isMobile || !isTv) && <MobileBottomNav />}
    </div>
  );
}