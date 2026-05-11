import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

import { useDeviceType } from '../../hooks/useDeviceType';
import { useDeviceProfile } from '../../platform/useDeviceProfile';
import { AppHeader, type HeaderNavigationHandlers } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { TvSidebar } from './TvSidebar';

interface AppShellProps {
  children: ReactNode;
  userEmail?: string;
  onSignOut: () => void;
  headerNavigation?: HeaderNavigationHandlers;
  hideHeaderOnTv?: boolean;
  mainClassName?: string;
}

export function AppShell({
  children,
  userEmail,
  onSignOut,
  headerNavigation,
  hideHeaderOnTv = false,
  mainClassName,
}: AppShellProps) {
  const deviceProfile = useDeviceProfile();
  const { isTv: legacyIsTv, isMobile } = useDeviceType();
  const isTv = deviceProfile.formFactor === 'tv' || legacyIsTv;
  const shouldShowHeader = !(isTv && hideHeaderOnTv);

  return (
    <div
      className="xf-app min-h-screen"
      data-device-runtime={deviceProfile.runtime}
      data-device-form-factor={deviceProfile.formFactor}
      data-device-input={deviceProfile.inputMode}
      data-viewport-width={deviceProfile.viewportWidth}
      data-viewport-height={deviceProfile.viewportHeight}
      data-device-pixel-ratio={deviceProfile.devicePixelRatio}
      data-player-strategy={deviceProfile.playerStrategy}
    >
      {isTv && <TvSidebar onSignOut={onSignOut} />}

      <div className={cn('min-h-screen', isTv && 'pl-0 md:pl-16')}>
        {shouldShowHeader ? (
          <AppHeader
            userEmail={userEmail}
            onSignOut={onSignOut}
            navigation={headerNavigation}
          />
        ) : null}

        <main
          className={cn(
            'px-4 pb-28 md:px-8 md:pb-10 lg:px-10',
            shouldShowHeader ? (isTv ? 'pt-6' : 'pt-2') : 'pt-3 md:pt-4',
            mainClassName,
          )}
        >
          {children}
        </main>
      </div>

      {(isMobile || !isTv) && <MobileBottomNav />}
    </div>
  );
}
