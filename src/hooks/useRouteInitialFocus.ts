import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation';

import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { getFirstMountedCatalogItemFocusKey } from '@/lib/spatial/focusNavigation';

type RouteName = 'login' | 'catalog' | 'live' | 'settings' | 'unknown';

type RouteInitialFocusConfig = {
  routeName: RouteName;
  candidates: string[];
};

const RETRY_DELAYS = [0, 100, 200, 350, 700, 1200];
const VERIFY_FOCUS_DELAY = 50;

function getRouteInitialFocusConfig(pathname: string): RouteInitialFocusConfig {
  if (pathname === '/login') {
    return {
      routeName: 'login',
      candidates: [
        'login-test-button',
        'login-submit-button',
        'login-email-input',
        'login-password-input',
      ],
    };
  }

  if (pathname === '/') {
    const firstCatalogFocusKey = getFirstMountedCatalogItemFocusKey();

    return {
      routeName: 'catalog',
      candidates: [
        'hero-play-button',
        'hero-info-button',
        ...(firstCatalogFocusKey ? [firstCatalogFocusKey] : []),
        'sidebar-home',
        'mobile-home',
      ],
    };
  }

  if (pathname.startsWith('/live')) {
    return {
      routeName: 'live',
      candidates: [
        'live-group-0',
        'live-channel-0',
        'sidebar-channels',
        'sidebar-home',
      ],
    };
  }

  if (pathname.startsWith('/settings')) {
    return {
      routeName: 'settings',
      candidates: [
        'settings-device-id-card',
        'settings-license-code-input',
        'settings-activate-license-button',
        'settings-source-url-input',
        'sidebar-settings',
        'sidebar-home',
      ],
    };
  }

  return {
    routeName: 'unknown',
    candidates: [],
  };
}

function getFocusableElement(focusKey: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-nav-id="${focusKey}"], [data-focus-key="${focusKey}"]`,
  );
}

function getFirstAvailableFocusKey(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const element = getFocusableElement(candidate);

    if (element) {
      return candidate;
    }
  }

  return null;
}

function isCurrentFocusStillMounted(
  currentFocusKey: string | null | undefined,
): boolean {
  if (!currentFocusKey) return false;

  return Boolean(getFocusableElement(currentFocusKey));
}

function isFocusKeyRouteCandidate(
  focusKey: string | null | undefined,
  candidates: string[],
): focusKey is string {
  if (!focusKey) return false;

  return candidates.includes(focusKey);
}

export function useRouteInitialFocus() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname;
    const { routeName, candidates } = getRouteInitialFocusConfig(pathname);

    if (candidates.length === 0) {
      spatialDebug('route-focus', 'No route initial focus config', {
        pathname,
        routeName,
      });

      return;
    }

    let cancelled = false;
    let focusConfirmed = false;

    const timeoutIds: number[] = [];
    const verificationTimeoutIds: number[] = [];

    RETRY_DELAYS.forEach((delay, attempt) => {
      const timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        if (focusConfirmed) return;

        const currentFocusKey = getCurrentFocusKey();
        const currentFocusStillExists =
          isCurrentFocusStillMounted(currentFocusKey);

          if (
            currentFocusStillExists &&
            isFocusKeyRouteCandidate(currentFocusKey, candidates)
          ) {
            focusConfirmed = true;

            spatialDebug('route-focus', 'Focus already valid', {
              pathname,
              routeName,
              currentFocusKey,
              currentFocusStillExists,
            });

            return;
          }

        const targetFocusKey =
          getFirstAvailableFocusKey(candidates) ?? candidates[0] ?? null;

        spatialDebug('route-focus', `Attempt ${attempt}`, {
          pathname,
          routeName,
          currentFocusKey: currentFocusKey ?? 'NONE',
          currentFocusStillExists,
          targetFocusKey: targetFocusKey ?? 'NONE',
          candidates,
        });

        if (!targetFocusKey) return;

        setFocus(targetFocusKey);

        const verificationTimeoutId = window.setTimeout(() => {
          if (cancelled) return;
          if (focusConfirmed) return;

          const confirmedFocusKey = getCurrentFocusKey();
          const confirmed = confirmedFocusKey === targetFocusKey;

          if (confirmed) {
            focusConfirmed = true;

            spatialDebug('route-focus', 'Focus confirmed', {
              pathname,
              targetFocusKey,
              confirmedFocusKey,
            });

            return;
          }

          spatialDebug('route-focus', 'Focus not confirmed yet', {
            pathname,
            targetFocusKey,
            confirmedFocusKey: confirmedFocusKey ?? 'NONE',
          });
        }, VERIFY_FOCUS_DELAY);

        verificationTimeoutIds.push(verificationTimeoutId);
      }, delay);

      timeoutIds.push(timeoutId);
    });

    return () => {
      cancelled = true;

      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });

      verificationTimeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, [location.pathname]);
}
