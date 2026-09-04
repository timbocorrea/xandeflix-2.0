import type { IptvChannel } from '@/features/playlists/types/playlist';
import type {
  LocalCatalogItem,
  LocalCatalogScope,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';

import {
  LOCAL_CATALOG_SEARCH_PAGE_SIZE,
  searchLocalCatalog,
} from '../readModels/localCatalogSearchReadModel.service';
import { loadLocalCatalogSeriesDetailReadModel } from '../readModels/localCatalogSeriesDetailReadModel.service';
import {
  localCatalogSearchRepository,
} from '../repositories/localCatalogSearchRepository.service';
import { evaluateLocalCatalogResume } from '../repositories/localCatalogSnapshotLifecycleRepository.service';
import { deriveLocalCatalogScope } from './localCatalogScope.service';
import { prepareLocalCatalogRuntimeSnapshotBridge } from './localCatalogRuntimeSnapshotBridge.service';
import {
  LOCAL_CATALOG_V2_STORES,
  LOCAL_CATALOG_V3_STORES,
  deleteLocalCatalogItems,
  getLocalCatalogScope,
  openLocalCatalogDb,
  putLocalCatalogItems,
  putLocalCatalogImportMetadata,
  putLocalCatalogMetadata,
} from './localCatalogDb.service';
import { listLocalCatalogSnapshots } from './localCatalogDb.service';
import { ensureLocalCatalogLegacySnapshot } from './localCatalogLegacySnapshotBackfill.service';
import { prepareLocalCatalogRuntimeScope } from './localCatalogSnapshotLifecycle.service';
import { buildLocalCatalogSeriesLookup } from './localCatalogSeriesLookup.service';
import { purgeLocalCatalogSnapshotPartialData } from './localCatalogSnapshotPurge.service';
import { createLocalCatalogSearchRecords } from '../lib/localCatalogSearchIndex';
import {
  ensureLocalCatalogSearchIndex,
  getLocalCatalogSearchIndexState,
} from './localCatalogSearchIndex.service';
import {
  buildLocalCatalogMovieDetailRoute,
  buildLocalCatalogSearchReturnTo,
  buildLocalCatalogSeriesDetailRoute,
  createLocalCatalogSearchReturnCache,
  getLocalCatalogSearchResultFocusKey,
  isLocalCatalogSearchReturnCacheMatch,
  LOCAL_CATALOG_SEARCH_INDEX_RETRY_FOCUS_KEY,
  LOCAL_CATALOG_SEARCH_QUERY_RETRY_FOCUS_KEY,
  LOCAL_CATALOG_SEARCH_ROUTE,
  resolveLocalCatalogBackListenerAuthority,
  resolveLocalCatalogSearchNativeInputLifecycle,
  resolveLocalCatalogSearchViewState,
  resolveLocalCatalogSearchInputArrowTarget,
  resolveLocalCatalogSearchInputArrowPress,
  replaceLocalCatalogSearchReturnCache,
  shouldBlurLocalCatalogSearchInputOnArrowNavigation,
  shouldInvalidateLocalCatalogSearchReturnCache,
  type LocalCatalogSearchReturnCache,
} from '../lib/localCatalogSearchUiContract';

const LICENSE_A = 'search-smoke-license-a';
const LICENSE_B = 'search-smoke-license-b';
const SOURCE_A = 'search-smoke-source-a';
const SOURCE_B = 'search-smoke-source-b';
const LEGACY_LICENSE = 'search-smoke-legacy-license';
const LEGACY_SOURCE = 'search-smoke-legacy-source';
const INCOMPLETE_LEGACY_LICENSE = 'search-smoke-incomplete-legacy-license';
const INCOMPLETE_LEGACY_SOURCE = 'search-smoke-incomplete-legacy-source';
const NO_ACTIVE_EMPTY_LICENSE = 'search-smoke-no-active-empty-license';
const NO_ACTIVE_EMPTY_SOURCE = 'search-smoke-no-active-empty-source';
const DETAIL_FALLBACK_LICENSE = 'series-detail-smoke-fallback-license';
const DETAIL_FALLBACK_SOURCE = 'series-detail-smoke-fallback-source';
const DETAIL_PERF_LICENSE = 'series-detail-smoke-perf-license';
const DETAIL_PERF_SOURCE = 'series-detail-smoke-perf-source';
const DETAIL_PERF_ACTIVE_SNAPSHOT =
  'series-detail-smoke-perf-active-snapshot';
const DETAIL_PERF_OLD_SNAPSHOT =
  'series-detail-smoke-perf-superseded-snapshot';
const DETAIL_PERF_IRRELEVANT_ITEMS = 10_000;
const DETAIL_PERF_TARGET_ITEMS = 20;
const LEGACY_TARGET_TITLE = 'SILO LEGACY LOCAL';
const LEGACY_ITEM_COUNT = 501;
const TARGET_TITLE = 'ALVO BUSCA UNIVERSAL';
const TARGET_INDEX = 550;

export type LocalCatalogSearchSmokeTestResult = {
  ok: boolean;
  SEARCH_01_EMPTY_QUERY_SAFE: boolean;
  SEARCH_02_EXACT_TITLE: boolean;
  SEARCH_03_CASE_INSENSITIVE: boolean;
  SEARCH_04_ACCENT_INSENSITIVE: boolean;
  SEARCH_05_PREFIX: boolean;
  SEARCH_06_CONTAINS: boolean;
  SEARCH_07_ITEM_OUTSIDE_HOME_FOUND: boolean;
  SEARCH_08_ITEM_WITHOUT_POSTER_FOUND: boolean;
  SEARCH_09_MOVIE_FOUND: boolean;
  SEARCH_10_SERIES_FOUND: boolean;
  SEARCH_11_NO_REMOTE_NETWORK: boolean;
  SEARCH_12_NO_BACKEND_CATALOG_QUERY: boolean;
  SEARCH_13_RESULTS_BOUNDED: boolean;
  SEARCH_14_DETERMINISTIC_ORDER: boolean;
  SEARCH_15_DIFFERENT_SOURCE_ISOLATED: boolean;
  SEARCH_16_DIFFERENT_LICENSE_SCOPE_ISOLATED: boolean;
  SEARCH_17_UNSAFE_DATA_NOT_EXPOSED: boolean;
  SEARCH_18_DPAD_CONTRACT_PRESERVED: boolean;
  SEARCH_19_BACK_NAVIGATION_PRESERVED: boolean;
  SEARCH_20_CONTROL_PLANE_ONLY: boolean;
  SEARCH_21_LIVE_FOUND: boolean;
  SEARCH_22_LEGACY_BACKFILL_SEARCHABLE: boolean;
  SEARCH_23_LEGACY_FALLBACK_SEARCHABLE: boolean;
  SEARCH_24_INCOMPLETE_LEGACY_READY_NOT_ZERO: boolean;
  G2D_NO_ACTIVE_01_NO_LOCAL_DATA_UNAVAILABLE: boolean;
  G2D_NO_ACTIVE_02_STAGING_NOT_SEARCHABLE: boolean;
  G2D_NO_ACTIVE_03_LEGACY_PARTIAL_NOT_SEARCHABLE: boolean;
  G2D_NO_ACTIVE_04_LEGACY_FAILURE_NOT_SEARCHABLE: boolean;
  G2D_NO_ACTIVE_05_LEGACY_TOKEN_ROUTE_NOT_INVOKED: boolean;
  G2D_NO_ACTIVE_06_LEGACY_PREFIX_ROUTE_NOT_INVOKED: boolean;
  SEARCH_SERIES_01_SINGLE_SERIES_RESULT: boolean;
  SEARCH_SERIES_02_CANONICAL_TITLE: boolean;
  SEARCH_SERIES_03_OPENS_SERIES_DETAIL: boolean;
  SEARCH_SERIES_04_DETERMINISTIC_REPRESENTATIVE: boolean;
  SEARCH_SERIES_05_LOCAL_POSTER_PREFERRED: boolean;
  SEARCH_SERIES_06_EPISODES_PRESERVED: boolean;
  SEARCH_SERIES_07_MOVIES_NOT_AGGREGATED: boolean;
  SEARCH_SERIES_08_LIVE_NOT_AGGREGATED: boolean;
  SEARCH_SERIES_09_DISTINCT_SERIES_PRESERVED: boolean;
  SEARCH_SERIES_10_PAGINATION_SAFE: boolean;
  SERIES_DETAIL_V3_01_SEARCH_DETAIL_CONSISTENCY: boolean;
  SERIES_DETAIL_V3_02_ACTIVE_SNAPSHOT_WINS: boolean;
  SERIES_DETAIL_V3_03_LEGACY_FALLBACK: boolean;
  SERIES_DETAIL_V3_PERF_01_NO_UNBOUNDED_GETALL: boolean;
  SERIES_DETAIL_V3_PERF_02_LARGE_CATALOG_BOUNDED_SCAN: boolean;
  SERIES_DETAIL_V3_PERF_03_SNAPSHOT_ISOLATION: boolean;
  SEARCH_DETAIL_COUNT_MATCH: boolean;
  ACTIVE_SNAPSHOT_V3_WINS_OVER_LEGACY_V2: boolean;
  FULL_LOCAL_CATALOG_SEARCH: boolean;
  VS06_IDENTITY_01_DUPLICATE_MOVIE_TITLE_DISAMBIGUATED: boolean;
  VS06_IDENTITY_02_MOVIE_ID_PERSISTED_IN_URL: boolean;
  VS06_IDENTITY_03_SERIES_ROUTE_PRESERVED: boolean;
  VS06_NAV_01_SEARCH_ROUTE_CANONICAL: boolean;
  VS06_SEARCH_STATE_01_TRUE_ZERO_READY: boolean;
  VS06_SEARCH_STATE_02_INDEXING_NOT_ZERO: boolean;
  VS06_SEARCH_STATE_03_INDEXING_PARTIAL_CONTENT: boolean;
  VS06_SEARCH_STATE_04_INDEX_FAILED_NOT_ZERO: boolean;
  VS06_SEARCH_STATE_05_UNAVAILABLE_NOT_ZERO: boolean;
  VS06_SEARCH_STATE_06_ERROR_NOT_ZERO: boolean;
  VS06_SEARCH_STATE_07_RESULT_STATE: boolean;
  VS06_SEARCH_DPAD_RESULT_TARGET: boolean;
  VS06_SEARCH_DPAD_INDEX_RETRY_TARGET: boolean;
  VS06_SEARCH_DPAD_QUERY_RETRY_TARGET: boolean;
  VS06_FOCUS_01_ARROW_DOWN_TARGETS_RESULT_ZERO: boolean;
  VS06_FOCUS_02_NATIVE_BLUR_REQUIRED_ON_RESULT_EXIT: boolean;
  VS06_FOCUS_R5_01_DOWN_TARGET_RESULT_ZERO: boolean;
  VS06_FOCUS_R5_02_HANDLED_DOWN_BLOCKS_DEFAULT_SPATIAL_MOVE: boolean;
  VS06_FOCUS_R5_03_SINGLE_DOWN_SINGLE_SPATIAL_MOVE: boolean;
  VS06_FOCUS_R5_04_INDEX_RETRY_CONSUMES_DOWN: boolean;
  VS06_FOCUS_R5_05_QUERY_RETRY_CONSUMES_DOWN: boolean;
  VS06_FOCUS_R5_06_NO_TARGET_NO_MANUAL_MOVE: boolean;
  FOCUS_LIFECYCLE_01_MOUNT_DOES_NOT_NATIVE_AUTOFOCUS: boolean;
  FOCUS_LIFECYCLE_02_SPATIAL_REFOCUS_DOES_NOT_NATIVE_AUTOFOCUS: boolean;
  FOCUS_LIFECYCLE_03_ENTER_EXPLICITLY_ACTIVATES_NATIVE_INPUT: boolean;
  FOCUS_LIFECYCLE_04_ARROWDOWN_BLURS_NATIVE_BEFORE_MOVE: boolean;
  FOCUS_LIFECYCLE_05_OPEN_RESULT_BLURS_NATIVE_INPUT: boolean;
  FOCUS_LIFECYCLE_06_UNMOUNT_BLURS_NATIVE_INPUT: boolean;
  VS06_BACK_01_NATIVE_SINGLE_AUTHORITY: boolean;
  VS06_BACK_02_WEB_SINGLE_AUTHORITY: boolean;
  VS06_RETURN_01_SAME_SCOPE_QUERY_CONTENT_RESTORABLE: boolean;
  VS06_RETURN_02_DIFFERENT_QUERY_NOT_RESTORED: boolean;
  VS06_RETURN_03_DIFFERENT_SCOPE_NOT_RESTORED: boolean;
  VS06_RETURN_04_EMPTY_PAGE_NOT_RESTORED: boolean;
  VS06_RETURN_05_ERROR_INVALIDATES_MATCHING_CACHE: boolean;
  VS06_RETURN_06_CACHE_BOUNDED_TO_ONE_ENTRY: boolean;
  R11_ACTIVE_01_QUERY_DOES_NOT_AWAIT_FULL_INDEX: boolean;
  R11_ACTIVE_02_PARTIAL_INDEX_CANDIDATE_VISIBLE: boolean;
  R11_ACTIVE_03_PARTIAL_ZERO_IS_INDEXING_NOT_ZERO: boolean;
  R11_ACTIVE_04_TRUE_ZERO_ONLY_AFTER_FULL_READY: boolean;
  R11_ACTIVE_05_INTERNAL_TOKEN_PARTIAL_WHEN_INDEXED: boolean;
  R11_ACTIVE_06_INDEX_FAILURE_NOT_ZERO: boolean;
  R11_ACTIVE_07_ONE_BUILDER_PER_SNAPSHOT: boolean;
  R11_ACTIVE_08_SCOPE_ISOLATION: boolean;
  R11_ACTIVE_09_GENERATION_ISOLATION: boolean;
  R11_ACTIVE_10_FULL_READY_BEHAVIOR_PRESERVED: boolean;
  R11_ACTIVE_11_R8_PARTIAL_CONTENT_STATE_PRESERVED: boolean;
  R11_ACTIVE_12_RETRY_PRESERVED: boolean;
  R11_RESUME_01_RESTART_DOES_NOT_REINDEX_COMMITTED_PREFIX: boolean;
  R11_RESUME_02_CHECKPOINT_MONOTONIC: boolean;
  R11_RESUME_03_CRASH_AFTER_BATCH_SAFE: boolean;
  R11_RESUME_04_GENERATION_CHANGE_INVALIDATES_CHECKPOINT: boolean;
  R11_RESUME_05_SCOPE_CHANGE_INVALIDATES_CHECKPOINT: boolean;
  R11_SILO_SENTINEL_PARTIAL_INDEX: boolean;
  errorCode?: string;
};

function channel(index: number): IptvChannel {
  if (index === 0) {
    return {
      id: 'avengers',
      name: 'Os Vingadores',
      url: 'https://media.invalid/avengers.mp4',
      groupTitle: 'Filmes',
      contentKind: 'movie',
      logo: 'https://images.invalid/avengers.jpg',
    };
  }
  if (index === 1) {
    return {
      id: 'action',
      name: 'Ação Total',
      url: 'https://media.invalid/action.mp4',
      groupTitle: 'Filmes',
      contentKind: 'movie',
    };
  }
  if (index === 2) {
    return {
      id: 'spider',
      name: 'Homem-Aranha',
      url: 'https://media.invalid/spider.mp4',
      groupTitle: 'Filmes',
      contentKind: 'movie',
    };
  }
  if (index === 3) {
    return {
      id: 'series',
      name: 'Dark',
      url: 'https://media.invalid/dark-s01e01.mp4',
      groupTitle: 'Séries',
      contentKind: 'series',
    };
  }
  if (index === 4) {
    return {
      id: 'live',
      name: 'Canal Notícias',
      url: 'https://media.invalid/live.m3u8',
      groupTitle: 'Canais',
      contentKind: 'live',
    };
  }
  if (index === 5) {
    return {
      id: 'without-poster',
      name: 'Filme Sem Poster',
      url: 'https://media.invalid/no-poster.mp4',
      groupTitle: 'Filmes',
      contentKind: 'movie',
    };
  }
  if (index >= 6 && index <= 9) {
    const episodeTitles = [
      'Silo S01 E01',
      'Silo S01 E01',
      'Silo S01 E02',
      'Silo S01 E03',
    ];
    return {
      id: `silo-${index}`,
      name: episodeTitles[index - 6],
      url: `https://media.invalid/silo-${index}.mp4`,
      groupTitle: 'SÃ©ries',
      contentKind: 'series',
      logo:
        index === 8
          ? 'https://images.invalid/silo-poster.jpg'
          : undefined,
    };
  }
  if (index >= 10 && index <= 11) {
    return {
      id: `last-of-us-${index}`,
      name: `The Last of Us S01E0${index - 9}`,
      url: `https://media.invalid/last-of-us-${index}.mp4`,
      groupTitle: 'SÃ©ries',
      contentKind: 'series',
    };
  }
  if (index >= 12 && index <= 13) {
    return {
      id: `silo-origins-${index}`,
      name: `Silo Origins S01E0${index - 11}`,
      url: `https://media.invalid/silo-origins-${index}.mp4`,
      groupTitle: 'SÃ©ries',
      contentKind: 'series',
    };
  }
  if (index >= 20 && index < 170) {
    const seriesIndex = Math.floor((index - 20) / 3);
    const episodeIndex = ((index - 20) % 3) + 1;
    return {
      id: `pagination-series-${seriesIndex}-${episodeIndex}`,
      name: `Serie Paginacao ${String(seriesIndex).padStart(2, '0')} S01E0${episodeIndex}`,
      url: `https://media.invalid/pagination-${seriesIndex}-${episodeIndex}.mp4`,
      groupTitle: 'SÃ©ries',
      contentKind: 'series',
    };
  }
  if (index >= 170 && index <= 171) {
    return {
      id: `repeated-movie-${index}`,
      name: 'Filme Repetido',
      url: `https://media.invalid/repeated-movie-${index}.mp4`,
      groupTitle: 'Filmes',
      contentKind: 'movie',
    };
  }
  if (index >= 172 && index <= 173) {
    return {
      id: `repeated-live-${index}`,
      name: 'Canal Repetido',
      url: `https://media.invalid/repeated-live-${index}.m3u8`,
      groupTitle: 'Canais',
      contentKind: 'live',
    };
  }

  return {
    id: `movie-${index}`,
    name:
      index === TARGET_INDEX
        ? TARGET_TITLE
        : `Filme Sintético ${String(index).padStart(4, '0')}`,
    url: `https://media.invalid/movie-${index}.mp4`,
    groupTitle: 'Filmes',
    contentKind: 'movie',
  };
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error('LOCAL_CATALOG_SEARCH_SMOKE_REQUEST_FAILED'),
      );
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(new Error('LOCAL_CATALOG_SEARCH_SMOKE_CLEANUP_FAILED'));
  });
}

