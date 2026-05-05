// src/features/tv-focus/focusRegistry.ts

import { useCallback, type MutableRefObject, type RefCallback } from 'react';

type FocusKey = string;

const mountedTargets = new Map<FocusKey, HTMLElement>();
const knownTargets = new Set<FocusKey>();

function assignRef<T>(
  ref: MutableRefObject<T | null> | RefCallback<T> | undefined,
  value: T | null,
) {
  if (!ref) return;

  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  ref.current = value;
}

export function getFocusableElement(focusKey: FocusKey): HTMLElement | null {
  if (!focusKey) return null;
  if (typeof document === 'undefined') return null;

  return document.querySelector<HTMLElement>(
    `[data-nav-id="${focusKey}"], [data-focus-key="${focusKey}"], [data-xf-focus-key="${focusKey}"]`,
  );
}

export function registerFocusTarget(focusKey: FocusKey, element: HTMLElement) {
  if (!focusKey || !element) return;

  knownTargets.add(focusKey);
  mountedTargets.set(focusKey, element);

  element.setAttribute('data-xf-focus-key', focusKey);
}

export function unregisterFocusTarget(
  focusKey: FocusKey,
  element?: HTMLElement | null,
) {
  if (!focusKey) return;

  const current = mountedTargets.get(focusKey);

  if (!element || current === element) {
    mountedTargets.delete(focusKey);
  }
}

export function wasFocusTargetKnown(focusKey: FocusKey) {
  if (knownTargets.has(focusKey)) return true;

  return Boolean(getFocusableElement(focusKey));
}

export function isFocusTargetMounted(focusKey: FocusKey | null | undefined) {
  if (!focusKey) return false;
  if (typeof document === 'undefined') return false;

  const registeredElement = mountedTargets.get(focusKey);

  if (registeredElement && document.contains(registeredElement)) {
    return true;
  }

  const domElement = getFocusableElement(focusKey);

  return Boolean(domElement && document.contains(domElement));
}

export function getFirstMountedFocusTarget(fallbacks: string[]) {
  return fallbacks.find((focusKey) => isFocusTargetMounted(focusKey));
}

export function useRegisteredFocusableRef<T extends HTMLElement>(
  focusKey: string,
  spatialRef?: MutableRefObject<T | null> | RefCallback<T>,
) {
  return useCallback(
    (node: T | null) => {
      assignRef(spatialRef, node);

      if (node) {
        registerFocusTarget(focusKey, node);
        return;
      }

      unregisterFocusTarget(focusKey);
    },
    [focusKey, spatialRef],
  );
}