export type DiscoveryPerformanceMark =
  | 'app_start'
  | 'license_validation_start'
  | 'license_valid'
  | 'source_resolution_start'
  | 'source_resolved'
  | 'cold_start_import_required'
  | 'playlist_transport_request_start'
  | 'playlist_transport_first_byte'
  | 'playlist_transport_request_end'
  | 'playlist_parse_start'
  | 'playlist_first_batch'
  | 'playlist_parse_end'
  | 'v2_import_start'
  | 'v2_import_session_ready'
  | 'v2_first_batch_write_start'
  | 'v2_first_batch_write_end'
  | 'v2_import_complete_start'
  | 'v2_import_complete_end'
  | 'v3_snapshot_prepare_start'
  | 'v3_snapshot_prepare_end'
  | 'v3_first_batch_write_start'
  | 'v3_first_batch_write_end'
  | 'v3_snapshot_complete_start'
  | 'v3_snapshot_complete_end'
  | 'v3_snapshot_promote_start'
  | 'v3_snapshot_promote_end'
  | 'local_catalog_ready'
  | 'home_sections_start'
  | 'home_sections_ready'
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
  | 'home_functional_ready'
  | 'refresh_policy_decision'
  | 'catalog_background_refresh_start'
  | 'catalog_background_refresh_end'
  | 'local_catalog_background_refresh_start'
  | 'local_catalog_background_refresh_end'
  | 'movie_metadata_enrichment_start'
  | 'movie_metadata_enrichment_end'
  | 'series_primary_metadata_start'
  | 'series_primary_metadata_end'
  | 'series_fallback_metadata_start'
  | 'series_fallback_metadata_end'
  | 'artwork_preload_start'
  | 'artwork_preload_end'
  | 'source_refresh_start'
  | 'source_refresh_end';

export type U2F3PerformanceCounter =
  | 'provider_full_request_count'
  | 'v2_batch_count'
  | 'v2_item_count'
  | 'v2_write_await_total_ms'
  | 'v2_failure_count'
  | 'v3_batch_count'
  | 'v3_item_count'
  | 'v3_write_await_total_ms'
  | 'v3_failure_count'
  | 'catalog_background_refresh_count'
  | 'local_catalog_background_refresh_count'
  | 'snapshot_staging_created_count'
  | 'snapshot_promotion_count'
  | 'movie_metadata_enrichment_count'
  | 'series_primary_metadata_count'
  | 'series_fallback_metadata_count'
  | 'artwork_preload_count';

const markedAt = new Map<DiscoveryPerformanceMark, number>();
const spanStartedAt = new Map<string, number>();
const counters = new Map<U2F3PerformanceCounter, number>();

let traceId = createTraceId();
let summaryEmitted = false;

function metricNow() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function createTraceId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Math.round(metricNow()).toString(36),
    Math.random().toString(36).slice(2, 12),
  ].join('-');
}

function logSerialized(
  prefix:
    | '[XANDEFLIX_U2_F3_PERF_MARK]'
    | '[XANDEFLIX_U2_F3_PERF_SPAN]'
    | '[XANDEFLIX_U2_F3_PERF_COUNTER]'
    | '[XANDEFLIX_U2_F3_PERF_SUMMARY]',
  payload: Record<string, unknown>,
) {
  console.info(
    prefix,
    JSON.stringify({
      traceId,
      ...payload,
    }),
  );
}

function roundedDelta(
  startMark: DiscoveryPerformanceMark,
  endMark: DiscoveryPerformanceMark,
) {
  const startAt = markedAt.get(startMark);
  const endAt = markedAt.get(endMark);

  if (startAt === undefined || endAt === undefined) {
    return null;
  }

  return Math.max(0, Math.round(endAt - startAt));
}

function getCounterValue(name: U2F3PerformanceCounter) {
  return Math.round(counters.get(name) ?? 0);
}