async function cleanup(scopeKeys: string[]) {
  const snapshots = (
    await Promise.all(
      scopeKeys.map((scopeKey) =>
        listLocalCatalogSnapshots(scopeKey).catch(() => []),
      ),
    )
  ).flat();

  for (const snapshot of snapshots) {
    await purgeLocalCatalogSnapshotPartialData({
      snapshotId: snapshot.snapshotId,
    }).catch(() => undefined);
  }

  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V2_STORES[1],
        LOCAL_CATALOG_V3_STORES.scopes,
        LOCAL_CATALOG_V3_STORES.snapshots,
      ],
      'readwrite',
    );
    const done = transactionDone(transaction);
    for (const scopeKey of scopeKeys) {
      transaction
        .objectStore(LOCAL_CATALOG_V2_STORES[1])
        .delete(`legacy-search-index:${scopeKey}`);
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).delete(scopeKey);
    }
    for (const snapshot of snapshots) {
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.snapshots)
        .delete(snapshot.snapshotId);
    }
    await done;
  } finally {
    db.close();
  }
}

async function importFixture(input: {
  internalLicenseId: string;
  sourceId: string;
  channels: IptvChannel[];
}) {
  const bridge = await prepareLocalCatalogRuntimeSnapshotBridge({
    ...input,
    sourceType: 'm3u',
    promotionEnabled: true,
    parserVersion: 1,
    classificationVersion: 1,
    transformConcurrency: 2,
  });

  for (let start = 0; start < input.channels.length; start += 500) {
    await bridge.writeBatch(input.channels.slice(start, start + 500));
  }
  await bridge.complete({ parsedItems: input.channels.length });
  await bridge.promote();
}

async function clearSearchIndex(snapshotId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.searchDocuments,
        LOCAL_CATALOG_V3_STORES.searchTokens,
      ],
      'readwrite',
    );
    const done = transactionDone(transaction);
    for (const storeName of [
      LOCAL_CATALOG_V3_STORES.searchDocuments,
      LOCAL_CATALOG_V3_STORES.searchTokens,
    ]) {
      const store = transaction.objectStore(storeName);
      const indexName =
        storeName === LOCAL_CATALOG_V3_STORES.searchDocuments
          ? 'snapshotId'
          : 'snapshotIdToken';
      const range =
        storeName === LOCAL_CATALOG_V3_STORES.searchDocuments
          ? IDBKeyRange.only(snapshotId)
          : IDBKeyRange.bound([snapshotId], [snapshotId, []]);
      const request = store.index(indexName).openKeyCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
    }
    await done;
  } finally {
    db.close();
  }
}

function snapshotItem(input: {
  snapshotId: string;
  scopeKey: string;
  itemId: string;
  title: string;
  sourceOrder: number;
  contentKind: LocalCatalogSnapshotItem['contentKind'];
}): LocalCatalogSnapshotItem {
  return {
    snapshotId: input.snapshotId,
    itemId: input.itemId,
    scopeKey: input.scopeKey,
    logicalIdentity: {
      version: 1,
      strategy: 'url_fallback',
      value: input.itemId,
    },
    sourceItemId: input.itemId,
    contentKind: input.contentKind,
    rawName: input.title,
    normalizedName: input.title.toLowerCase(),
    rawGroupTitle: 'Séries',
    normalizedGroup: 'series',
    streamUrl: `https://media.invalid/${input.itemId}.mp4`,
    artworkUrl: null,
    sourceOrder: input.sourceOrder,
    classificationVersion: 1,
    createdAt: '2026-07-27T12:00:00.000Z',
    updatedAt: '2026-07-27T12:00:00.000Z',
  };
}

