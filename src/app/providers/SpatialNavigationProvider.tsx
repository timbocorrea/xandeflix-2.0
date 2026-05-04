import { ENABLE_SPATIAL_DEBUG, spatialDebug } from '@/lib/spatial/spatialDebug';
import { useEffect, type ReactNode } from 'react';
import {
  getCurrentFocusKey,
  init,
  setKeyMap,
} from '@noriginmedia/norigin-spatial-navigation';

interface SpatialNavigationProviderProps {
  children: ReactNode;
}



const SPATIAL_KEY_NAMES = new Set([
  'ArrowLeft',
  'ArrowUp',
  'ArrowRight',
  'ArrowDown',
  'Enter',
]);

const SPATIAL_KEY_CODES = new Set([
  13,
  19,
  20,
  21,
  22,
  23,
  37,
  38,
  39,
  40,
  66,
]);

function isSpatialNavigationKey(event: KeyboardEvent): boolean {
  return (
    SPATIAL_KEY_NAMES.has(event.key) ||
    SPATIAL_KEY_CODES.has(event.keyCode) ||
    SPATIAL_KEY_CODES.has(event.which)
  );
}

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable
  );
}

function blurNativeFocusedButtonIfNeeded() {
  const activeElement = document.activeElement;

  if (
    activeElement instanceof HTMLElement &&
    !isEditableElement(activeElement) &&
    activeElement.dataset.navId
  ) {
    activeElement.blur();
  }
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
      left: [37, 21],
      up: [38, 19],
      right: [39, 22],
      down: [40, 20],
      enter: [13, 23, 66],
    });

    if (ENABLE_SPATIAL_DEBUG) {
      spatialDebug('provider', 'Norigin initialized');
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSpatialNavigationKey(event)) {
        return;
      }

      const activeElement = document.activeElement;
      const currentFocusKey = getCurrentFocusKey();

      if (!isEditableElement(activeElement)) {
        event.preventDefault();
        blurNativeFocusedButtonIfNeeded();
      }

      if (ENABLE_SPATIAL_DEBUG) {
        spatialDebug('provider', 'KeyDown', {
          key: event.key,
          keyCode: event.keyCode,
          which: event.which,
          currentFocusKey: currentFocusKey || 'NONE',
          activeElement: activeElement?.tagName || 'NONE',
          activeNavId:
            activeElement instanceof HTMLElement
              ? activeElement.dataset.navId || 'NONE'
              : 'NONE',
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);


  return children;
}