function getCountersSnapshot() {
  return {
    provider_full_request_count: getCounterValue(
      'provider_full_request_count',
    ),
    v2_batch_count: getCounterValue('v2_batch_count'),
    v2_item_count: getCounterValue('v2_item_count'),
    v2_write_await_total_ms: getCounterValue(
      'v2_write_await_total_ms',
    ),
    v2_failure_count: getCounterValue('v2_failure_count'),
    v3_batch_count: getCounterValue('v3_batch_count'),
    v3_item_count: getCounterValue('v3_item_count'),
    v3_write_await_total_ms: getCounterValue(
      'v3_write_await_total_ms',
    ),
    v3_failure_count: getCounterValue('v3_failure_count'),
    catalog_background_refresh_count: getCounterValue(
      'catalog_background_refresh_count',
    ),
    local_catalog_background_refresh_count: getCounterValue(
      'local_catalog_background_refresh_count',
    ),
    snapshot_staging_created_count: getCounterValue(
      'snapshot_staging_created_count',
    ),
    snapshot_promotion_count: getCounterValue(
      'snapshot_promotion_count',
    ),
    movie_metadata_enrichment_count: getCounterValue(
      'movie_metadata_enrichment_count',
    ),
    series_primary_metadata_count: getCounterValue(
      'series_primary_metadata_count',
    ),
    series_fallback_metadata_count: getCounterValue(
      'series_fallback_metadata_count',
    ),
    artwork_preload_count: getCounterValue('artwork_preload_count'),
  };
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

  console.info(
    '[XANDEFLIX_DISCOVERY_PERF_METRIC]',
    JSON.stringify({
      metric: metricName,
      valueMs: Math.round(heroAt - firstCardAt),
    }),
  );
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
    // Performance Timeline é somente instrumentação.
  }

  console.info(
    '[XANDEFLIX_DISCOVERY_PERF_MARK]',
    JSON.stringify({
      mark: name,
      atMs: Math.round(now),
    }),
  );

  logSerialized('[XANDEFLIX_U2_F3_PERF_MARK]', {
    mark: name,
    atMs: Math.round(now),
  });

  if (
    name === 'hero_image_paint' ||
    name === 'home_first_card_image_paint'
  ) {
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

  if (
    name !== 'home_functional_ready' &&
    markedAt.has('home_shell_render') &&
    markedAt.has('first_card_content')
  ) {
    markDiscoveryPerformance('home_functional_ready');
  }

  if (name === 'home_functional_ready') {
    emitDiscoveryPerformanceSummary();
  }

  return now;
}

export function startDiscoveryPerformanceSpan(name: string) {
  const now = metricNow();
  spanStartedAt.set(name, now);

  logSerialized('[XANDEFLIX_U2_F3_PERF_SPAN]', {
    span: name,
    phase: 'start',
    atMs: Math.round(now),
  });

  return now;
}

export function endDiscoveryPerformanceSpan(name: string) {
  const endAt = metricNow();
  const startAt = spanStartedAt.get(name);

  if (startAt === undefined) {
    return null;
  }

  spanStartedAt.delete(name);

  const durationMs = Math.max(0, endAt - startAt);

  logSerialized('[XANDEFLIX_U2_F3_PERF_SPAN]', {
    span: name,
    phase: 'end',
    atMs: Math.round(endAt),
    durationMs: Math.round(durationMs),
  });

  return durationMs;
}

export function incrementDiscoveryPerformanceCounter(
  name: U2F3PerformanceCounter,
  amount = 1,
) {
  const normalizedAmount = Number.isFinite(amount) ? amount : 0;
  const nextValue = (counters.get(name) ?? 0) + normalizedAmount;
  counters.set(name, nextValue);
  return nextValue;
}

export function emitDiscoveryPerformanceCounters() {
  const snapshot = getCountersSnapshot();

  logSerialized('[XANDEFLIX_U2_F3_PERF_COUNTER]', snapshot);

  return snapshot;
}