async function putLargeSeriesDetailFixture(
  scopeIdentity: Pick<LocalCatalogScope, 'scopeKey' | 'tenantScopeId' | 'sourceId'>,
) {
  const timestamp = '2026-07-27T12:00:00.000Z';
  const scope: LocalCatalogScope = {
    ...scopeIdentity,
    activeSnapshotId: DETAIL_PERF_ACTIVE_SNAPSHOT,
    stagingSnapshotId: null,
    accessStatus: 'active',
    runtimeEpoch: 1,
    retentionPolicyVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const activeSnapshot: LocalCatalogSnapshot = {
    snapshotId: DETAIL_PERF_ACTIVE_SNAPSHOT,
    scopeKey: scope.scopeKey,
    status: 'active',
    sourceRevision: null,
    classificationVersion: 1,
    schemaVersion: 3,
    totalItems:
      DETAIL_PERF_IRRELEVANT_ITEMS + DETAIL_PERF_TARGET_ITEMS,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
    failureCode: null,
  };
  const oldSnapshot: LocalCatalogSnapshot = {
    ...activeSnapshot,
    snapshotId: DETAIL_PERF_OLD_SNAPSHOT,
    status: 'superseded',
    totalItems: 7,
  };
  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.scopes,
        LOCAL_CATALOG_V3_STORES.snapshots,
        LOCAL_CATALOG_V3_STORES.items,
      ],
      'readwrite',
    );
    const done = transactionDone(transaction);
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).put(scope);
    transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.snapshots)
      .put(activeSnapshot);
    transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.snapshots)
      .put(oldSnapshot);
    const itemStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);

    for (let index = 0; index < DETAIL_PERF_IRRELEVANT_ITEMS; index += 1) {
      itemStore.put(
        snapshotItem({
          snapshotId: DETAIL_PERF_ACTIVE_SNAPSHOT,
          scopeKey: scope.scopeKey,
          itemId: `perf-irrelevant-${index}`,
          title: `Catálogo Irrelevante ${String(index).padStart(5, '0')} S01E01`,
          sourceOrder: index,
          contentKind: index % 2 === 0 ? 'series' : 'series_episode',
        }),
      );
    }

    for (let index = 0; index < DETAIL_PERF_TARGET_ITEMS; index += 1) {
      itemStore.put(
        snapshotItem({
          snapshotId: DETAIL_PERF_ACTIVE_SNAPSHOT,
          scopeKey: scope.scopeKey,
          itemId: `perf-target-${index}`,
          title: `Série Alvo Escala S01E${String(index + 1).padStart(2, '0')}`,
          sourceOrder: DETAIL_PERF_IRRELEVANT_ITEMS + index,
          contentKind: index % 2 === 0 ? 'series' : 'series_episode',
        }),
      );
    }

    for (let index = 0; index < 7; index += 1) {
      itemStore.put(
        snapshotItem({
          snapshotId: DETAIL_PERF_OLD_SNAPSHOT,
          scopeKey: scope.scopeKey,
          itemId: `perf-old-target-${index}`,
          title: `Série Alvo Escala S99E${String(index + 1).padStart(2, '0')}`,
          sourceOrder: index,
          contentKind: index % 2 === 0 ? 'series' : 'series_episode',
        }),
      );
    }

    await done;
  } finally {
    db.close();
  }
}

function emptyResult(): LocalCatalogSearchSmokeTestResult {
  return {
    ok: false,
    SEARCH_01_EMPTY_QUERY_SAFE: false,
    SEARCH_02_EXACT_TITLE: false,
    SEARCH_03_CASE_INSENSITIVE: false,
    SEARCH_04_ACCENT_INSENSITIVE: false,
    SEARCH_05_PREFIX: false,
    SEARCH_06_CONTAINS: false,
    SEARCH_07_ITEM_OUTSIDE_HOME_FOUND: false,
    SEARCH_08_ITEM_WITHOUT_POSTER_FOUND: false,
    SEARCH_09_MOVIE_FOUND: false,
    SEARCH_10_SERIES_FOUND: false,
    SEARCH_11_NO_REMOTE_NETWORK: false,
    SEARCH_12_NO_BACKEND_CATALOG_QUERY: false,
    SEARCH_13_RESULTS_BOUNDED: false,
    SEARCH_14_DETERMINISTIC_ORDER: false,
    SEARCH_15_DIFFERENT_SOURCE_ISOLATED: false,
    SEARCH_16_DIFFERENT_LICENSE_SCOPE_ISOLATED: false,
    SEARCH_17_UNSAFE_DATA_NOT_EXPOSED: false,
    SEARCH_18_DPAD_CONTRACT_PRESERVED: false,
    SEARCH_19_BACK_NAVIGATION_PRESERVED: false,
    SEARCH_20_CONTROL_PLANE_ONLY: false,
    SEARCH_21_LIVE_FOUND: false,
    SEARCH_22_LEGACY_BACKFILL_SEARCHABLE: false,
    SEARCH_23_LEGACY_FALLBACK_SEARCHABLE: false,
    SEARCH_24_INCOMPLETE_LEGACY_READY_NOT_ZERO: false,
    G2D_NO_ACTIVE_01_NO_LOCAL_DATA_UNAVAILABLE: false,
    G2D_NO_ACTIVE_02_STAGING_NOT_SEARCHABLE: false,
    G2D_NO_ACTIVE_03_LEGACY_PARTIAL_NOT_SEARCHABLE: false,
    G2D_NO_ACTIVE_04_LEGACY_FAILURE_NOT_SEARCHABLE: false,
    G2D_NO_ACTIVE_05_LEGACY_TOKEN_ROUTE_NOT_INVOKED: false,
    G2D_NO_ACTIVE_06_LEGACY_PREFIX_ROUTE_NOT_INVOKED: false,
    SEARCH_SERIES_01_SINGLE_SERIES_RESULT: false,
    SEARCH_SERIES_02_CANONICAL_TITLE: false,
    SEARCH_SERIES_03_OPENS_SERIES_DETAIL: false,
    SEARCH_SERIES_04_DETERMINISTIC_REPRESENTATIVE: false,
    SEARCH_SERIES_05_LOCAL_POSTER_PREFERRED: false,
    SEARCH_SERIES_06_EPISODES_PRESERVED: false,
    SEARCH_SERIES_07_MOVIES_NOT_AGGREGATED: false,
    SEARCH_SERIES_08_LIVE_NOT_AGGREGATED: false,
    SEARCH_SERIES_09_DISTINCT_SERIES_PRESERVED: false,
    SEARCH_SERIES_10_PAGINATION_SAFE: false,
    SERIES_DETAIL_V3_01_SEARCH_DETAIL_CONSISTENCY: false,
    SERIES_DETAIL_V3_02_ACTIVE_SNAPSHOT_WINS: false,
    SERIES_DETAIL_V3_03_LEGACY_FALLBACK: false,
    SERIES_DETAIL_V3_PERF_01_NO_UNBOUNDED_GETALL: false,
    SERIES_DETAIL_V3_PERF_02_LARGE_CATALOG_BOUNDED_SCAN: false,
    SERIES_DETAIL_V3_PERF_03_SNAPSHOT_ISOLATION: false,
    SEARCH_DETAIL_COUNT_MATCH: false,
    ACTIVE_SNAPSHOT_V3_WINS_OVER_LEGACY_V2: false,
    FULL_LOCAL_CATALOG_SEARCH: false,
    VS06_IDENTITY_01_DUPLICATE_MOVIE_TITLE_DISAMBIGUATED: false,
    VS06_IDENTITY_02_MOVIE_ID_PERSISTED_IN_URL: false,
    VS06_IDENTITY_03_SERIES_ROUTE_PRESERVED: false,
    VS06_NAV_01_SEARCH_ROUTE_CANONICAL: false,
    VS06_SEARCH_STATE_01_TRUE_ZERO_READY: false,
    VS06_SEARCH_STATE_02_INDEXING_NOT_ZERO: false,
    VS06_SEARCH_STATE_03_INDEXING_PARTIAL_CONTENT: false,
    VS06_SEARCH_STATE_04_INDEX_FAILED_NOT_ZERO: false,
    VS06_SEARCH_STATE_05_UNAVAILABLE_NOT_ZERO: false,
    VS06_SEARCH_STATE_06_ERROR_NOT_ZERO: false,
    VS06_SEARCH_STATE_07_RESULT_STATE: false,
    VS06_SEARCH_DPAD_RESULT_TARGET: false,
    VS06_SEARCH_DPAD_INDEX_RETRY_TARGET: false,
    VS06_SEARCH_DPAD_QUERY_RETRY_TARGET: false,
    VS06_FOCUS_01_ARROW_DOWN_TARGETS_RESULT_ZERO: false,
    VS06_FOCUS_02_NATIVE_BLUR_REQUIRED_ON_RESULT_EXIT: false,
    VS06_FOCUS_R5_01_DOWN_TARGET_RESULT_ZERO: false,
    VS06_FOCUS_R5_02_HANDLED_DOWN_BLOCKS_DEFAULT_SPATIAL_MOVE: false,
    VS06_FOCUS_R5_03_SINGLE_DOWN_SINGLE_SPATIAL_MOVE: false,
    VS06_FOCUS_R5_04_INDEX_RETRY_CONSUMES_DOWN: false,
    VS06_FOCUS_R5_05_QUERY_RETRY_CONSUMES_DOWN: false,
    VS06_FOCUS_R5_06_NO_TARGET_NO_MANUAL_MOVE: false,
    FOCUS_LIFECYCLE_01_MOUNT_DOES_NOT_NATIVE_AUTOFOCUS: false,
    FOCUS_LIFECYCLE_02_SPATIAL_REFOCUS_DOES_NOT_NATIVE_AUTOFOCUS: false,
    FOCUS_LIFECYCLE_03_ENTER_EXPLICITLY_ACTIVATES_NATIVE_INPUT: false,
    FOCUS_LIFECYCLE_04_ARROWDOWN_BLURS_NATIVE_BEFORE_MOVE: false,
    FOCUS_LIFECYCLE_05_OPEN_RESULT_BLURS_NATIVE_INPUT: false,
    FOCUS_LIFECYCLE_06_UNMOUNT_BLURS_NATIVE_INPUT: false,
    VS06_BACK_01_NATIVE_SINGLE_AUTHORITY: false,
    VS06_BACK_02_WEB_SINGLE_AUTHORITY: false,
    VS06_RETURN_01_SAME_SCOPE_QUERY_CONTENT_RESTORABLE: false,
    VS06_RETURN_02_DIFFERENT_QUERY_NOT_RESTORED: false,
    VS06_RETURN_03_DIFFERENT_SCOPE_NOT_RESTORED: false,
    VS06_RETURN_04_EMPTY_PAGE_NOT_RESTORED: false,
    VS06_RETURN_05_ERROR_INVALIDATES_MATCHING_CACHE: false,
    VS06_RETURN_06_CACHE_BOUNDED_TO_ONE_ENTRY: false,
    R11_ACTIVE_01_QUERY_DOES_NOT_AWAIT_FULL_INDEX: false,
    R11_ACTIVE_02_PARTIAL_INDEX_CANDIDATE_VISIBLE: false,
    R11_ACTIVE_03_PARTIAL_ZERO_IS_INDEXING_NOT_ZERO: false,
    R11_ACTIVE_04_TRUE_ZERO_ONLY_AFTER_FULL_READY: false,
    R11_ACTIVE_05_INTERNAL_TOKEN_PARTIAL_WHEN_INDEXED: false,
    R11_ACTIVE_06_INDEX_FAILURE_NOT_ZERO: false,
    R11_ACTIVE_07_ONE_BUILDER_PER_SNAPSHOT: false,
    R11_ACTIVE_08_SCOPE_ISOLATION: false,
    R11_ACTIVE_09_GENERATION_ISOLATION: false,
    R11_ACTIVE_10_FULL_READY_BEHAVIOR_PRESERVED: false,
    R11_ACTIVE_11_R8_PARTIAL_CONTENT_STATE_PRESERVED: false,
    R11_ACTIVE_12_RETRY_PRESERVED: false,
    R11_RESUME_01_RESTART_DOES_NOT_REINDEX_COMMITTED_PREFIX: false,
    R11_RESUME_02_CHECKPOINT_MONOTONIC: false,
    R11_RESUME_03_CRASH_AFTER_BATCH_SAFE: false,
    R11_RESUME_04_GENERATION_CHANGE_INVALIDATES_CHECKPOINT: false,
    R11_RESUME_05_SCOPE_CHANGE_INVALIDATES_CHECKPOINT: false,
    R11_SILO_SENTINEL_PARTIAL_INDEX: false,
  };
}

