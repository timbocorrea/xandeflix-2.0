// src/features/tv-focus/focusKeys.ts

import { FOCUS_KEYS as SPATIAL_FOCUS_KEYS } from '@/lib/spatial/focusKeys';
import { getFirstMountedCatalogItemFocusKey } from '@/lib/spatial/focusNavigation';

export const FOCUS_KEYS = {
  LOGIN_TEST: SPATIAL_FOCUS_KEYS.LOGIN_TEST_BUTTON,
  LOGIN_SUBMIT: SPATIAL_FOCUS_KEYS.LOGIN_SUBMIT_BUTTON,
  LOGIN_EMAIL: SPATIAL_FOCUS_KEYS.LOGIN_EMAIL_INPUT,
  LOGIN_PASSWORD: SPATIAL_FOCUS_KEYS.LOGIN_PASSWORD_INPUT,

  HEADER_SEARCH: SPATIAL_FOCUS_KEYS.HEADER_SEARCH_BUTTON,
  HEADER_PROFILE: SPATIAL_FOCUS_KEYS.HEADER_PROFILE_BUTTON,
  HEADER_LOGOUT: SPATIAL_FOCUS_KEYS.HEADER_LOGOUT_BUTTON,

  CATALOG_HERO: SPATIAL_FOCUS_KEYS.CATALOG_HERO_SECTION,
  HERO_PLAY: SPATIAL_FOCUS_KEYS.HERO_PLAY_BUTTON,
  HERO_INFO: SPATIAL_FOCUS_KEYS.HERO_INFO_BUTTON,

  FIRST_MEDIA_CARD: SPATIAL_FOCUS_KEYS.FIRST_MEDIA_CARD,

  SIDEBAR_HOME: SPATIAL_FOCUS_KEYS.SIDEBAR_HOME,
  SIDEBAR_SEARCH: SPATIAL_FOCUS_KEYS.SIDEBAR_SEARCH,

  MOBILE_HOME: SPATIAL_FOCUS_KEYS.MOBILE_HOME,

  PLAYER_BACK: 'player-back-button',
  PLAYER_PLAY: 'player-play-button',
} as const;

export type FocusKey = (typeof FOCUS_KEYS)[keyof typeof FOCUS_KEYS];

export const LOGIN_FOCUS_FALLBACKS: string[] = [
  FOCUS_KEYS.LOGIN_TEST,
  FOCUS_KEYS.LOGIN_SUBMIT,
  FOCUS_KEYS.LOGIN_EMAIL,
  FOCUS_KEYS.LOGIN_PASSWORD,
];

export const CATALOG_FOCUS_FALLBACKS: string[] = [
  FOCUS_KEYS.HERO_PLAY,
  FOCUS_KEYS.HERO_INFO,
  FOCUS_KEYS.FIRST_MEDIA_CARD,
  FOCUS_KEYS.SIDEBAR_HOME,
  FOCUS_KEYS.HEADER_SEARCH,
  FOCUS_KEYS.MOBILE_HOME,
];

export const PLAYER_FOCUS_FALLBACKS: string[] = [
  FOCUS_KEYS.PLAYER_BACK,
  FOCUS_KEYS.PLAYER_PLAY,
  FOCUS_KEYS.HERO_PLAY,
  FOCUS_KEYS.SIDEBAR_HOME,
];

export const DIRECT_SOURCE_FOCUS_FALLBACKS: string[] = [
  'direct-source-url-input',
  'direct-source-load-button',
  'direct-source-clear-button',
  'direct-source-player-button',
  'direct-source-channel-0',
  FOCUS_KEYS.SIDEBAR_HOME,
];

export const LIVE_FOCUS_FALLBACKS: string[] = [
  'live-group-0',
  'live-channel-0',
  'sidebar-channels',
  FOCUS_KEYS.SIDEBAR_HOME,
];

export const SETTINGS_FOCUS_FALLBACKS: string[] = [
  'settings-device-id-card',
  'settings-license-code-input',
  'settings-activate-license-button',
  'settings-source-url-input',
  'sidebar-settings',
  FOCUS_KEYS.SIDEBAR_HOME,
];

export function getFocusFallbacksForPathname(pathname: string): string[] {
  if (pathname === '/login') {
    return LOGIN_FOCUS_FALLBACKS;
  }

  if (pathname === '/') {
    const firstCatalogFocusKey = getFirstMountedCatalogItemFocusKey();

    return [
      FOCUS_KEYS.HERO_PLAY,
      FOCUS_KEYS.HERO_INFO,
      ...(firstCatalogFocusKey ? [firstCatalogFocusKey] : []),
      FOCUS_KEYS.SIDEBAR_HOME,
      FOCUS_KEYS.HEADER_SEARCH,
      FOCUS_KEYS.MOBILE_HOME,
    ];
  }

  if (pathname.startsWith('/player')) {
    return PLAYER_FOCUS_FALLBACKS;
  }

  if (pathname.startsWith('/live')) {
    return LIVE_FOCUS_FALLBACKS;
  }

  if (pathname.startsWith('/settings')) {
    return SETTINGS_FOCUS_FALLBACKS;
  }

  if (pathname.startsWith('/playlists/direct-source')) {
    return DIRECT_SOURCE_FOCUS_FALLBACKS;
  }

  return CATALOG_FOCUS_FALLBACKS;
}
