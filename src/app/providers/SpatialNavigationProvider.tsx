import { useEffect, type ReactNode } from 'react';
import { FocusSafetyGuard } from '@/features/tv-focus';
import {
  init,
  setKeyMap,
} from '@noriginmedia/norigin-spatial-navigation';

interface SpatialNavigationProviderProps {
  children: ReactNode;
}

export function SpatialNavigationProvider({
  children,
}: SpatialNavigationProviderProps) {
  useEffect(() => {
    init({
      debug: false,
      visualDebug: false,
      nativeMode: false,
      throttle: 0,
      throttleKeypresses: false,
    });

    setKeyMap({
      left: [37, 21, 'ArrowLeft'],
      up: [38, 19, 'ArrowUp'],
      right: [39, 22, 'ArrowRight'],
      down: [40, 20, 'ArrowDown'],
      enter: [13, 23, 66, 'Enter'],
    });
  }, []);

  return (
    <FocusSafetyGuard>
      {children}
    </FocusSafetyGuard>
  );
}