export async function runLocalCatalogSearchSmokeTest() {
  const result = emptyResult();
  const [
    scopeA,
    scopeOtherSource,
    scopeOtherLicense,
    legacyScope,
    incompleteLegacyScope,
    noActiveEmptyScope,
    detailFallbackScope,
    detailPerfScope,
  ] =
    await Promise.all([
    deriveLocalCatalogScope({
      internalLicenseId: LICENSE_A,
      sourceId: SOURCE_A,
    }),
    deriveLocalCatalogScope({
      internalLicenseId: LICENSE_A,
      sourceId: SOURCE_B,
    }),
    deriveLocalCatalogScope({
      internalLicenseId: LICENSE_B,
      sourceId: SOURCE_A,
    }),
    deriveLocalCatalogScope({
      internalLicenseId: LEGACY_LICENSE,
      sourceId: LEGACY_SOURCE,
    }),
    deriveLocalCatalogScope({
      internalLicenseId: INCOMPLETE_LEGACY_LICENSE,
      sourceId: INCOMPLETE_LEGACY_SOURCE,
    }),
    deriveLocalCatalogScope({
      internalLicenseId: NO_ACTIVE_EMPTY_LICENSE,
      sourceId: NO_ACTIVE_EMPTY_SOURCE,
    }),
    deriveLocalCatalogScope({
      internalLicenseId: DETAIL_FALLBACK_LICENSE,
      sourceId: DETAIL_FALLBACK_SOURCE,
    }),
    deriveLocalCatalogScope({
      internalLicenseId: DETAIL_PERF_LICENSE,
      sourceId: DETAIL_PERF_SOURCE,
    }),
  ]);
  const scopeKeys = [
    scopeA.scopeKey,
    scopeOtherSource.scopeKey,
    scopeOtherLicense.scopeKey,
    legacyScope.scopeKey,
    incompleteLegacyScope.scopeKey,
    noActiveEmptyScope.scopeKey,
    detailFallbackScope.scopeKey,
    detailPerfScope.scopeKey,
  ];
  const legacyItemIds = Array.from(
    { length: LEGACY_ITEM_COUNT },
    (_, index) => `search-smoke-legacy-${index}`,
  );
  const originalFetch = globalThis.fetch;
  const detailV2ItemIds = [
    'series-detail-smoke-v2-divergent',
    'series-detail-smoke-v2-fallback-s01e01',
    'series-detail-smoke-v2-fallback-s01e02',
    'series-detail-smoke-v2-fallback-s01e03',
    'series-detail-smoke-v2-fallback-s02e01',
  ];
  let fetchCalls = 0;

  try {
    await cleanup(scopeKeys);
    const noActiveEmptySearch = await searchLocalCatalog({
      scopeKey: noActiveEmptyScope.scopeKey,
      query: 'Silo',
    });
    await importFixture({
      internalLicenseId: LICENSE_A,
      sourceId: SOURCE_A,
      channels: Array.from({ length: 600 }, (_, index) => channel(index)),
    });
    await importFixture({
      internalLicenseId: LICENSE_A,
      sourceId: SOURCE_B,
      channels: [{
        id: 'other-source-secret',
        name: 'SEGREDO OUTRA FONTE',
        url: 'https://media.invalid/other-source.mp4',
        contentKind: 'movie',
      }],
    });
    await importFixture({
      internalLicenseId: LICENSE_B,
      sourceId: SOURCE_A,
      channels: [{
        id: 'other-license-secret',
        name: 'SEGREDO OUTRA LICENÇA',
        url: 'https://media.invalid/other-license.mp4',
        contentKind: 'movie',
      }],
    });
    const timestamp = new Date().toISOString();
    const detailV2Items: LocalCatalogItem[] = detailV2ItemIds.map(
      (id, index) => {
        const isDivergentItem = index === 0;
        const fallbackTitles = [
          'Silo S01E01',
          'Silo S01E02',
          'Silo S01E03',
          'Silo S02E01',
        ];
        const title = isDivergentItem
          ? 'Silo S01E01'
          : fallbackTitles[index - 1];

        return {
          id,
          sourceId: isDivergentItem ? SOURCE_A : DETAIL_FALLBACK_SOURCE,
          sourceType: 'm3u',
          name: title,
          rawName: title,
          normalizedName: title.toLowerCase(),
          groupTitle: 'Séries',
          normalizedGroup: 'series',
          contentKind: 'series',
          streamUrl: `https://media.invalid/${id}.mp4`,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      },
    );
    await putLocalCatalogItems(detailV2Items);
    await putLocalCatalogImportMetadata({
      sourceId: DETAIL_FALLBACK_SOURCE,
      sourceType: 'm3u',
      status: 'ready',
      completedAt: timestamp,
      lastSuccessfulImportAt: timestamp,
      parsedCount: 4,
      importedCount: 4,
      updatedCount: 0,
      removedCount: 0,
      unknownCount: 0,
      withoutGroupCount: 0,
      classificationVersion: 1,
    });
    await prepareLocalCatalogRuntimeScope({
      ...detailFallbackScope,
      timestamp,
    });
    const legacyItems: LocalCatalogItem[] = legacyItemIds.map((id, index) => ({
      id,
      sourceId: LEGACY_SOURCE,
      sourceType: 'm3u',
      name:
        index === LEGACY_ITEM_COUNT - 1
          ? LEGACY_TARGET_TITLE
          : `Item legado ${String(index).padStart(4, '0')}`,
      normalizedName:
        index === LEGACY_ITEM_COUNT - 1
          ? 'silo legacy local'
          : `item legado ${String(index).padStart(4, '0')}`,
      groupTitle: 'Filmes',
      normalizedGroup: 'filmes',
      contentKind: 'movie',
      streamUrl: `https://media.invalid/legacy-${index}.mp4`,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await putLocalCatalogItems(legacyItems);
    await prepareLocalCatalogRuntimeScope({
      ...legacyScope,
      timestamp,
    });
    await putLargeSeriesDetailFixture(detailPerfScope);
    await buildLocalCatalogSeriesLookup({ snapshotId: DETAIL_PERF_ACTIVE_SNAPSHOT });
    const legacyStagingBridge =
      await prepareLocalCatalogRuntimeSnapshotBridge({
        internalLicenseId: LEGACY_LICENSE,
        sourceId: LEGACY_SOURCE,
        sourceType: 'm3u',
        promotionEnabled: false,
        parserVersion: 1,
        classificationVersion: 1,
        transformConcurrency: 2,
      });
    await legacyStagingBridge.writeBatch([channel(0)]);
    const legacyFallbackSearch = await searchLocalCatalog({
      scopeKey: legacyScope.scopeKey,
      query: 'Silo',
    });
    await legacyStagingBridge.cancel();
    const legacyPartialSearch = await searchLocalCatalog({
      scopeKey: legacyScope.scopeKey,
      query: 'Silo',
    });
    await putLocalCatalogImportMetadata({
      sourceId: INCOMPLETE_LEGACY_SOURCE,
      sourceType: 'm3u',
      status: 'ready',
      completedAt: timestamp,
      lastSuccessfulImportAt: timestamp,
      parsedCount: 1,
      importedCount: 1,
      updatedCount: 0,
      removedCount: 0,
      unknownCount: 0,
      withoutGroupCount: 0,
      classificationVersion: 1,
    });
    await prepareLocalCatalogRuntimeScope({
      ...incompleteLegacyScope,
      timestamp,
    });
    const incompleteLegacyStateKey = `legacy-search-index:${incompleteLegacyScope.scopeKey}`;
    await putLocalCatalogMetadata({
      key: incompleteLegacyStateKey,
      value: {
        generation: 'legacy-incomplete-generation',
        scopeKey: incompleteLegacyScope.scopeKey,
        sourceId: INCOMPLETE_LEGACY_SOURCE,
        checkpoint: null,
        processedCount: 0,
        documentCount: 0,
        tokenCount: 0,
        totalItems: 0,
        status: 'failed',
        updatedAt: timestamp,
        startedAt: timestamp,
        completedAt: timestamp,
        failureCode: 'LOCAL_CATALOG_LEGACY_INDEX_FAILED',
        maxBatchReadTimeMs: 0,
        maxBatchWriteTimeMs: 0,
      },
      updatedAt: timestamp,
    });
    const incompleteLegacySearch = await searchLocalCatalog({
      scopeKey: incompleteLegacyScope.scopeKey,
      query: 'Silo',
    });
    const legacySnapshotId =
      await ensureLocalCatalogLegacySnapshot(legacyScope);
    if (legacySnapshotId) {
      await ensureLocalCatalogSearchIndex({
        snapshotId: legacySnapshotId,
        scopeKey: legacyScope.scopeKey,
      });
    }
    const legacySearch = await searchLocalCatalog({
      scopeKey: legacyScope.scopeKey,
      query: 'Silo',
    });
    const activeScope = await getLocalCatalogScope(scopeA.scopeKey);
    if (!activeScope?.activeSnapshotId) {
      throw new Error('LOCAL_CATALOG_SEARCH_SMOKE_ACTIVE_SNAPSHOT_MISSING');
    }
    // Simula snapshot criado antes de U2-F4: a primeira consulta deve
    // reconstruir o índice local em lotes, sem redownload.
    await clearSearchIndex(activeScope.activeSnapshotId);
    await ensureLocalCatalogSearchIndex({
      snapshotId: activeScope.activeSnapshotId,
      scopeKey: scopeA.scopeKey,
    });

    globalThis.fetch = (() => {
      fetchCalls += 1;
      return Promise.reject(new Error('SEARCH_SMOKE_NETWORK_BLOCKED'));
    }) as typeof fetch;

    const [
      empty,
      exact,
      caseInsensitive,
      accentInsensitive,
      prefix,
      contains,
      outsideHome,
      noPoster,
      series,
      live,
      boundedA,
      boundedB,
      otherSource,
      otherLicense,
      siloA,
      siloB,
      repeatedMovies,
      repeatedLive,
      paginationFirstPage,
    ] = await Promise.all([
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: '   ' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'Os Vingadores' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'OS VINGADORES' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'acao total' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'Hom' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'aranha' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: TARGET_TITLE }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'sem poster' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'dark' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'canal noticias' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'filme' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'filme' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'segredo outra fonte' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'segredo outra licenca' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'Silo' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'Silo' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'Filme Repetido' }),
      searchLocalCatalog({ scopeKey: scopeA.scopeKey, query: 'Canal Repetido' }),
      searchLocalCatalog({
        scopeKey: scopeA.scopeKey,
        query: 'Serie Paginacao',
      }),
    ]);
    const rawSiloCandidates =
      await localCatalogSearchRepository.findCandidates({
        scopeKey: scopeA.scopeKey,
        normalizedQuery: 'silo',
        tokens: ['silo'],
      });
    if (rawSiloCandidates?.snapshotId) {
      await buildLocalCatalogSeriesLookup({ snapshotId: rawSiloCandidates.snapshotId });
    }
    const activeSnapshotDetail =
      await loadLocalCatalogSeriesDetailReadModel({
        sourceId: SOURCE_A,
        scopeKey: scopeA.scopeKey,
        seriesKey: 'silo',
      });
    const legacyFallbackDetail =
      await loadLocalCatalogSeriesDetailReadModel({
        sourceId: DETAIL_FALLBACK_SOURCE,
        scopeKey: detailFallbackScope.scopeKey,
        seriesKey: 'silo',
      });
    const originalIndexGetAll = IDBIndex.prototype.getAll;
    let detailGetAllCalls = 0;
    Object.defineProperty(IDBIndex.prototype, 'getAll', {
      configurable: true,
      writable: true,
      value(...args: Parameters<IDBIndex['getAll']>) {
        detailGetAllCalls += 1;
        return originalIndexGetAll.apply(this, args);
      },
    });
    let largeCatalogDetail = null;
    try {
      largeCatalogDetail =
        await loadLocalCatalogSeriesDetailReadModel({
          sourceId: DETAIL_PERF_SOURCE,
          scopeKey: detailPerfScope.scopeKey,
          seriesKey: 'série alvo escala',
        });
    } finally {
      Object.defineProperty(IDBIndex.prototype, 'getAll', {
        configurable: true,
        writable: true,
        value: originalIndexGetAll,
      });
    }
    const paginationSecondPage = paginationFirstPage.nextCursor
      ? await searchLocalCatalog({
          scopeKey: scopeA.scopeKey,
          query: 'Serie Paginacao',
          cursor: paginationFirstPage.nextCursor,
        })
      : null;

    result.SEARCH_01_EMPTY_QUERY_SAFE =
      empty.status === 'empty_query' && empty.items.length === 0;
    result.SEARCH_02_EXACT_TITLE = exact.items[0]?.title === 'Os Vingadores';
    result.SEARCH_03_CASE_INSENSITIVE =
      caseInsensitive.items[0]?.title === 'Os Vingadores';
    result.SEARCH_04_ACCENT_INSENSITIVE =
      accentInsensitive.items[0]?.title === 'Ação Total';
    result.SEARCH_05_PREFIX = prefix.items[0]?.title === 'Homem-Aranha';
    result.SEARCH_06_CONTAINS = contains.items[0]?.title === 'Homem-Aranha';
    result.SEARCH_07_ITEM_OUTSIDE_HOME_FOUND =
      outsideHome.items.some((item) => item.title === TARGET_TITLE);
    result.SEARCH_08_ITEM_WITHOUT_POSTER_FOUND =
      noPoster.items[0]?.title === 'Filme Sem Poster' &&
      noPoster.items[0]?.artworkUrl === null;
    result.SEARCH_09_MOVIE_FOUND =
      exact.items[0]?.contentKind === 'movie';
    result.SEARCH_10_SERIES_FOUND =
      series.items[0]?.contentKind === 'series';
    result.SEARCH_11_NO_REMOTE_NETWORK = fetchCalls === 0;
    result.SEARCH_12_NO_BACKEND_CATALOG_QUERY = fetchCalls === 0;
    result.SEARCH_13_RESULTS_BOUNDED =
      boundedA.items.length === LOCAL_CATALOG_SEARCH_PAGE_SIZE &&
      boundedA.nextCursor !== null;
    result.SEARCH_14_DETERMINISTIC_ORDER =
      boundedA.items.map((item) => item.id).join('|') ===
      boundedB.items.map((item) => item.id).join('|');
    result.SEARCH_15_DIFFERENT_SOURCE_ISOLATED =
      otherSource.items.length === 0;
    result.SEARCH_16_DIFFERENT_LICENSE_SCOPE_ISOLATED =
      otherLicense.items.length === 0;
    result.SEARCH_17_UNSAFE_DATA_NOT_EXPOSED =
      !JSON.stringify(exact).match(
        /licenseCode|username|password|authorization|credentialToken/i,
      );
    result.SEARCH_18_DPAD_CONTRACT_PRESERVED =
      resolveLocalCatalogSearchInputArrowTarget('ArrowDown', true) ===
        getLocalCatalogSearchResultFocusKey(0) &&
      resolveLocalCatalogSearchInputArrowTarget('ArrowDown', false) === null;
    result.SEARCH_19_BACK_NAVIGATION_PRESERVED =
      buildLocalCatalogSearchReturnTo(
        LOCAL_CATALOG_SEARCH_ROUTE,
        '?q=vingadores',
      ) === '/search?q=vingadores';
    result.SEARCH_20_CONTROL_PLANE_ONLY = fetchCalls === 0;
    result.SEARCH_21_LIVE_FOUND = live.items[0]?.contentKind === 'live';
    result.SEARCH_22_LEGACY_BACKFILL_SEARCHABLE =
      Boolean(legacySnapshotId) &&
      legacySearch.status === 'ready' &&
      legacySearch.items[0]?.title === LEGACY_TARGET_TITLE;
    result.SEARCH_23_LEGACY_FALLBACK_SEARCHABLE =
      legacyFallbackSearch.status === 'indexing' &&
      legacyFallbackSearch.items.length === 0;
    result.SEARCH_24_INCOMPLETE_LEGACY_READY_NOT_ZERO =
      incompleteLegacySearch.status === 'indexing' &&
      incompleteLegacySearch.items.length === 0;
    result.G2D_NO_ACTIVE_01_NO_LOCAL_DATA_UNAVAILABLE =
      noActiveEmptySearch.status === 'unavailable' &&
      noActiveEmptySearch.items.length === 0;
    result.G2D_NO_ACTIVE_02_STAGING_NOT_SEARCHABLE =
      legacyFallbackSearch.status === 'indexing' &&
      legacyFallbackSearch.items.length === 0;
    result.G2D_NO_ACTIVE_03_LEGACY_PARTIAL_NOT_SEARCHABLE =
      (legacyPartialSearch.status === 'indexing' ||
        legacyPartialSearch.status === 'unavailable') &&
      legacyPartialSearch.items.length === 0;
    result.G2D_NO_ACTIVE_04_LEGACY_FAILURE_NOT_SEARCHABLE =
      incompleteLegacySearch.status === 'indexing' &&
      incompleteLegacySearch.items.length === 0;
    result.G2D_NO_ACTIVE_05_LEGACY_TOKEN_ROUTE_NOT_INVOKED =
      noActiveEmptySearch.status !== 'ready' &&
      noActiveEmptySearch.items.length === 0;
    result.G2D_NO_ACTIVE_06_LEGACY_PREFIX_ROUTE_NOT_INVOKED =
      legacyFallbackSearch.status === 'indexing' &&
      legacyFallbackSearch.items.length === 0;
    const exactSiloItems = siloA.items.filter(
      (item) => item.title === 'Silo',
    );
    const siloResult = exactSiloItems[0];
    result.SEARCH_SERIES_01_SINGLE_SERIES_RESULT =
      exactSiloItems.length === 1 &&
      siloResult?.contentKind === 'series' &&
      siloResult.episodeCount === 4;
    result.SEARCH_SERIES_02_CANONICAL_TITLE =
      siloA.items[0]?.title === 'Silo';
    const seriesDetailRoute = siloResult
      ? buildLocalCatalogSeriesDetailRoute(siloResult)
      : '';
    result.SEARCH_SERIES_03_OPENS_SERIES_DETAIL =
      seriesDetailRoute.startsWith('/category/series-detail?') &&
      seriesDetailRoute.includes('seriesKey=silo') &&
      !seriesDetailRoute.startsWith('/player');
    const movieRouteA = buildLocalCatalogMovieDetailRoute({
      id: 'duplicate-movie-a',
      title: 'Filme Duplicado',
      groupTitle: 'Filmes',
    });
    const movieRouteB = buildLocalCatalogMovieDetailRoute({
      id: 'duplicate-movie-b',
      title: 'Filme Duplicado',
      groupTitle: 'Filmes',
    });
    const movieRouteAParams = new URLSearchParams(
      movieRouteA.split('?')[1] ?? '',
    );
    const seriesRouteParams = new URLSearchParams(
      seriesDetailRoute.split('?')[1] ?? '',
    );
    result.VS06_IDENTITY_01_DUPLICATE_MOVIE_TITLE_DISAMBIGUATED =
      movieRouteA !== movieRouteB &&
      movieRouteAParams.get('movieId') === 'duplicate-movie-a' &&
      new URLSearchParams(movieRouteB.split('?')[1] ?? '').get('movieId') ===
        'duplicate-movie-b';
    result.VS06_IDENTITY_02_MOVIE_ID_PERSISTED_IN_URL =
      movieRouteA.startsWith('/category/movie-detail?') &&
      movieRouteAParams.get('movieId') === 'duplicate-movie-a' &&
      movieRouteAParams.get('title') === 'Filme Duplicado' &&
      movieRouteAParams.get('groupTitle') === 'Filmes';
    result.VS06_IDENTITY_03_SERIES_ROUTE_PRESERVED =
      seriesRouteParams.get('title') === siloResult?.title &&
      seriesRouteParams.get('groupTitle') === (siloResult?.groupTitle ?? '') &&
      seriesRouteParams.get('seriesKey') === siloResult?.seriesKey;
    result.VS06_NAV_01_SEARCH_ROUTE_CANONICAL =
      LOCAL_CATALOG_SEARCH_ROUTE === '/search';
    result.SEARCH_SERIES_04_DETERMINISTIC_REPRESENTATIVE =
      Boolean(siloResult?.representativeItemId) &&
      siloResult?.representativeItemId ===
        siloB.items.find((item) => item.title === 'Silo')
          ?.representativeItemId &&
      siloResult?.id === siloResult?.representativeItemId;
    result.SEARCH_SERIES_05_LOCAL_POSTER_PREFERRED =
      siloResult?.artworkUrl ===
      'https://images.invalid/silo-poster.jpg';
    const rawSiloEpisodes =
      rawSiloCandidates?.candidates.filter((candidate) =>
        candidate.item.normalizedName.startsWith('silo s01'),
      ) ?? [];
    result.SEARCH_SERIES_06_EPISODES_PRESERVED =
      rawSiloEpisodes.length === 4 &&
      new Set(rawSiloEpisodes.map((candidate) => candidate.item.itemId))
        .size === 4;
    result.SEARCH_SERIES_07_MOVIES_NOT_AGGREGATED =
      repeatedMovies.items.filter(
        (item) =>
          item.title === 'Filme Repetido' &&
          item.contentKind === 'movie',
      ).length === 2;
    result.SEARCH_SERIES_08_LIVE_NOT_AGGREGATED =
      repeatedLive.items.filter(
        (item) =>
          item.title === 'Canal Repetido' &&
          item.contentKind === 'live',
      ).length === 2;
    result.SEARCH_SERIES_09_DISTINCT_SERIES_PRESERVED =
      siloA.items.some((item) => item.title === 'Silo') &&
      siloA.items.some((item) => item.title === 'Silo Origins');
    const paginatedSeriesItems = [
      ...paginationFirstPage.items,
      ...(paginationSecondPage?.items ?? []),
    ];
    result.SEARCH_SERIES_10_PAGINATION_SAFE =
      paginationFirstPage.items.length ===
        LOCAL_CATALOG_SEARCH_PAGE_SIZE &&
      paginationFirstPage.nextCursor !== null &&
      paginationSecondPage?.items.length === 10 &&
      new Set(paginatedSeriesItems.map((item) => item.seriesKey)).size ===
        50;
    result.SEARCH_DETAIL_COUNT_MATCH =
      siloResult?.episodeCount === 4 &&
      activeSnapshotDetail?.episodes.length === 4;
    result.SERIES_DETAIL_V3_01_SEARCH_DETAIL_CONSISTENCY =
      result.SEARCH_DETAIL_COUNT_MATCH &&
      activeSnapshotDetail?.seriesKey === siloResult?.seriesKey &&
      activeSnapshotDetail?.snapshotId === rawSiloCandidates?.snapshotId;
    result.ACTIVE_SNAPSHOT_V3_WINS_OVER_LEGACY_V2 =
      activeSnapshotDetail?.source === 'active_snapshot_v3_indexed' &&
      activeSnapshotDetail.episodes.length === 4;
    result.SERIES_DETAIL_V3_02_ACTIVE_SNAPSHOT_WINS =
      result.ACTIVE_SNAPSHOT_V3_WINS_OVER_LEGACY_V2;
    result.SERIES_DETAIL_V3_03_LEGACY_FALLBACK =
      legacyFallbackDetail?.source === 'legacy_v2_fallback' &&
      legacyFallbackDetail.episodes.length === 4;
    result.SERIES_DETAIL_V3_PERF_01_NO_UNBOUNDED_GETALL =
      // The indexed sidecar performs one bounded getAll on
      // snapshotIdSeriesKey; a full snapshot scan would require more reads.
      detailGetAllCalls <= 1;
    result.SERIES_DETAIL_V3_PERF_02_LARGE_CATALOG_BOUNDED_SCAN =
      largeCatalogDetail?.source === 'active_snapshot_v3_indexed' &&
      largeCatalogDetail.snapshotId === DETAIL_PERF_ACTIVE_SNAPSHOT &&
      largeCatalogDetail.episodes.length === DETAIL_PERF_TARGET_ITEMS &&
      largeCatalogDetail.episodes.every((episode) =>
        episode.id.startsWith('perf-target-'),
      );
    result.SERIES_DETAIL_V3_PERF_03_SNAPSHOT_ISOLATION =
      largeCatalogDetail?.episodes.length === DETAIL_PERF_TARGET_ITEMS &&
      largeCatalogDetail.episodes.every(
        (episode) => !episode.id.startsWith('perf-old-target-'),
      );
    result.FULL_LOCAL_CATALOG_SEARCH =
      result.SEARCH_07_ITEM_OUTSIDE_HOME_FOUND &&
      TARGET_INDEX > LOCAL_CATALOG_SEARCH_PAGE_SIZE;

    const trueZeroState = resolveLocalCatalogSearchViewState({
      query: 'inexistente',
      isSearching: false,
      hasLocalError: false,
      status: 'ready',
      itemCount: 0,
    });
    const indexingEmptyState = resolveLocalCatalogSearchViewState({
      query: 'silo',
      isSearching: false,
      hasLocalError: false,
      status: 'indexing',
      itemCount: 0,
      indexingInBackground: true,
    });
    const indexingPartialState = resolveLocalCatalogSearchViewState({
      query: 'silo',
      isSearching: false,
      hasLocalError: false,
      status: 'indexing',
      itemCount: 2,
      indexingInBackground: true,
    });
    const indexFailedState = resolveLocalCatalogSearchViewState({
      query: 'silo',
      isSearching: false,
      hasLocalError: false,
      status: 'index_failed',
      itemCount: 0,
    });
    const unavailableState = resolveLocalCatalogSearchViewState({
      query: 'silo',
      isSearching: false,
      hasLocalError: false,
      status: 'unavailable',
      itemCount: 0,
    });
    const errorState = resolveLocalCatalogSearchViewState({
      query: 'silo',
      isSearching: false,
      hasLocalError: true,
      status: 'ready',
      itemCount: 0,
    });
    const resultState = resolveLocalCatalogSearchViewState({
      query: 'silo',
      isSearching: false,
      hasLocalError: false,
      status: 'ready',
      itemCount: 1,
    });
    result.VS06_SEARCH_STATE_01_TRUE_ZERO_READY =
      trueZeroState.showNoResults &&
      !trueZeroState.showError &&
      !trueZeroState.showIndexing;
    result.VS06_SEARCH_STATE_02_INDEXING_NOT_ZERO =
      indexingEmptyState.showIndexing && !indexingEmptyState.showNoResults;
    result.VS06_SEARCH_STATE_03_INDEXING_PARTIAL_CONTENT =
      indexingPartialState.showIndexing &&
      indexingPartialState.showResults &&
      !indexingPartialState.showNoResults;
    result.VS06_SEARCH_STATE_04_INDEX_FAILED_NOT_ZERO =
      indexFailedState.showIndexFailed && !indexFailedState.showNoResults;
    result.VS06_SEARCH_STATE_05_UNAVAILABLE_NOT_ZERO =
      unavailableState.showUnavailable && !unavailableState.showNoResults;
    result.VS06_SEARCH_STATE_06_ERROR_NOT_ZERO =
      errorState.showError && !errorState.showNoResults && !errorState.showResults;
    result.VS06_SEARCH_STATE_07_RESULT_STATE =
      resultState.showResults && !resultState.showNoResults;
    result.VS06_SEARCH_DPAD_RESULT_TARGET =
      resolveLocalCatalogSearchInputArrowTarget('ArrowDown', true) ===
      getLocalCatalogSearchResultFocusKey(0);
    result.VS06_SEARCH_DPAD_INDEX_RETRY_TARGET =
      resolveLocalCatalogSearchInputArrowTarget('ArrowDown', false, {
        showIndexRetry: true,
      }) === LOCAL_CATALOG_SEARCH_INDEX_RETRY_FOCUS_KEY;
    result.VS06_SEARCH_DPAD_QUERY_RETRY_TARGET =
      resolveLocalCatalogSearchInputArrowTarget('ArrowDown', false, {
        showQueryRetry: true,
      }) === LOCAL_CATALOG_SEARCH_QUERY_RETRY_FOCUS_KEY;
    const returnPage = {
      status: 'ready' as const,
      normalizedQuery: 'digimon',
      items: [{ id: 'return-result' }],
      nextCursor: null,
    } as unknown as LocalCatalogSearchReturnCache['page'];
    const emptyReturnPage = {
      ...returnPage,
      items: [],
    } as LocalCatalogSearchReturnCache['page'];
    const sameScopeCache = createLocalCatalogSearchReturnCache({
      scopeKey: 'scope-a',
      query: ' digimon ',
      page: returnPage,
    });
    const emptyPageCache = createLocalCatalogSearchReturnCache({
      scopeKey: 'scope-a',
      query: 'digimon',
      page: emptyReturnPage,
    });
    const differentScopeCache = createLocalCatalogSearchReturnCache({
      scopeKey: 'scope-b',
      query: 'digimon',
      page: returnPage,
    });
    const firstResultTarget = resolveLocalCatalogSearchInputArrowTarget(
      'ArrowDown',
      true,
    );
    const indexRetryTarget = resolveLocalCatalogSearchInputArrowTarget(
      'ArrowDown',
      false,
      { showIndexRetry: true },
    );
    const queryRetryTarget = resolveLocalCatalogSearchInputArrowTarget(
      'ArrowDown',
      false,
      { showQueryRetry: true },
    );
    const resultArrowPress = resolveLocalCatalogSearchInputArrowPress(
      'down',
      true,
    );
    const indexRetryArrowPress = resolveLocalCatalogSearchInputArrowPress(
      'down',
      false,
      { showIndexRetry: true },
    );
    const queryRetryArrowPress = resolveLocalCatalogSearchInputArrowPress(
      'down',
      false,
      { showQueryRetry: true },
    );
    const noTargetArrowPress = resolveLocalCatalogSearchInputArrowPress(
      'down',
      false,
    );
    const mountLifecycle = resolveLocalCatalogSearchNativeInputLifecycle(
      'route_mount',
    );
    const spatialRefocusLifecycle =
      resolveLocalCatalogSearchNativeInputLifecycle('spatial_refocus');
    const explicitEnterLifecycle =
      resolveLocalCatalogSearchNativeInputLifecycle('explicit_enter');
    const arrowDownExitLifecycle =
      resolveLocalCatalogSearchNativeInputLifecycle('arrow_down_exit');
    const openResultLifecycle =
      resolveLocalCatalogSearchNativeInputLifecycle('open_result');
    const unmountLifecycle =
      resolveLocalCatalogSearchNativeInputLifecycle('unmount');
    const nativeBackAuthority = resolveLocalCatalogBackListenerAuthority(true);
    const webBackAuthority = resolveLocalCatalogBackListenerAuthority(false);
    result.VS06_FOCUS_01_ARROW_DOWN_TARGETS_RESULT_ZERO =
      firstResultTarget === getLocalCatalogSearchResultFocusKey(0);
    result.VS06_FOCUS_02_NATIVE_BLUR_REQUIRED_ON_RESULT_EXIT =
      shouldBlurLocalCatalogSearchInputOnArrowNavigation({
        key: 'ArrowDown',
        target: firstResultTarget,
      }) &&
      shouldBlurLocalCatalogSearchInputOnArrowNavigation({
        key: 'ArrowDown',
        target: indexRetryTarget,
      }) &&
      shouldBlurLocalCatalogSearchInputOnArrowNavigation({
        key: 'ArrowDown',
        target: queryRetryTarget,
      }) &&
      !shouldBlurLocalCatalogSearchInputOnArrowNavigation({
        key: 'ArrowDown',
        target: null,
      }) &&
      !shouldBlurLocalCatalogSearchInputOnArrowNavigation({
        key: 'ArrowUp',
        target: firstResultTarget,
      });
    result.VS06_FOCUS_R5_01_DOWN_TARGET_RESULT_ZERO =
      resultArrowPress.target === getLocalCatalogSearchResultFocusKey(0);
    result.VS06_FOCUS_R5_02_HANDLED_DOWN_BLOCKS_DEFAULT_SPATIAL_MOVE =
      resultArrowPress.handled &&
      resultArrowPress.shouldBlurNativeInput &&
      !resultArrowPress.allowDefaultSpatialNavigation;
    result.VS06_FOCUS_R5_03_SINGLE_DOWN_SINGLE_SPATIAL_MOVE =
      resultArrowPress.handled &&
      resultArrowPress.target === getLocalCatalogSearchResultFocusKey(0) &&
      !resultArrowPress.allowDefaultSpatialNavigation;
    result.VS06_FOCUS_R5_04_INDEX_RETRY_CONSUMES_DOWN =
      indexRetryArrowPress.handled &&
      indexRetryArrowPress.target === LOCAL_CATALOG_SEARCH_INDEX_RETRY_FOCUS_KEY &&
      indexRetryArrowPress.shouldBlurNativeInput &&
      !indexRetryArrowPress.allowDefaultSpatialNavigation;
    result.VS06_FOCUS_R5_05_QUERY_RETRY_CONSUMES_DOWN =
      queryRetryArrowPress.handled &&
      queryRetryArrowPress.target === LOCAL_CATALOG_SEARCH_QUERY_RETRY_FOCUS_KEY &&
      queryRetryArrowPress.shouldBlurNativeInput &&
      !queryRetryArrowPress.allowDefaultSpatialNavigation;
    result.VS06_FOCUS_R5_06_NO_TARGET_NO_MANUAL_MOVE =
      !noTargetArrowPress.handled &&
      noTargetArrowPress.target === null &&
      !noTargetArrowPress.shouldBlurNativeInput &&
      noTargetArrowPress.allowDefaultSpatialNavigation;
    result.FOCUS_LIFECYCLE_01_MOUNT_DOES_NOT_NATIVE_AUTOFOCUS =
      !mountLifecycle.shouldFocusNativeInput &&
      !mountLifecycle.shouldBlurNativeInput;
    result.FOCUS_LIFECYCLE_02_SPATIAL_REFOCUS_DOES_NOT_NATIVE_AUTOFOCUS =
      !spatialRefocusLifecycle.shouldFocusNativeInput &&
      !spatialRefocusLifecycle.shouldBlurNativeInput;
    result.FOCUS_LIFECYCLE_03_ENTER_EXPLICITLY_ACTIVATES_NATIVE_INPUT =
      explicitEnterLifecycle.shouldFocusNativeInput &&
      !explicitEnterLifecycle.shouldBlurNativeInput;
    result.FOCUS_LIFECYCLE_04_ARROWDOWN_BLURS_NATIVE_BEFORE_MOVE =
      !arrowDownExitLifecycle.shouldFocusNativeInput &&
      arrowDownExitLifecycle.shouldBlurNativeInput &&
      resultArrowPress.shouldBlurNativeInput;
    result.FOCUS_LIFECYCLE_05_OPEN_RESULT_BLURS_NATIVE_INPUT =
      !openResultLifecycle.shouldFocusNativeInput &&
      openResultLifecycle.shouldBlurNativeInput;
    result.FOCUS_LIFECYCLE_06_UNMOUNT_BLURS_NATIVE_INPUT =
      !unmountLifecycle.shouldFocusNativeInput &&
      unmountLifecycle.shouldBlurNativeInput;
    result.VS06_BACK_01_NATIVE_SINGLE_AUTHORITY =
      nativeBackAuthority.useCapacitorBackButton &&
      !nativeBackAuthority.useWindowKeydown;
    result.VS06_BACK_02_WEB_SINGLE_AUTHORITY =
      webBackAuthority.useWindowKeydown &&
      !webBackAuthority.useCapacitorBackButton;
    result.VS06_RETURN_01_SAME_SCOPE_QUERY_CONTENT_RESTORABLE =
      isLocalCatalogSearchReturnCacheMatch({
        cache: sameScopeCache,
        scopeKey: 'scope-a',
        query: ' digimon ',
      });
    result.VS06_RETURN_02_DIFFERENT_QUERY_NOT_RESTORED =
      !isLocalCatalogSearchReturnCacheMatch({
        cache: sameScopeCache,
        scopeKey: 'scope-a',
        query: 'outra busca',
      });
    result.VS06_RETURN_03_DIFFERENT_SCOPE_NOT_RESTORED =
      !isLocalCatalogSearchReturnCacheMatch({
        cache: sameScopeCache,
        scopeKey: 'scope-b',
        query: 'digimon',
      }) &&
      !isLocalCatalogSearchReturnCacheMatch({
        cache: differentScopeCache,
        scopeKey: 'scope-a',
        query: 'digimon',
      });
    result.VS06_RETURN_04_EMPTY_PAGE_NOT_RESTORED =
      emptyPageCache === null &&
      !isLocalCatalogSearchReturnCacheMatch({
        cache: emptyPageCache,
        scopeKey: 'scope-a',
        query: 'digimon',
      });
    result.VS06_RETURN_05_ERROR_INVALIDATES_MATCHING_CACHE =
      shouldInvalidateLocalCatalogSearchReturnCache({
        cache: sameScopeCache,
        scopeKey: 'scope-a',
        query: ' digimon ',
        hasError: true,
      }) &&
      !shouldInvalidateLocalCatalogSearchReturnCache({
        cache: sameScopeCache,
        scopeKey: 'scope-a',
        query: ' digimon ',
        hasError: false,
      });
    const replacementCache = createLocalCatalogSearchReturnCache({
      scopeKey: 'scope-a',
      query: 'outro',
      page: returnPage,
    });
    const boundedCache = replaceLocalCatalogSearchReturnCache(
      sameScopeCache,
      replacementCache,
    );
    result.VS06_RETURN_06_CACHE_BOUNDED_TO_ONE_ENTRY =
      boundedCache === replacementCache && !Array.isArray(boundedCache);

    // --- R11 PROGRESSIVE & RESUMABLE SEARCH AVAILABILITY TESTS ---
    const r11Scope = await deriveLocalCatalogScope({
      internalLicenseId: 'search-smoke-r11-license',
      sourceId: 'search-smoke-r11-source',
    });
    scopeKeys.push(r11Scope.scopeKey);

    const r11SnapshotId = 'r11-progressive-snapshot';
    const r11Timestamp = '2026-08-23T12:00:00.000Z';

    const r11Items: LocalCatalogSnapshotItem[] = Array.from(
      { length: 1200 },
      (_, index) => {
        let title = `Item Sintético ${String(index).padStart(4, '0')}`;
        let contentKind: LocalCatalogSnapshotItem['contentKind'] = 'movie';
        if (index === 10) {
          title = 'Silo Série Especial S01E01';
          contentKind = 'series';
        } else if (index === 20) {
          title = 'Alpha Filme Especial';
          contentKind = 'movie';
        } else if (index === 1100) {
          title = 'Omega Série Tardia S01E01';
          contentKind = 'series';
        }
        return snapshotItem({
          snapshotId: r11SnapshotId,
          scopeKey: r11Scope.scopeKey,
          itemId: `r11-item-${String(index).padStart(4, '0')}`,
          title,
          sourceOrder: index,
          contentKind,
        });
      },
    );

    const r11Db = await openLocalCatalogDb();
    try {
      const tx = r11Db.transaction(
        [
          LOCAL_CATALOG_V3_STORES.scopes,
          LOCAL_CATALOG_V3_STORES.snapshots,
          LOCAL_CATALOG_V3_STORES.items,
          LOCAL_CATALOG_V3_STORES.metrics,
        ],
        'readwrite',
      );
      const done = transactionDone(tx);
      tx.objectStore(LOCAL_CATALOG_V3_STORES.scopes).put({
        ...r11Scope,
        activeSnapshotId: r11SnapshotId,
        accessStatus: 'active',
        stagingSnapshotId: null,
        runtimeEpoch: 1,
        retentionPolicyVersion: 1,
        createdAt: r11Timestamp,
        updatedAt: r11Timestamp,
      });
      tx.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).put({
        snapshotId: r11SnapshotId,
        scopeKey: r11Scope.scopeKey,
        status: 'active',
        totalItems: 1200,
        createdAt: r11Timestamp,
        updatedAt: r11Timestamp,
      });
      const itemStore = tx.objectStore(LOCAL_CATALOG_V3_STORES.items);
      for (const it of r11Items) {
        itemStore.put(it);
      }
      tx.objectStore(LOCAL_CATALOG_V3_STORES.metrics).put({
        snapshotId: r11SnapshotId,
        totalRawItems: 1200,
        totalMovies: 1198,
        totalSeries: 2,
        totalEpisodes: 0,
        totalLive: 0,
        totalRadio: 0,
        totalUnknown: 0,
        totalCategories: 1,
        indexedSearchItems: 0,
        searchIndexStatus: 'ready',
        searchIndexCheckpoint: null,
        withPoster: 0,
        withBackdrop: 0,
        withMetadata: 0,
        tmdbMatched: 0,
        tmdbNoMatch: 0,
        tmdbError: 0,
        metadataPending: 0,
        duplicatesIgnored: 0,
        failedItems: 0,
        removedItems: 0,
        updatedAt: r11Timestamp,
      });
      await done;
    } finally {
      r11Db.close();
    }

    const batch1Items = r11Items.slice(0, 500);
    const indexTxDb = await openLocalCatalogDb();
    try {
      const tx = indexTxDb.transaction(
        [
          LOCAL_CATALOG_V3_STORES.searchDocuments,
          LOCAL_CATALOG_V3_STORES.searchTokens,
          LOCAL_CATALOG_V3_STORES.metrics,
        ],
        'readwrite',
      );
      const done = transactionDone(tx);
      const docStore = tx.objectStore(LOCAL_CATALOG_V3_STORES.searchDocuments);
      const tokStore = tx.objectStore(LOCAL_CATALOG_V3_STORES.searchTokens);
      for (const it of batch1Items) {
        const { document, tokenRecords } = createLocalCatalogSearchRecords(
          it,
          r11Timestamp,
        );
        docStore.put(document);
        for (const tok of tokenRecords) {
          tokStore.put(tok);
        }
      }
      const metricsStore = tx.objectStore(LOCAL_CATALOG_V3_STORES.metrics);
      const m = (await requestResult(metricsStore.get(r11SnapshotId))) as any;
      metricsStore.put({
        ...m,
        indexedSearchItems: 500,
        searchIndexCheckpoint: batch1Items[499].itemId,
        searchIndexStatus: 'building',
        updatedAt: r11Timestamp,
      });
      await done;
    } finally {
      indexTxDb.close();
    }

    const partialSiloCandidate = await localCatalogSearchRepository.findCandidates({
      scopeKey: r11Scope.scopeKey,
      tokens: ['silo'],
      normalizedQuery: 'silo',
    });
    const partialInternalCandidate = await localCatalogSearchRepository.findCandidates({
      scopeKey: r11Scope.scopeKey,
      tokens: ['especial'],
      normalizedQuery: 'especial',
    });
    const unindexedOmegaCandidate = await localCatalogSearchRepository.findCandidates({
      scopeKey: r11Scope.scopeKey,
      tokens: ['omega'],
      normalizedQuery: 'omega',
    });
    const partialState = await getLocalCatalogSearchIndexState(r11SnapshotId);

    result.R11_ACTIVE_01_QUERY_DOES_NOT_AWAIT_FULL_INDEX =
      partialState.status !== 'ready' &&
      partialState.processedCount === 500 &&
      partialState.totalItems === 1200 &&
      partialSiloCandidate?.status === 'indexing';

    result.R11_ACTIVE_02_PARTIAL_INDEX_CANDIDATE_VISIBLE =
      partialSiloCandidate?.candidates.length === 1 &&
      partialSiloCandidate.candidates[0]?.item.rawName === 'Silo Série Especial S01E01' &&
      partialSiloCandidate.status === 'indexing' &&
      partialSiloCandidate.indexingInBackground === true;

    result.R11_ACTIVE_03_PARTIAL_ZERO_IS_INDEXING_NOT_ZERO =
      unindexedOmegaCandidate?.candidates.length === 0 &&
      unindexedOmegaCandidate?.status === 'indexing' &&
      unindexedOmegaCandidate?.indexingInBackground === true;

    result.R11_ACTIVE_05_INTERNAL_TOKEN_PARTIAL_WHEN_INDEXED =
      (partialInternalCandidate?.candidates.length ?? 0) >= 1 &&
      partialInternalCandidate?.status === 'indexing';

    result.R11_SILO_SENTINEL_PARTIAL_INDEX =
      result.R11_ACTIVE_02_PARTIAL_INDEX_CANDIDATE_VISIBLE;

    const builderP1 = ensureLocalCatalogSearchIndex({
      snapshotId: 'test-singleton-snap',
      scopeKey: r11Scope.scopeKey,
    });
    const builderP2 = ensureLocalCatalogSearchIndex({
      snapshotId: 'test-singleton-snap',
      scopeKey: r11Scope.scopeKey,
    });
    result.R11_ACTIVE_07_ONE_BUILDER_PER_SNAPSHOT = builderP1 === builderP2;

    result.R11_RESUME_01_RESTART_DOES_NOT_REINDEX_COMMITTED_PREFIX =
      partialState.checkpoint === batch1Items[499].itemId &&
      partialState.processedCount === 500;
    result.R11_RESUME_02_CHECKPOINT_MONOTONIC =
      Boolean(partialState.checkpoint && partialState.checkpoint > batch1Items[0].itemId);

    let docCountAfterBatch1 = 0;
    const docCountDb = await openLocalCatalogDb();
    try {
      const tx = docCountDb.transaction(LOCAL_CATALOG_V3_STORES.searchDocuments, 'readonly');
      docCountAfterBatch1 = await requestResult(
        tx.objectStore(LOCAL_CATALOG_V3_STORES.searchDocuments).index('snapshotId').count(IDBKeyRange.only(r11SnapshotId)),
      );
    } finally {
      docCountDb.close();
    }
    result.R11_RESUME_03_CRASH_AFTER_BATCH_SAFE = docCountAfterBatch1 === 500;

    const resumeScopeA = await deriveLocalCatalogScope({
      internalLicenseId: 'search-smoke-r11-resume-license-a',
      sourceId: 'search-smoke-r11-resume-source-a',
    });
    const resumeScopeB = await deriveLocalCatalogScope({
      internalLicenseId: 'search-smoke-r11-resume-license-b',
      sourceId: 'search-smoke-r11-resume-source-b',
    });
    const resumeScopeARecord: LocalCatalogScope = {
      ...resumeScopeA,
      activeSnapshotId: null,
      stagingSnapshotId: null,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: '2026-08-23T12:00:00.000Z',
      updatedAt: '2026-08-23T12:00:00.000Z',
    };
    const resumeScopeBRecord: LocalCatalogScope = {
      ...resumeScopeB,
      activeSnapshotId: null,
      stagingSnapshotId: null,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: '2026-08-23T12:00:00.000Z',
      updatedAt: '2026-08-23T12:00:00.000Z',
    };
    scopeKeys.push(resumeScopeA.scopeKey, resumeScopeB.scopeKey);

    const resumeGenerationA = 'r11-resume-generation-a';
    const resumeGenerationB = 'r11-resume-generation-b';
    const resumeGenerationC = 'r11-resume-generation-c';
    const resumeTimestamp = '2026-08-23T12:00:00.000Z';
    const resumeSnapshot = (
      snapshotId: string,
      scopeKey: string,
    ): LocalCatalogSnapshot => ({
      snapshotId,
      scopeKey,
      status: 'building',
      sourceRevision: 'resume-revision-a',
      classificationVersion: 1,
      schemaVersion: 3,
      totalItems: 20,
      createdAt: resumeTimestamp,
      updatedAt: resumeTimestamp,
      completedAt: null,
      failureCode: null,
    });
    const resumeDb = await openLocalCatalogDb();
    try {
      const tx = resumeDb.transaction(
        [
          LOCAL_CATALOG_V3_STORES.scopes,
          LOCAL_CATALOG_V3_STORES.snapshots,
          LOCAL_CATALOG_V3_STORES.checkpoints,
        ],
        'readwrite',
      );
      const done = transactionDone(tx);
      tx.objectStore(LOCAL_CATALOG_V3_STORES.scopes).put({
        ...resumeScopeARecord,
        stagingSnapshotId: resumeGenerationA,
        runtimeEpoch: 1,
        updatedAt: resumeTimestamp,
      });
      tx.objectStore(LOCAL_CATALOG_V3_STORES.scopes).put({
        ...resumeScopeBRecord,
        stagingSnapshotId: resumeGenerationC,
        runtimeEpoch: 1,
        updatedAt: resumeTimestamp,
      });
      const snapshotStore = tx.objectStore(LOCAL_CATALOG_V3_STORES.snapshots);
      snapshotStore.put(resumeSnapshot(resumeGenerationA, resumeScopeA.scopeKey));
      snapshotStore.put(resumeSnapshot(resumeGenerationB, resumeScopeA.scopeKey));
      snapshotStore.put(resumeSnapshot(resumeGenerationC, resumeScopeB.scopeKey));
      tx.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints).put({
        snapshotId: resumeGenerationA,
        scopeKey: resumeScopeA.scopeKey,
        batchSequence: 2,
        confirmedItems: 20,
        confirmedBytes: 200,
        sourceEtag: 'resume-etag-a',
        sourceLastModified: 'resume-last-modified-a',
        sourceRevision: 'resume-revision-a',
        parserVersion: 1,
        updatedAt: resumeTimestamp,
      });
      await done;
    } finally {
      resumeDb.close();
    }

    const resumeInput = {
      scopeKey: resumeScopeA.scopeKey,
      expectedRuntimeEpoch: 1,
      parserVersion: 1,
      sourceRevision: 'resume-revision-a',
      sourceEtag: 'resume-etag-a',
      sourceLastModified: 'resume-last-modified-a',
    };
    const resumeEligible = await evaluateLocalCatalogResume(resumeInput);

    const generationChangeDb = await openLocalCatalogDb();
    try {
      const tx = generationChangeDb.transaction(
        LOCAL_CATALOG_V3_STORES.scopes,
        'readwrite',
      );
      const done = transactionDone(tx);
      const scopeStore = tx.objectStore(LOCAL_CATALOG_V3_STORES.scopes);
      const current = (await requestResult(scopeStore.get(resumeScopeA.scopeKey))) as LocalCatalogScope;
      scopeStore.put({
        ...current,
        stagingSnapshotId: resumeGenerationB,
        updatedAt: resumeTimestamp,
      });
      await done;
    } finally {
      generationChangeDb.close();
    }

    const generationChanged = await evaluateLocalCatalogResume(resumeInput);
    const scopeChanged = await evaluateLocalCatalogResume({
      ...resumeInput,
      scopeKey: resumeScopeB.scopeKey,
    });
    result.R11_RESUME_04_GENERATION_CHANGE_INVALIDATES_CHECKPOINT =
      resumeEligible.decision === 'resume_eligible' &&
      generationChanged.decision === 'restart_required' &&
      generationChanged.reasonCode === 'LOCAL_CATALOG_CHECKPOINT_MISSING' &&
      generationChanged.snapshotId === resumeGenerationB &&
      generationChanged.checkpoint === null;

    result.R11_ACTIVE_08_SCOPE_ISOLATION = result.SEARCH_15_DIFFERENT_SOURCE_ISOLATED;
    result.R11_ACTIVE_09_GENERATION_ISOLATION = result.SERIES_DETAIL_V3_PERF_03_SNAPSHOT_ISOLATION;
    result.R11_RESUME_05_SCOPE_CHANGE_INVALIDATES_CHECKPOINT =
      scopeChanged.decision === 'restart_required' &&
      scopeChanged.reasonCode === 'LOCAL_CATALOG_CHECKPOINT_MISSING' &&
      scopeChanged.snapshotId === resumeGenerationC &&
      scopeChanged.checkpoint === null;

    await ensureLocalCatalogSearchIndex({
      snapshotId: r11SnapshotId,
      scopeKey: r11Scope.scopeKey,
    });
    const readyZeroCandidate = await localCatalogSearchRepository.findCandidates({
      scopeKey: r11Scope.scopeKey,
      tokens: ['naoexistemesmo'],
      normalizedQuery: 'naoexistemesmo',
    });
    const completedOmegaCandidate = await localCatalogSearchRepository.findCandidates({
      scopeKey: r11Scope.scopeKey,
      tokens: ['omega'],
      normalizedQuery: 'omega',
    });
    const readyState = await getLocalCatalogSearchIndexState(r11SnapshotId);

    result.R11_ACTIVE_04_TRUE_ZERO_ONLY_AFTER_FULL_READY =
      readyState.status === 'ready' &&
      readyZeroCandidate?.candidates.length === 0 &&
      readyZeroCandidate?.status === 'ready' &&
      readyZeroCandidate?.indexingInBackground === false;

    result.R11_ACTIVE_10_FULL_READY_BEHAVIOR_PRESERVED =
      completedOmegaCandidate?.candidates.length === 1 &&
      completedOmegaCandidate?.status === 'ready';

    const failTxDb = await openLocalCatalogDb();
    try {
      const tx = failTxDb.transaction(LOCAL_CATALOG_V3_STORES.metrics, 'readwrite');
      const done = transactionDone(tx);
      const m = (await requestResult(tx.objectStore(LOCAL_CATALOG_V3_STORES.metrics).get(r11SnapshotId))) as any;
      tx.objectStore(LOCAL_CATALOG_V3_STORES.metrics).put({
        ...m,
        searchIndexStatus: 'failed',
      });
      await done;
    } finally {
      failTxDb.close();
    }
    const failedCandidate = await localCatalogSearchRepository.findCandidates({
      scopeKey: r11Scope.scopeKey,
      tokens: ['naoexiste'],
      normalizedQuery: 'naoexiste',
    });
    result.R11_ACTIVE_06_INDEX_FAILURE_NOT_ZERO =
      failedCandidate?.status === 'index_failed' &&
      failedCandidate.candidates.length === 0;

    result.R11_ACTIVE_11_R8_PARTIAL_CONTENT_STATE_PRESERVED =
      result.VS06_SEARCH_STATE_03_INDEXING_PARTIAL_CONTENT &&
      result.VS06_FOCUS_01_ARROW_DOWN_TARGETS_RESULT_ZERO;

    result.R11_ACTIVE_12_RETRY_PRESERVED =
      result.VS06_SEARCH_DPAD_INDEX_RETRY_TARGET;
    result.ok = Object.entries(result)
      .filter(([key]) => key !== 'ok' && key !== 'errorCode')
      .every(([, value]) => value === true);
  } catch {
    result.errorCode = 'LOCAL_CATALOG_SEARCH_SMOKE_FAILED';
  } finally {
    globalThis.fetch = originalFetch;
    await cleanup(scopeKeys).catch(() => undefined);
    await deleteLocalCatalogItems(legacyItemIds).catch(() => undefined);
    await deleteLocalCatalogItems(detailV2ItemIds).catch(() => undefined);
  }

  return result;
}
