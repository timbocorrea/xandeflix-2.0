import type {
  ButtonHTMLAttributes,
  MouseEvent,
  ReactNode,
} from 'react';
import {
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';

import { cn } from '../../utils/cn';

type FocusScrollTarget = 'self' | 'closest-section' | string;

interface FocusableButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  focusKey: string;
  children: ReactNode;
  onEnterPress?: () => void;
  onArrowPress?: (direction: string) => boolean;
  focusScrollTarget?: FocusScrollTarget;
  focusScrollOptions?: ScrollIntoViewOptions;
}

const DEFAULT_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'smooth',
  block: 'nearest',
  inline: 'nearest',
};

const DPAD_DEBUG_ENABLED =
  (import.meta.env as Record<string, string | undefined>).VITE_SPATIAL_DEBUG ===
  'true';

function setCurrentSpatialFocusKey(focusKey: string) {
  (
    window as Window & {
      __XANDEFLIX_CURRENT_FOCUS_KEY?: string;
    }
  ).__XANDEFLIX_CURRENT_FOCUS_KEY = focusKey;
}

function logFocusableButtonDebug(
  eventName: string,
  payload: Record<string, unknown>,
) {
  if (!DPAD_DEBUG_ENABLED) {
    return;
  }

  if (import.meta.env.VITE_SPATIAL_DEBUG === 'true') console.error('XANDEFLIX_DPAD_TRACE [FocusableButton]', eventName, {
    pathname: window.location.pathname,
    ...payload,
  });
}

function resolveScrollTarget(
  element: HTMLElement | null,
  focusScrollTarget: FocusScrollTarget,
): HTMLElement | null {
  if (!element) {
    return null;
  }

  if (focusScrollTarget === 'self') {
    return element;
  }

  if (focusScrollTarget === 'closest-section') {
    const section = element.closest('section');
    return section instanceof HTMLElement ? section : element;
  }

  const customTarget = document.querySelector<HTMLElement>(focusScrollTarget);
  return customTarget ?? element;
}

export function FocusableButton({
  focusKey,
  children,
  className,
  onClick,
  onEnterPress,
  onArrowPress,
  focusScrollTarget = 'self',
  focusScrollOptions = DEFAULT_SCROLL_OPTIONS,
  ...props
}: FocusableButtonProps) {
  const { ref, focused } = useFocusable({
    focusKey,

    onArrowPress: (direction) => {
      logFocusableButtonDebug('arrow press', {
        focusKey,
        direction,
        focused,
      });

      if (onArrowPress) {
        return onArrowPress(direction);
      }

      return true;
    },

    onFocus: () => {
      setCurrentSpatialFocusKey(focusKey);
      logFocusableButtonDebug('focus', {
        focusKey,
        text: ref.current?.textContent?.trim().slice(0, 80) ?? null,
      });

      const scrollTarget = resolveScrollTarget(
        ref.current,
        focusScrollTarget,
      );

      scrollTarget?.scrollIntoView(focusScrollOptions);
    },

    onEnterPress: () => {
      logFocusableButtonDebug('enter press', {
        focusKey,
        text: ref.current?.textContent?.trim().slice(0, 80) ?? null,
      });

      if (onEnterPress) {
        onEnterPress();
        return;
      }

      if (onClick) {
        const virtualEvent = {
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        } as MouseEvent<HTMLButtonElement>;

        onClick(virtualEvent);
      }
    },
  });

  return (
    <button
      ref={ref}
      className={cn('tv-focusable', className)}
      type="button"
      data-focused={focused ? 'true' : undefined}
      data-nav-id={focusKey}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
