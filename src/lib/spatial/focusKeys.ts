export const FOCUS_KEYS = {
  LOGIN_SECTION: 'login-section',
  LOGIN_EMAIL_INPUT: 'login-email-input',
  LOGIN_PASSWORD_INPUT: 'login-password-input',
  LOGIN_SUBMIT_BUTTON: 'login-submit-button',
  LOGIN_TEST_BUTTON: 'login-test-button',

  HEADER_ACTIONS_SECTION: 'header-actions-section',
  HEADER_SEARCH_BUTTON: 'header-search-button',
  HEADER_PROFILE_BUTTON: 'header-profile-button',
  HEADER_LOGOUT_BUTTON: 'header-logout-button',

  CATALOG_HERO_SECTION: 'catalog-hero-section',
  HERO_PLAY_BUTTON: 'hero-play-button',
  HERO_INFO_BUTTON: 'hero-info-button',

  CONTINUE_WATCHING_SECTION: 'catalog-section-continue-watching',
  

  LIVE_CHANNELS_SECTION: 'catalog-section-live-channels',

  FIRST_MEDIA_CARD: 'catalog-section-continue-watching-item-0',

  SIDEBAR_SECTION: 'sidebar-section',
  SIDEBAR_PROFILE: 'sidebar-profile',
  SIDEBAR_HOME: 'sidebar-home',
  SIDEBAR_SEARCH: 'sidebar-search',
  SIDEBAR_LOGOUT: 'sidebar-logout',

  MOBILE_BOTTOM_NAV_SECTION: 'mobile-bottom-nav-section',
  MOBILE_HOME: 'mobile-home',
} as const;

export type FocusKey = (typeof FOCUS_KEYS)[keyof typeof FOCUS_KEYS];

export const ROUTE_FOCUS_RETRY_DELAYS_MS = [80, 180, 350, 700, 1200] as const;

export function getMediaCardFocusKey(index: number) {
  return `media-card-${index + 1}`;
}
