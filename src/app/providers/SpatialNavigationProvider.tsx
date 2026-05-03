import { useEffect, type ReactNode } from 'react';
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
      throttle: 80,
      throttleKeypresses: true,
    });

    setKeyMap({
      left: [37],
      up: [38],
      right: [39],
      down: [40],
      enter: [13],
    });
  }, []);

  return children;
}