import { setFocus } from '@noriginmedia/norigin-spatial-navigation';

import { FOCUS_KEYS, getMediaCardFocusKey } from './focusKeys';

export const HERO_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'smooth',
  block: 'start',
  inline: 'nearest',
};

export const CARD_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'smooth',
  block: 'center',
  inline: 'nearest',
};

export const NEAREST_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'smooth',
  block: 'nearest',
  inline: 'nearest',
};

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function getElementByFocusKey(focusKey: string): HTMLElement | null {
  if (!canUseDom()) {
    return null;
  }

  return document.querySelector<HTMLElement>(`[data-nav-id="${focusKey}"]`);
}

export function scrollFocusKeyIntoView(
  focusKey: string,
  options: ScrollIntoViewOptions = CARD_SCROLL_OPTIONS,
) {
  const element = getElementByFocusKey(focusKey);
  element?.scrollIntoView(options);
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

export function focusHeaderSearchButton() {
  setFocus(FOCUS_KEYS.HEADER_SEARCH_BUTTON);
  return false;
}

export function focusHeaderProfileButton() {
  setFocus(FOCUS_KEYS.HEADER_PROFILE_BUTTON);
  return false;
}

export function focusSidebarSearch() {
  setFocus(FOCUS_KEYS.SIDEBAR_SEARCH);
  return false;
}

export function focusContinueWatchingCardAbove({
  liveChannelIndex,
  columnsPerRow,
  continueWatchingItemsLength,
}: {
  liveChannelIndex: number;
  columnsPerRow: number;
  continueWatchingItemsLength: number;
}) {
  const continueRows = Math.ceil(continueWatchingItemsLength / columnsPerRow);
  const lastContinueRowStartIndex = (continueRows - 1) * columnsPerRow;
  const columnIndex = liveChannelIndex % columnsPerRow;

  const targetIndex = Math.min(
    lastContinueRowStartIndex + columnIndex,
    continueWatchingItemsLength - 1,
  );

  console.log('[Xandeflix ManualNav] LiveChannels ArrowUp', {
    liveChannelIndex,
    columnsPerRow,
    continueWatchingItemsLength,
    targetIndex,
    targetFocusKey: getMediaCardFocusKey(targetIndex),
  });

  return focusMediaCardByIndex(targetIndex);
}

export function focusLastContinueWatchingRow({
  columnsPerRow,
  continueWatchingItemsLength,
}: {
  columnsPerRow: number;
  continueWatchingItemsLength: number;
}) {
  const fallbackTargetIndex = Math.max(
    continueWatchingItemsLength - columnsPerRow,
    0,
  );

  return focusMediaCardByIndex(fallbackTargetIndex);
}