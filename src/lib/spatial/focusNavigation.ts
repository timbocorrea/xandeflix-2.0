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

function getFirstExistingFocusKey(
  focusKeys: Array<string | null | undefined>,
) {
  const normalizedFocusKeys = focusKeys.filter(
    (focusKey): focusKey is string => Boolean(focusKey),
  );

  if (normalizedFocusKeys.length === 0) {
    return null;
  }

  return (
    normalizedFocusKeys.find((focusKey) => focusKeyExists(focusKey)) ??
    normalizedFocusKeys[0]
  );
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

export function getFirstMountedCatalogItemFocusKey() {
  if (!canUseDom()) {
    return null;
  }

  const firstCatalogItem = document.querySelector<HTMLElement>(
    '[data-nav-id^="catalog-section-"][data-nav-id*="-item-"]',
  );

  return firstCatalogItem?.dataset.navId ?? null;
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

  if (!targetFocusKey) {
    return false;
  }

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
  const firstCatalogItemFocusKey =
    getFirstMountedCatalogItemFocusKey() ?? FOCUS_KEYS.FIRST_MEDIA_CARD;

  return setFocusAndScroll({
    focusKey: firstCatalogItemFocusKey,
    scrollOptions: CARD_SCROLL_OPTIONS,
  });
}

export function focusCatalogEntryPoint() {
  if (!canUseDom()) {
    return false;
  }

  const lastCatalogFocusKey = (
    window as Window & {
      __XANDEFLIX_LAST_CATALOG_FOCUS_KEY?: string;
    }
  ).__XANDEFLIX_LAST_CATALOG_FOCUS_KEY;

  const targetFocusKey = getFirstExistingFocusKey([
    lastCatalogFocusKey,
    FOCUS_KEYS.HERO_PLAY_BUTTON,
    getFirstMountedCatalogItemFocusKey(),
    FOCUS_KEYS.SIDEBAR_HOME,
  ]);

  if (!targetFocusKey) {
    return false;
  }

  const scrollTargetFocusKey =
    targetFocusKey === FOCUS_KEYS.HERO_PLAY_BUTTON
      ? FOCUS_KEYS.CATALOG_HERO_SECTION
      : targetFocusKey;

  return setFocusAndScroll({
    focusKey: targetFocusKey,
    scrollTargetFocusKey,
    scrollOptions:
      scrollTargetFocusKey === FOCUS_KEYS.CATALOG_HERO_SECTION
        ? HERO_SCROLL_OPTIONS
        : CARD_SCROLL_OPTIONS,
  });
}

export function focusLiveEntryPoint() {
  const targetFocusKey = getFirstExistingFocusKey([
    'live-group-0',
    'live-channel-0',
    'sidebar-channels',
    FOCUS_KEYS.SIDEBAR_HOME,
  ]);

  if (!targetFocusKey) {
    return false;
  }

  return setFocusWithFireTvRetry(targetFocusKey);
}

export function focusSettingsEntryPoint() {
  const targetFocusKey = getFirstExistingFocusKey([
    'settings-device-id-card',
    'settings-license-code-input',
    'settings-activate-license-button',
    'settings-source-url-input',
    'sidebar-settings',
    FOCUS_KEYS.SIDEBAR_HOME,
  ]);

  if (!targetFocusKey) {
    return false;
  }

  return setFocusWithFireTvRetry(targetFocusKey);
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


export function rememberLastCatalogFocusKey(focusKey: string) {
  if (!canUseDom()) {
    return;
  }

  (
    window as Window & {
      __XANDEFLIX_LAST_CATALOG_FOCUS_KEY?: string;
    }
  ).__XANDEFLIX_LAST_CATALOG_FOCUS_KEY = focusKey;
}

export function focusLastCatalogItem() {
  if (!canUseDom()) {
    return false;
  }

  const lastCatalogFocusKey = (
    window as Window & {
      __XANDEFLIX_LAST_CATALOG_FOCUS_KEY?: string;
    }
  ).__XANDEFLIX_LAST_CATALOG_FOCUS_KEY;

  if (lastCatalogFocusKey && focusKeyExists(lastCatalogFocusKey)) {
    return setFocusAndScroll({
      focusKey: lastCatalogFocusKey,
      scrollOptions: CARD_SCROLL_OPTIONS,
    });
  }

  return focusCatalogEntryPoint();
}
