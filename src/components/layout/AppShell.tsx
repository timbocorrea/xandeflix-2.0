import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

import { useDeviceType } from '../../hooks/useDeviceType';
import { useDeviceProfile } from '../../platform/useDeviceProfile';
import { AppHeader, type HeaderNavigationHandlers } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { TvSidebar } from './TvSidebar';

interface AppShellProps {
  children: ReactNode;
  onSignOut: () => void;
  headerNavigation?: HeaderNavigationHandlers;
  hideHeaderOnTv?: boolean;
  mainClassName?: string;
}

function getTvPlatform() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();

  if (
    userAgent.includes('aft') ||
    userAgent.includes('fire tv') ||
    userAgent.includes('firetv')
  ) {
    return 'fire-tv';
  }

  return undefined;
}

export function AppShell({
  children,
  onSignOut,
  headerNavigation,
  hideHeaderOnTv = false,
  mainClassName,
}: AppShellProps) {
  const deviceProfile = useDeviceProfile();
  const { isTv: legacyIsTv, isMobile } = useDeviceType();
  const isTabletPortraitTouch =
    deviceProfile.formFactor === 'tablet' &&
    deviceProfile.inputMode === 'touch' &&
    deviceProfile.viewportHeight >= deviceProfile.viewportWidth;
  const isTv =
    !isTabletPortraitTouch &&
    (deviceProfile.formFactor === 'tv' || legacyIsTv);
  const isTablet = deviceProfile.formFactor === 'tablet';
  const shouldShowHeader =
    !isTabletPortraitTouch && !(isTv && hideHeaderOnTv);
  const tvPlatform = isTv ? getTvPlatform() : undefined;

  return (
    <div
      className="xf-app min-h-screen"
      data-device-runtime={deviceProfile.runtime}
      data-device-form-factor={deviceProfile.formFactor}
      data-device-input={deviceProfile.inputMode}
      data-device-tv-platform={tvPlatform}
      data-viewport-width={deviceProfile.viewportWidth}
      data-viewport-height={deviceProfile.viewportHeight}
      data-device-pixel-ratio={deviceProfile.devicePixelRatio}
      data-player-strategy={deviceProfile.playerStrategy}
    >
      {isTv && <TvSidebar onSignOut={onSignOut} isTablet={isTablet} />}

      <div
        className={cn(
          'min-h-screen',
          isTv && (isTablet ? 'pl-[4.5rem]' : 'pl-0 md:pl-14'),
        )}
      >
        {shouldShowHeader ? (
          <AppHeader
            onSignOut={onSignOut}
            navigation={headerNavigation}
          />
        ) : null}

        <main
          data-xf-main-content="true"
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
