export type DiscoveryPerformanceMark =
  | 'app_start'
  | 'license_valid'
  | 'local_catalog_ready'
  | 'discovery_snapshot_ready'
  | 'home_shell_render'
  | 'first_card_content'
  | 'first_card_image_paint'
  | 'home_first_card_image_paint'
  | 'movies_first_card_image_paint'
  | 'series_first_card_image_paint'
  | 'hero_content_paint'
  | 'hero_image_paint'
  | 'hero_remote_image_paint'
  | 'movies_hero_content_paint'
  | 'movies_hero_image_paint'
  | 'movies_hero_remote_image_paint'
  | 'series_hero_content_paint'
  | 'series_hero_image_paint'
  | 'series_hero_remote_image_paint'
  | 'source_refresh_start'
  | 'source_refresh_end';

const markedAt = new Map<DiscoveryPerformanceMark, number>();

function metricNow() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function logHeroDelta(
  heroMark: DiscoveryPerformanceMark,
  metricName: string,
  firstCardMark: DiscoveryPerformanceMark,
) {
  const heroAt = markedAt.get(heroMark);
  const firstCardAt = markedAt.get(firstCardMark);

  if (heroAt === undefined || firstCardAt === undefined) {
    return;
  }

  console.info('[XANDEFLIX_DISCOVERY_PERF_METRIC]', {
    metric: metricName,
    valueMs: Math.round(heroAt - firstCardAt),
  });
}

export function markDiscoveryPerformance(
  name: DiscoveryPerformanceMark,
  options: { once?: boolean } = {},
) {
  const once = options.once ?? true;

  if (once && markedAt.has(name)) {
    return markedAt.get(name)!;
  }

  const now = metricNow();
  markedAt.set(name, now);

  try {
    performance.mark(name);
  } catch {
    // Performance Timeline é apenas instrumentação.
  }

  console.info('[XANDEFLIX_DISCOVERY_PERF_MARK]', {
    mark: name,
    atMs: Math.round(now),
  });

  if (name === 'hero_image_paint' || name === 'home_first_card_image_paint') {
    logHeroDelta(
      'hero_image_paint',
      'HOME_HERO_VS_FIRST_CARD_DELTA_MS',
      'home_first_card_image_paint',
    );
  }
  if (
    name === 'movies_hero_image_paint' ||
    name === 'movies_first_card_image_paint'
  ) {
    logHeroDelta(
      'movies_hero_image_paint',
      'MOVIES_HERO_VS_FIRST_CARD_DELTA_MS',
      'movies_first_card_image_paint',
    );
  }
  if (
    name === 'series_hero_image_paint' ||
    name === 'series_first_card_image_paint'
  ) {
    logHeroDelta(
      'series_hero_image_paint',
      'SERIES_HERO_VS_FIRST_CARD_DELTA_MS',
      'series_first_card_image_paint',
    );
  }

  return now;
}

export function markDiscoveryFirstCardImagePaint(
  surface?: 'home' | 'movies' | 'series',
) {
  markDiscoveryPerformance('first_card_image_paint');

  if (surface === 'home') {
    markDiscoveryPerformance('home_first_card_image_paint');
  } else if (surface === 'movies') {
    markDiscoveryPerformance('movies_first_card_image_paint');
  } else if (surface === 'series') {
    markDiscoveryPerformance('series_first_card_image_paint');
  }
}

export function getDiscoveryPerformanceMark(
  name: DiscoveryPerformanceMark,
) {
  return markedAt.get(name) ?? null;
}

export function preloadCriticalHeroArtwork(url?: string | null) {
  const normalizedUrl = url?.trim();

  if (!normalizedUrl || typeof Image === 'undefined') {
    return null;
  }

  const image = new Image();
  image.loading = 'eager';
  image.decoding = 'async';
  image.fetchPriority = 'high';
  image.src = normalizedUrl;
  return image;
}

export function resetDiscoveryPerformanceForTests() {
  markedAt.clear();
}