export function emitDiscoveryPerformanceSummary(
  options: { force?: boolean } = {},
) {
  if (summaryEmitted && !options.force) {
    return null;
  }

  summaryEmitted = true;

  const counterSnapshot = emitDiscoveryPerformanceCounters();
  const summary = {
    APP_START_TO_LICENSE_VALID_MS: roundedDelta(
      'app_start',
      'license_valid',
    ),
    APP_START_TO_SOURCE_RESOLVED_MS: roundedDelta(
      'app_start',
      'source_resolved',
    ),
    APP_START_TO_FIRST_BATCH_MS: roundedDelta(
      'app_start',
      'playlist_first_batch',
    ),
    APP_START_TO_LOCAL_CATALOG_READY_MS: roundedDelta(
      'app_start',
      'local_catalog_ready',
    ),
    APP_START_TO_FIRST_CARD_CONTENT_MS: roundedDelta(
      'app_start',
      'first_card_content',
    ),
    APP_START_TO_FIRST_CARD_IMAGE_MS: roundedDelta(
      'app_start',
      'first_card_image_paint',
    ),
    APP_START_TO_HOME_FUNCTIONAL_MS: roundedDelta(
      'app_start',
      'home_functional_ready',
    ),
    PLAYLIST_TRANSPORT_DURATION_MS: roundedDelta(
      'playlist_transport_request_start',
      'playlist_transport_request_end',
    ),
    PLAYLIST_PARSE_DURATION_MS: roundedDelta(
      'playlist_parse_start',
      'playlist_parse_end',
    ),
    V2_FIRST_BATCH_WRITE_MS: roundedDelta(
      'v2_first_batch_write_start',
      'v2_first_batch_write_end',
    ),
    V2_WRITE_AWAIT_TOTAL_MS:
      counterSnapshot.v2_write_await_total_ms,
    V3_PREPARE_DURATION_MS: roundedDelta(
      'v3_snapshot_prepare_start',
      'v3_snapshot_prepare_end',
    ),
    V3_FIRST_BATCH_WRITE_MS: roundedDelta(
      'v3_first_batch_write_start',
      'v3_first_batch_write_end',
    ),
    V3_WRITE_AWAIT_TOTAL_MS:
      counterSnapshot.v3_write_await_total_ms,
    V3_PROMOTION_DURATION_MS: roundedDelta(
      'v3_snapshot_promote_start',
      'v3_snapshot_promote_end',
    ),
  };

  logSerialized('[XANDEFLIX_U2_F3_PERF_SUMMARY]', summary);

  return summary;
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

export function getDiscoveryPerformanceTraceId() {
  return traceId;
}

export function getDiscoveryPerformanceNow() {
  return metricNow();
}

export function preloadCriticalHeroArtwork(url?: string | null) {
  const normalizedUrl = url?.trim();

  if (!normalizedUrl || typeof Image === 'undefined') {
    return null;
  }

  markDiscoveryPerformance('artwork_preload_start', {
    once: false,
  });
  startDiscoveryPerformanceSpan(
    'critical_hero_artwork_preload',
  );
  incrementDiscoveryPerformanceCounter(
    'artwork_preload_count',
  );

  const image = new Image();
  let settled = false;

  const finish = () => {
    if (settled) {
      return;
    }

    settled = true;
    markDiscoveryPerformance('artwork_preload_end', {
      once: false,
    });
    endDiscoveryPerformanceSpan(
      'critical_hero_artwork_preload',
    );
  };

  image.loading = 'eager';
  image.decoding = 'async';
  image.fetchPriority = 'high';
  image.onload = () => finish();
  image.onerror = () => finish();
  image.src = normalizedUrl;
  return image;
}

export function resetDiscoveryPerformanceForTests() {
  markedAt.clear();
  spanStartedAt.clear();
  counters.clear();
  summaryEmitted = false;
  traceId = createTraceId();
}
