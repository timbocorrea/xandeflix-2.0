import { Capacitor, registerPlugin } from '@capacitor/core';

type E8DiagnosticPayloads = {
  CONFIG_FLAGS: {
    snapshotImportEnabled: boolean;
    snapshotPromotionEnabled: boolean;
  };
  ACTIVATION_READY: {
    authorized: true;
  };
  PREPARING_FLOW_ENTER: undefined;
  APP_BOOTSTRAP_ENTER: undefined;
  APP_BOOTSTRAP_SKIP: {
    reason: 'SESSION_CACHE_READY';
  };
  PREPARE_HOME_ENTER: undefined;
  SOURCE_IMPORT_DISPATCH: {
    managedRequested: boolean;
  };
  START_SOURCE_IMPORT_ENTER: undefined;
  START_SOURCE_IMPORT_EARLY_RETURN: {
    reason: 'IN_FLIGHT_DEDUP';
  };
  IMPORT_START: {
    elapsedMs: number;
    collectChannels: boolean;
    managedBootstrap: boolean;
  };
  BATCH_SAMPLE: {
    elapsedMs: number;
    batchSequence: number;
    batchSize: number;
    processedItems: number;
    firstFoldSettled: boolean;
  };
  V3_WRITE_SAMPLE: {
    elapsedMs: number;
    batchSequence: number;
    batchSize: number;
    writeElapsedMs: number;
    processedItems: number;
  };
  FIRST_VOD_DETECTED: {
    elapsedMs: number;
    batchSequence: number;
    batchSize: number;
    processedItems: number;
    firstFoldSettled: boolean;
  };
  FIRST_FOLD_READ_START: {
    elapsedMs: number;
    batchSequence: number;
    processedItems: number;
  };
  FIRST_FOLD_READ_DONE: {
    elapsedMs: number;
    batchSequence: number;
    readElapsedMs: number;
    sectionCount: number;
    itemCount: number;
    hasRenderableSections: boolean;
  };
  FIRST_FOLD_READY_EMITTED: {
    elapsedMs: number;
    readMode: 'staging' | 'active';
    atEof: boolean;
    hasRenderableVodSections: boolean;
  };
  FIRST_FOLD_READY_CONSUMED: {
    consumerElapsedMs: number;
    readMode: 'staging' | 'active';
    hasRenderableVodSections: boolean;
  };
  PREPARING_HOME_RELEASE: {
    orchestratorElapsedMs: number;
    step: 'ready';
  };
  IMPORT_EOF: {
    elapsedMs: number;
    processedItems: number;
    playlistTotal: number;
    firstFoldSettled: boolean;
  };
  SNAPSHOT_PROMOTED: {
    elapsedMs: number;
    processedItems: number;
  };
  TRANSPORT_PROBE: undefined;
  SERIES_DETAIL_ENTER: undefined;
  SERIES_SCOPE_PRESENT: { scopePresent: boolean };
  SERIES_ACTIVE_SNAPSHOT_PRESENT: { snapshotPresent: boolean };
  SERIES_STAGING_SNAPSHOT_PRESENT: { snapshotPresent: boolean };
  SERIES_LOOKUP_STATUS: {
    status: 'ready' | 'not_ready' | 'snapshot_unavailable' | 'building';
  };
  SERIES_FALLBACK_ENTER: undefined;
  SERIES_FALLBACK_SOURCE: {
    source:
      | 'active_snapshot_v3_direct_fallback'
      | 'staging_snapshot_v3_direct_fallback'
      | 'legacy_v2_fallback';
  };
  SERIES_FALLBACK_CANDIDATE_COUNT: { count: number };
  SERIES_PARENT_KEY_MATCH_COUNT: { count: number };
  SERIES_SEASON_COUNT: { count: number };
  SERIES_EPISODE_COUNT: { count: number };
  SERIES_READ_MODEL_STATUS: {
    status: 'ready' | 'index_building' | 'unavailable';
  };
  MOVIE_DETAIL_ENTER: undefined;
  MOVIE_SCOPE_PRESENT: { scopePresent: boolean };
  MOVIE_ACTIVE_SNAPSHOT_PRESENT: { snapshotPresent: boolean };
  MOVIE_STAGING_SNAPSHOT_PRESENT: { snapshotPresent: boolean };
  MOVIE_SIMILAR_LOADER_ENTER: undefined;
  MOVIE_SIMILAR_READ_MODE: {
    source: 'active_snapshot' | 'legacy_repository' | 'unavailable';
  };
  MOVIE_SIMILAR_RAW_COUNT: { count: number };
  MOVIE_SIMILAR_KIND_FILTER_COUNT: { count: number };
  MOVIE_SIMILAR_AFTER_CURRENT_EXCLUSION_COUNT: { count: number };
  MOVIE_SIMILAR_GROUP_MATCH_COUNT: { count: number };
  MOVIE_SIMILAR_FINAL_COUNT: { count: number };
  MOVIE_SIMILAR_SECTION_RENDERED: { rendered: boolean };
};

