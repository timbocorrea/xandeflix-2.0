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
import { localCatalogSearchRepository } from '../repositories/localCatalogSearchRepository.service';
import { deriveLocalCatalogScope } from './localCatalogScope.service';
import { prepareLocalCatalogRuntimeSnapshotBridge } from './localCatalogRuntimeSnapshotBridge.service';
import {
  LOCAL_CATALOG_V3_STORES,
  deleteLocalCatalogItems,
  getLocalCatalogScope,
  openLocalCatalogDb,
  putLocalCatalogItems,
  putLocalCatalogImportMetadata,
} from './localCatalogDb.service';
import { listLocalCatalogSnapshots } from './localCatalogDb.service';
import { ensureLocalCatalogLegacySnapshot } from './localCatalogLegacySnapshotBackfill.service';
import { prepareLocalCatalogRuntimeScope } from './localCatalogSnapshotLifecycle.service';
import { buildLocalCatalogSeriesLookup } from './localCatalogSeriesLookup.service';
import { purgeLocalCatalogSnapshotPartialData } from './localCatalogSnapshotPurge.service';
import {
  buildLocalCatalogSearchReturnTo,
  buildLocalCatalogSeriesDetailRoute,
  getLocalCatalogSearchResultFocusKey,
  LOCAL_CATALOG_SEARCH_ROUTE,
  resolveLocalCatalogSearchInputArrowTarget,
} from '../lib/localCatalogSearchUiContract';

const LICENSE_A = 'search-smoke-license-a';
const LICENSE_B = 'search-smoke-license-b';
const SOURCE_A = 'search-smoke-source-a';
const SOURCE_B = 'search-smoke-source-b';
const LEGACY_LICENSE = 'search-smoke-legacy-license';
const LEGACY_SOURCE = 'search-smoke-legacy-source';
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
        LOCAL_CATALOG_V3_STORES.scopes,
        LOCAL_CATALOG_V3_STORES.snapshots,
      ],
      'readwrite',
    );
    const done = transactionDone(transaction);
    for (const scopeKey of scopeKeys) {
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
  };
}

export async function runLocalCatalogSearchSmokeTest() {
  const result = emptyResult();
  const [
    scopeA,
    scopeOtherSource,
    scopeOtherLicense,
    legacyScope,
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
    const legacyFallbackSearch = await searchLocalCatalog({
      scopeKey: legacyScope.scopeKey,
      query: 'Silo',
    });
    const legacySnapshotId =
      await ensureLocalCatalogLegacySnapshot(legacyScope);
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
      legacyFallbackSearch.status === 'ready' &&
      legacyFallbackSearch.items[0]?.title === LEGACY_TARGET_TITLE;
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
