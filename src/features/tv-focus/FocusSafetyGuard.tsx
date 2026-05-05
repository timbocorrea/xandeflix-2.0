// src/features/tv-focus/FocusSafetyGuard.tsx

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation';

import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { getFocusFallbacksForPathname } from './focusKeys';
import {
  getFirstMountedFocusTarget,
  isFocusTargetMounted,
  wasFocusTargetKnown,
} from './focusRegistry';

type FocusSafetyGuardProps = {
  children: ReactNode;
  enabled?: boolean;
  fallbacks?: string[];
};

const RESTORE_DELAY_MS = 90;
const VERIFY_DELAY_MS = 90;
const RESTORE_COOLDOWN_MS = 500;
const MAX_ATTEMPTS = 4;

const KEYS_THAT_MAY_CHANGE_FOCUS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'Backspace',
  'Escape',
]);

function safeGetCurrentFocusKey(): string | null {
  try {
    return getCurrentFocusKey() ?? null;
  } catch (error) {
    spatialDebug('focus-recovery', 'getCurrentFocusKey failed', {
      error,
    });

    return null;
  }
}

function isPossiblyLostFocus() {
  const currentFocusKey = safeGetCurrentFocusKey();

  if (!currentFocusKey) {
    return true;
  }

  const wasKnown = wasFocusTargetKnown(currentFocusKey);

  if (wasKnown && !isFocusTargetMounted(currentFocusKey)) {
    return true;
  }

  return false;
}

export function FocusSafetyGuard({
  children,
  enabled = true,
  fallbacks,
}: FocusSafetyGuardProps) {
  const location = useLocation();

  const fallbackList = useMemo(
    () => fallbacks?.filter(Boolean) ?? getFocusFallbacksForPathname(location.pathname),
    [fallbacks, location.pathname],
  );

  const pendingTimerRef = useRef<number | null>(null);
  const restoringRef = useRef(false);
  const lastRestoreAtRef = useRef(0);

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current === null) return;

    window.clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = null;
  }, []);

  const restoreFocus = useCallback(
    (reason: string) => {
      if (!enabled) return;
      if (typeof window === 'undefined') return;
      if (restoringRef.current) return;

      const now = Date.now();

      if (now - lastRestoreAtRef.current < RESTORE_COOLDOWN_MS) {
        return;
      }

      if (!isPossiblyLostFocus()) {
        return;
      }

      restoringRef.current = true;
      lastRestoreAtRef.current = now;

      const firstMountedFallback = getFirstMountedFocusTarget(fallbackList);

      const candidates = [
        ...(firstMountedFallback ? [firstMountedFallback] : []),
        ...fallbackList.filter((focusKey) => focusKey !== firstMountedFallback),
      ];

      if (candidates.length === 0) {
        restoringRef.current = false;
        return;
      }

      let attempt = 0;

      spatialDebug('focus-recovery', 'starting recovery', {
        reason,
        pathname: location.pathname,
        currentFocusKey: safeGetCurrentFocusKey() ?? 'NONE',
        candidates,
      });

      const tryNextCandidate = () => {
        if (attempt >= MAX_ATTEMPTS || attempt >= candidates.length) {
          restoringRef.current = false;

          spatialDebug('focus-recovery', 'recovery stopped without confirmation', {
            reason,
            pathname: location.pathname,
            currentFocusKey: safeGetCurrentFocusKey() ?? 'NONE',
          });

          return;
        }

        const targetFocusKey = candidates[attempt];
        attempt += 1;

        if (!targetFocusKey) {
          tryNextCandidate();
          return;
        }

        spatialDebug('focus-recovery', 'trying recovery target', {
          reason,
          pathname: location.pathname,
          targetFocusKey,
          attempt,
        });

        try {
          setFocus(targetFocusKey);
        } catch (error) {
          spatialDebug('focus-recovery', 'setFocus failed', {
            targetFocusKey,
            error,
          });
        }

        window.setTimeout(() => {
          const currentFocusKey = safeGetCurrentFocusKey();

          if (currentFocusKey && !isPossiblyLostFocus()) {
            restoringRef.current = false;

            spatialDebug('focus-recovery', 'focus recovered', {
              reason,
              pathname: location.pathname,
              currentFocusKey,
            });

            return;
          }

          tryNextCandidate();
        }, VERIFY_DELAY_MS);
      };

      tryNextCandidate();
    },
    [enabled, fallbackList, location.pathname],
  );

  const scheduleRestore = useCallback(
    (reason: string) => {
      if (!enabled) return;
      if (typeof window === 'undefined') return;

      clearPendingTimer();

      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        restoreFocus(reason);
      }, RESTORE_DELAY_MS);
    },
    [clearPendingTimer, enabled, restoreFocus],
  );

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!KEYS_THAT_MAY_CHANGE_FOCUS.has(event.key)) return;

      scheduleRestore(`keydown:${event.key}`);
    };

    const handleWindowFocus = () => {
      scheduleRestore('window-focus');
    };

    const handlePageShow = () => {
      scheduleRestore('page-show');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleRestore('visibility-visible');
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    scheduleRestore('mount-or-route-change');

    return () => {
      clearPendingTimer();

      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearPendingTimer, enabled, scheduleRestore]);

  return <>{children}</>;
}