type E8DiagnosticEvent = keyof E8DiagnosticPayloads;
type E8DiagnosticEventWithoutPayload = {
  [Event in E8DiagnosticEvent]: E8DiagnosticPayloads[Event] extends undefined
    ? Event
    : never;
}[E8DiagnosticEvent];
type E8DiagnosticEventWithPayload = Exclude<
  E8DiagnosticEvent,
  E8DiagnosticEventWithoutPayload
>;
type AllowedPayloadKey =
  | 'elapsedMs'
  | 'consumerElapsedMs'
  | 'orchestratorElapsedMs'
  | 'batchSequence'
  | 'batchSize'
  | 'processedItems'
  | 'writeElapsedMs'
  | 'readElapsedMs'
  | 'sectionCount'
  | 'itemCount'
  | 'playlistTotal'
  | 'collectChannels'
  | 'managedBootstrap'
  | 'firstFoldSettled'
  | 'hasRenderableSections'
  | 'hasRenderableVodSections'
  | 'atEof'
  | 'readMode'
  | 'step'
  | 'snapshotImportEnabled'
  | 'snapshotPromotionEnabled'
  | 'authorized'
  | 'managedRequested'
  | 'reason'
  | 'count'
  | 'scopePresent'
  | 'snapshotPresent'
  | 'rendered'
  | 'status'
  | 'source';

type DiagnosticLogOptions = {
  event: E8DiagnosticEvent;
} & Partial<Record<AllowedPayloadKey, number | boolean | string>>;

type DiagnosticLogPlugin = {
  log(options: DiagnosticLogOptions): Promise<void>;
};

const DiagnosticLog = registerPlugin<DiagnosticLogPlugin>('DiagnosticLog');

