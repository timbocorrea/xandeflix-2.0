import { ENABLE_SPATIAL_DEBUG, spatialDebug } from '@/lib/spatial/spatialDebug';
import { useEffect, type ReactNode } from 'react';

import { FocusSafetyGuard } from '@/features/tv-focus';

import {
  getCurrentFocusKey,
  init,
  setFocus,
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

const INITIAL_FOCUS_SELECTORS = [
  '[data-nav-id="hero-play-button"]',
  '[data-nav-id="hero-info-button"]',
  '[data-nav-id^="catalog-section-"][data-nav-id*="-item-"]',
  '[data-nav-id="live-group-0"]',
  '[data-nav-id="live-channel-0"]',
  '[data-nav-id="settings-device-id-card"]',
  '[data-nav-id="sidebar-home"]',
  '[data-nav-id="mobile-home"]',
] as const;

function getFirstAvailableSpatialFocusKey(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const activeElement = document.activeElement;

  if (
    activeElement instanceof HTMLElement &&
    !isEditableElement(activeElement) &&
    activeElement.dataset.navId
  ) {
    return activeElement.dataset.navId;
  }

  for (const selector of INITIAL_FOCUS_SELECTORS) {
    const element = document.querySelector<HTMLElement>(selector);

    if (element?.dataset.navId) {
      return element.dataset.navId;
    }
  }

  return null;
}

function seedSpatialFocusIfNeeded() {
  const targetFocusKey = getFirstAvailableSpatialFocusKey();

  if (!targetFocusKey) {
    return null;
  }

  setFocus(targetFocusKey);

  window.requestAnimationFrame(() => {
    setFocus(targetFocusKey);
  });

  return targetFocusKey;
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

      if (!currentFocusKey) {
        const seededFocusKey = seedSpatialFocusIfNeeded();

        if (ENABLE_SPATIAL_DEBUG) {
          spatialDebug('provider', 'Seed focus before spatial key handling', {
            key: event.key,
            keyCode: event.keyCode,
            which: event.which,
            seededFocusKey: seededFocusKey || 'NONE',
            activeElement: activeElement?.tagName || 'NONE',
            activeNavId:
              activeElement instanceof HTMLElement
                ? activeElement.dataset.navId || 'NONE'
                : 'NONE',
          });
        }

        return;
      }

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


    return (
    <FocusSafetyGuard>
      {children}
    </FocusSafetyGuard>
  );
}