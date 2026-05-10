import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { FOCUS_KEYS, getMediaCardFocusKey } from './focusKeys';
import { getCategoryItemFocusKey } from './categoryFocusKeys';

export const HERO_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'auto',
  block: 'end',
  inline: 'nearest',
};

export const CARD_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'auto',
  block: 'nearest',
  inline: 'nearest',
};

export const NEAREST_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'auto',
  block: 'nearest',
  inline: 'nearest',
};

const FIRE_TV_FOCUS_RETRY_DELAYS = [120] as const;

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function getElementByFocusKey(focusKey: string): HTMLElement | null {
  if (!canUseDom()) {
    return null;
  }

  return document.querySelector<HTMLElement>(`[data-nav-id="${focusKey}"]`);
}

export function focusKeyExists(focusKey: string) {
  return Boolean(getElementByFocusKey(focusKey));
}

export function scrollFocusKeyIntoView(
  focusKey: string,
  options: ScrollIntoViewOptions = CARD_SCROLL_OPTIONS,
) {
  const element = getElementByFocusKey(focusKey);
  element?.scrollIntoView(options);
}

function getFirstExistingFocusKey(focusKeys: string[]) {
  return focusKeys.find((focusKey) => focusKeyExists(focusKey)) ?? focusKeys[0];
}

export function setFocusAndScroll({
  focusKey,
  scrollTargetFocusKey = focusKey,
  scrollOptions = CARD_SCROLL_OPTIONS,
}: {
  focusKey: string;
  scrollTargetFocusKey?: string;
  scrollOptions?: ScrollIntoViewOptions;
}) {
  setFocus(focusKey);

  if (!canUseDom()) {
    return false;
  }

  window.requestAnimationFrame(() => {
    scrollFocusKeyIntoView(scrollTargetFocusKey, scrollOptions);
  });

  return false;
}

function forceWindowTop() {
  if (!canUseDom()) {
    return;
  }

  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'smooth',
  });
}

function setFocusWithFireTvRetry(focusKey: string) {
  setFocus(focusKey);

  if (!canUseDom()) {
    return false;
  }

  window.requestAnimationFrame(() => {
    scrollFocusKeyIntoView(focusKey, NEAREST_SCROLL_OPTIONS);
  });

  FIRE_TV_FOCUS_RETRY_DELAYS.forEach((delay) => {
    window.setTimeout(() => {
      setFocus(focusKey);
      scrollFocusKeyIntoView(focusKey, NEAREST_SCROLL_OPTIONS);
    }, delay);
  });

  return false;
}

export function focusHeaderWithFallback(focusKeys: string[]) {
  const targetFocusKey = getFirstExistingFocusKey(focusKeys);

  spatialDebug('header', 'Focus header with fallback', {
    targetFocusKey,
    candidates: focusKeys,
  });

  forceWindowTop();

  window.requestAnimationFrame(() => {
    scrollFocusKeyIntoView(
      FOCUS_KEYS.HEADER_ACTIONS_SECTION,
      NEAREST_SCROLL_OPTIONS,
    );
  });

  return setFocusWithFireTvRetry(targetFocusKey);
}

export function focusHeroPlayButton() {
  return setFocusAndScroll({
    focusKey: FOCUS_KEYS.HERO_PLAY_BUTTON,
    scrollTargetFocusKey: FOCUS_KEYS.CATALOG_HERO_SECTION,
    scrollOptions: HERO_SCROLL_OPTIONS,
  });
}

export function focusHeroInfoButton() {
  return setFocusAndScroll({
    focusKey: FOCUS_KEYS.HERO_INFO_BUTTON,
    scrollTargetFocusKey: FOCUS_KEYS.CATALOG_HERO_SECTION,
    scrollOptions: HERO_SCROLL_OPTIONS,
  });
}

export function focusFirstMediaCard() {
  return setFocusAndScroll({
    focusKey: FOCUS_KEYS.FIRST_MEDIA_CARD,
    scrollOptions: CARD_SCROLL_OPTIONS,
  });
}

export function focusMediaCardByIndex(index: number) {
  const focusKey = getMediaCardFocusKey(index);

  return setFocusAndScroll({
    focusKey,
    scrollOptions: CARD_SCROLL_OPTIONS,
  });
}

export function focusCategoryItem({
  categoryId,
  itemIndex,
}: {
  categoryId: string;
  itemIndex: number;
}) {
  const focusKey = getCategoryItemFocusKey(categoryId, itemIndex);

  return setFocusAndScroll({
    focusKey,
    scrollOptions: CARD_SCROLL_OPTIONS,
  });
}

export function focusHeaderSearchButton() {
  return focusHeaderWithFallback([
    FOCUS_KEYS.HEADER_SEARCH_BUTTON,
    FOCUS_KEYS.HEADER_LOGOUT_BUTTON,
    FOCUS_KEYS.SIDEBAR_SEARCH,
  ]);
}

export function focusHeaderProfileButton() {
  return focusHeaderWithFallback([
    FOCUS_KEYS.HEADER_PROFILE_BUTTON,
    FOCUS_KEYS.HEADER_LOGOUT_BUTTON,
    FOCUS_KEYS.SIDEBAR_PROFILE,
  ]);
}

export function focusHeaderLogoutButton() {
  return focusHeaderWithFallback([
    FOCUS_KEYS.HEADER_LOGOUT_BUTTON,
    FOCUS_KEYS.HEADER_PROFILE_BUTTON,
    FOCUS_KEYS.HEADER_SEARCH_BUTTON,
    FOCUS_KEYS.SIDEBAR_LOGOUT,
  ]);
}

export function focusSidebarSearch() {
  setFocus(FOCUS_KEYS.SIDEBAR_SEARCH);
  return false;
}