const EVENT_FIELDS: Record<E8DiagnosticEvent, readonly AllowedPayloadKey[]> = {
  CONFIG_FLAGS: ['snapshotImportEnabled', 'snapshotPromotionEnabled'],
  ACTIVATION_READY: ['authorized'],
  PREPARING_FLOW_ENTER: [],
  APP_BOOTSTRAP_ENTER: [],
  APP_BOOTSTRAP_SKIP: ['reason'],
  PREPARE_HOME_ENTER: [],
  SOURCE_IMPORT_DISPATCH: ['managedRequested'],
  START_SOURCE_IMPORT_ENTER: [],
  START_SOURCE_IMPORT_EARLY_RETURN: ['reason'],
  IMPORT_START: ['elapsedMs', 'collectChannels', 'managedBootstrap'],
  BATCH_SAMPLE: [
    'elapsedMs',
    'batchSequence',
    'batchSize',
    'processedItems',
    'firstFoldSettled',
  ],
  V3_WRITE_SAMPLE: [
    'elapsedMs',
    'batchSequence',
    'batchSize',
    'writeElapsedMs',
    'processedItems',
  ],
  FIRST_VOD_DETECTED: [
    'elapsedMs',
    'batchSequence',
    'batchSize',
    'processedItems',
    'firstFoldSettled',
  ],
  FIRST_FOLD_READ_START: ['elapsedMs', 'batchSequence', 'processedItems'],
  FIRST_FOLD_READ_DONE: [
    'elapsedMs',
    'batchSequence',
    'readElapsedMs',
    'sectionCount',
    'itemCount',
    'hasRenderableSections',
  ],
  FIRST_FOLD_READY_EMITTED: [
    'elapsedMs',
    'readMode',
    'atEof',
    'hasRenderableVodSections',
  ],
  FIRST_FOLD_READY_CONSUMED: [
    'consumerElapsedMs',
    'readMode',
    'hasRenderableVodSections',
  ],
  PREPARING_HOME_RELEASE: ['orchestratorElapsedMs', 'step'],
  IMPORT_EOF: ['elapsedMs', 'processedItems', 'playlistTotal', 'firstFoldSettled'],
  SNAPSHOT_PROMOTED: ['elapsedMs', 'processedItems'],
  TRANSPORT_PROBE: [],
  SERIES_DETAIL_ENTER: [],
  SERIES_SCOPE_PRESENT: ['scopePresent'],
  SERIES_ACTIVE_SNAPSHOT_PRESENT: ['snapshotPresent'],
  SERIES_STAGING_SNAPSHOT_PRESENT: ['snapshotPresent'],
  SERIES_LOOKUP_STATUS: ['status'],
  SERIES_FALLBACK_ENTER: [],
  SERIES_FALLBACK_SOURCE: ['source'],
  SERIES_FALLBACK_CANDIDATE_COUNT: ['count'],
  SERIES_PARENT_KEY_MATCH_COUNT: ['count'],
  SERIES_SEASON_COUNT: ['count'],
  SERIES_EPISODE_COUNT: ['count'],
  SERIES_READ_MODEL_STATUS: ['status'],
  MOVIE_DETAIL_ENTER: [],
  MOVIE_SCOPE_PRESENT: ['scopePresent'],
  MOVIE_ACTIVE_SNAPSHOT_PRESENT: ['snapshotPresent'],
  MOVIE_STAGING_SNAPSHOT_PRESENT: ['snapshotPresent'],
  MOVIE_SIMILAR_LOADER_ENTER: [],
  MOVIE_SIMILAR_READ_MODE: ['source'],
  MOVIE_SIMILAR_RAW_COUNT: ['count'],
  MOVIE_SIMILAR_KIND_FILTER_COUNT: ['count'],
  MOVIE_SIMILAR_AFTER_CURRENT_EXCLUSION_COUNT: ['count'],
  MOVIE_SIMILAR_GROUP_MATCH_COUNT: ['count'],
  MOVIE_SIMILAR_FINAL_COUNT: ['count'],
  MOVIE_SIMILAR_SECTION_RENDERED: ['rendered'],
};

function sanitizePayload(
  event: E8DiagnosticEvent,
  payload: unknown,
): Partial<Record<AllowedPayloadKey, number | boolean | string>> {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const input = payload as Record<string, unknown>;
  const sanitized: Partial<Record<AllowedPayloadKey, number | boolean | string>> = {};

  for (const field of EVENT_FIELDS[event]) {
    const value = input[field];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      sanitized[field] = Math.round(value);
    } else if (typeof value === 'boolean') {
      sanitized[field] = value;
    } else if (
      (field === 'readMode' && (value === 'staging' || value === 'active')) ||
      (field === 'step' && value === 'ready') ||
      (field === 'reason' &&
        (value === 'SESSION_CACHE_READY' || value === 'IN_FLIGHT_DEDUP')) ||
      (field === 'status' &&
        (value === 'ready' ||
          value === 'not_ready' ||
          value === 'snapshot_unavailable' ||
          value === 'building' ||
          value === 'failed' ||
          value === 'stale' ||
          value === 'index_building' ||
          value === 'unavailable')) ||
      (field === 'source' &&
        (value === 'active_snapshot_v3_indexed' ||
          value === 'active_snapshot_v3_direct_fallback' ||
          value === 'staging_snapshot_v3_direct_fallback' ||
          value === 'legacy_v2_fallback' ||
          value === 'active_snapshot' ||
          value === 'legacy_repository' ||
          value === 'unavailable'))
    ) {
      sanitized[field] = value;
    }
  }

  return sanitized;
}

export function e8DiagnosticLog<Event extends E8DiagnosticEventWithoutPayload>(
  event: Event,
): void;
export function e8DiagnosticLog<Event extends E8DiagnosticEventWithPayload>(
  event: Event,
  payload: E8DiagnosticPayloads[Event],
): void;
export function e8DiagnosticLog(event: E8DiagnosticEvent, payload?: unknown): void {
  const sanitizedPayload = sanitizePayload(event, payload);
  const options: DiagnosticLogOptions = { event, ...sanitizedPayload };

  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      void DiagnosticLog.log(options).catch(() => undefined);
      return;
    }

    console.info(`[XANDEFLIX_E8_DIAG] ${event}`, sanitizedPayload);
  } catch {
    // Diagnostic transport must never affect application behavior.
  }
}
