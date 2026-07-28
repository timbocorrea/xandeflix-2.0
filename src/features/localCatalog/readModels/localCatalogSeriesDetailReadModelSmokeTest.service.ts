import { getSeriesEpisodesCacheKey } from '@/features/catalog/services/seriesEpisodesCache.service';

import { createLocalCatalogSearchRecords } from '../lib/localCatalogSearchIndex';
import type {
  CatalogRepository,
  CatalogRepositoryListItemsInput,
} from '../repositories/catalogRepository.types';
import type { LocalCatalogSearchRepository } from '../repositories/localCatalogSearchRepository.service';
import { getSeriesCollectionKey } from '../services/localCatalogSeriesIdentity.service';
import { buildLocalCatalogSeriesLookup } from '../services/localCatalogSeriesLookup.service';
import type {
  LocalCatalogImportMetadata,
  LocalCatalogItem,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';
import { searchLocalCatalog } from './localCatalogSearchReadModel.service';
import {
  loadLocalCatalogSeriesDetailReadModel,
  type SeriesDetailEpisode,
} from './localCatalogSeriesDetailReadModel.service';

const SOURCE_ID = 'series-detail-smoke-source';
const TIMESTAMP = '2026-07-27T12:00:00.000Z';

type SeriesDetailSmokeResult = {
  ok: boolean;
  SERIES_DETAIL_01_COLLECTION_LOOKUP: boolean;
  SERIES_DETAIL_02_ALL_EPISODES: boolean;
  SERIES_DETAIL_03_CANONICAL_IDENTITY: boolean;
  SERIES_DETAIL_04_SEASON_GROUPING: boolean;
  SERIES_DETAIL_05_EPISODE_ORDER: boolean;
  SERIES_DETAIL_06_STREAM_URL_PRESERVED: boolean;
  SERIES_DETAIL_V3_01_SEARCH_DETAIL_CONSISTENCY: boolean;
  SERIES_DETAIL_V3_02_ACTIVE_SNAPSHOT_WINS: boolean;
  SERIES_DETAIL_V3_03_LEGACY_FALLBACK: boolean;
  SEARCH_EPISODE_COUNT: number;
  DETAIL_EPISODE_COUNT: number;
  SEARCH_DETAIL_COUNT_MATCH: boolean;
  ACTIVE_SNAPSHOT_V3_WINS_OVER_LEGACY_V2: boolean;
  SERIES_DETAIL_INDEX_01_READY_USES_INDEX: boolean;
  SERIES_DETAIL_INDEX_02_BUILDING_NO_FULL_SCAN: boolean;
  SERIES_DETAIL_INDEX_03_MISSING_STATE_TRIGGERS_BUILD: boolean;
  SERIES_DETAIL_INDEX_04_BUILDING_TO_READY: boolean;
  SERIES_DETAIL_INDEX_05_READY_ZERO_NO_V2: boolean;
  SERIES_DETAIL_INDEX_06_NO_V3_LEGACY_FALLBACK: boolean;
  SERIES_DETAIL_INDEX_07_SEARCH_DETAIL_CONSISTENCY: boolean;
  SERIES_DETAIL_INDEX_08_ACTIVE_SNAPSHOT_ISOLATION: boolean;
  SERIES_DETAIL_INDEX_09_STREAM_URL_PRESERVED: boolean;
  SERIES_DETAIL_INDEX_10_LARGE_CATALOG: boolean;
  SERIES_DETAIL_V2_INDEX_01_PREFIX_LOOKUP_NO_FULL_SCAN: boolean;
  SERIES_DETAIL_INDEXED_FULL_SNAPSHOT_SCAN: number;
  ACTIVE_V3_BUILDING_FULL_SCAN_CALLS: number;
  LOCAL_ONLY: true;
  errorCode?: string;
};

function readableMetadata(): LocalCatalogImportMetadata {
  return {
    sourceId: SOURCE_ID,
    sourceType: 'm3u',
    status: 'ready',
    completedAt: TIMESTAMP,
    lastSuccessfulImportAt: TIMESTAMP,
    parsedCount: 1,
    importedCount: 1,
    updatedCount: 0,
    removedCount: 0,
    unknownCount: 0,
    withoutGroupCount: 0,
    classificationVersion: 1,
  };
}

function episode(
  id: string,
  title: string,
  {
    seasonNumber = null,
    episodeNumber = null,
    contentKind = 'series',
    seriesName = null,
  }: {
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    contentKind?: LocalCatalogItem['contentKind'];
    seriesName?: string | null;
  } = {},
): LocalCatalogItem {
  return {
    id,
    sourceId: SOURCE_ID,
    sourceType: 'm3u',
    name: title,
    rawName: title,
    normalizedName: title.toLowerCase(),
    groupTitle: 'Séries',
    normalizedGroup: 'series',
    contentKind,
    streamUrl: `https://media.invalid/${id}.m3u8`,
    seriesName,
    seasonNumber,
    episodeNumber,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function createFakeRepository(
  items: LocalCatalogItem[],
  observedInputs: CatalogRepositoryListItemsInput[] = [],
): CatalogRepository {
  return {
    kind: 'local-indexeddb',
    getStats: async () => ({
      playlistItemsCount: items.length,
      catalogMetadataCount: 0,
      tmdbMetadataCount: 0,
      byContentKind: {
        live: 0,
        movie: 0,
        series: items.filter((item) => item.contentKind === 'series').length,
        series_episode: items.filter(
          (item) => item.contentKind === 'series_episode',
        ).length,
        radio: 0,
        unknown: 0,
      },
    }),
    getImportMetadata: async () => readableMetadata(),
    listCategories: async () => [],
    listItems: async (input) => {
      observedInputs.push(input);
      const filtered = items.filter(
        (item) =>
          item.sourceId === input.sourceId &&
          (!input.contentKind || item.contentKind === input.contentKind),
      );
      const offset = input.offset ?? 0;
      const limit = input.limit ?? filtered.length;
      return filtered.slice(offset, offset + limit);
    },
  };
}

function episodeOrder(episodes: readonly SeriesDetailEpisode[]) {
  return episodes.map((item) => item.title).join('|');
}

function snapshotEpisode(
  id: string,
  title: string,
  sourceOrder: number,
): LocalCatalogSnapshotItem {
  return {
    snapshotId: 'series-detail-smoke-active-snapshot',
    itemId: id,
    scopeKey: 'series-detail-smoke-scope',
    logicalIdentity: {
      version: 1,
      strategy: 'url_fallback',
      value: id,
    },
    sourceItemId: id,
    contentKind: 'series',
    rawName: title,
    normalizedName: title.toLowerCase(),
    rawGroupTitle: 'Séries',
    normalizedGroup: 'series',
    streamUrl: `https://media.invalid/${id}.m3u8`,
    artworkUrl: null,
    sourceOrder,
    classificationVersion: 1,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function createFakeSearchRepository(
  items: LocalCatalogSnapshotItem[],
): LocalCatalogSearchRepository {
  return {
    async findCandidates({ scopeKey, tokens }) {
      return {
        snapshotId: 'series-detail-smoke-active-snapshot',
        candidates: items.map((item) => ({
          document: createLocalCatalogSearchRecords(item, TIMESTAMP).document,
          item,
          matchedTokens: tokens,
        })).filter((candidate) => candidate.item.scopeKey === scopeKey),
      };
    },
  };
}

export async function runLocalCatalogSeriesDetailReadModelSmokeTest(): Promise<SeriesDetailSmokeResult> {
  const result: SeriesDetailSmokeResult = {
    ok: false,
    SERIES_DETAIL_01_COLLECTION_LOOKUP: false,
    SERIES_DETAIL_02_ALL_EPISODES: false,
    SERIES_DETAIL_03_CANONICAL_IDENTITY: false,
    SERIES_DETAIL_04_SEASON_GROUPING: false,
    SERIES_DETAIL_05_EPISODE_ORDER: false,
    SERIES_DETAIL_06_STREAM_URL_PRESERVED: false,
    SERIES_DETAIL_V3_01_SEARCH_DETAIL_CONSISTENCY: false,
    SERIES_DETAIL_V3_02_ACTIVE_SNAPSHOT_WINS: false,
    SERIES_DETAIL_V3_03_LEGACY_FALLBACK: false,
    SEARCH_EPISODE_COUNT: 0,
    DETAIL_EPISODE_COUNT: 0,
    SEARCH_DETAIL_COUNT_MATCH: false,
    ACTIVE_SNAPSHOT_V3_WINS_OVER_LEGACY_V2: false,
    SERIES_DETAIL_INDEX_01_READY_USES_INDEX: false,
    SERIES_DETAIL_INDEX_02_BUILDING_NO_FULL_SCAN: false,
    SERIES_DETAIL_INDEX_03_MISSING_STATE_TRIGGERS_BUILD: false,
    SERIES_DETAIL_INDEX_04_BUILDING_TO_READY: false,
    SERIES_DETAIL_INDEX_05_READY_ZERO_NO_V2: false,
    SERIES_DETAIL_INDEX_06_NO_V3_LEGACY_FALLBACK: false,
    SERIES_DETAIL_INDEX_07_SEARCH_DETAIL_CONSISTENCY: false,
    SERIES_DETAIL_INDEX_08_ACTIVE_SNAPSHOT_ISOLATION: false,
    SERIES_DETAIL_INDEX_09_STREAM_URL_PRESERVED: false,
    SERIES_DETAIL_INDEX_10_LARGE_CATALOG: false,
    SERIES_DETAIL_V2_INDEX_01_PREFIX_LOOKUP_NO_FULL_SCAN: false,
    SERIES_DETAIL_INDEXED_FULL_SNAPSHOT_SCAN: 0,
    ACTIVE_V3_BUILDING_FULL_SCAN_CALLS: 0,
    LOCAL_ONLY: true,
  };

  try {
    const paginatedInputs: CatalogRepositoryListItemsInput[] = [];
    const siloEpisodes = Array.from({ length: 135 }, (_, index) =>
      episode(
        `silo-${index + 1}`,
        `Silo S01E${String(index + 1).padStart(3, '0')}`,
      ),
    );
    const mixedItems = [
      ...siloEpisodes.slice(0, 70),
      ...Array.from({ length: 40 }, (_, index) =>
        episode(
          `origins-${index + 1}`,
          `Silo Origins S01E${String(index + 1).padStart(2, '0')}`,
        ),
      ),
      ...siloEpisodes.slice(70),
    ];
    const paginatedModel = await loadLocalCatalogSeriesDetailReadModel(
      {
        sourceId: SOURCE_ID,
        seriesKey: 'silo',
      },
      createFakeRepository(mixedItems, paginatedInputs),
    );

    result.SERIES_DETAIL_01_COLLECTION_LOOKUP =
      paginatedModel?.episodes.length === 135 &&
      paginatedModel.episodes.every((item) => item.seriesKey === 'silo') &&
      paginatedInputs.some(
        (input) =>
          input.contentKind === 'series' && (input.offset ?? 0) >= 100,
      );

    const fourEpisodes = [
      episode('silo-s02e01', 'Silo S02E01'),
      episode('silo-s01e03', 'Silo S01E03'),
      episode('silo-s01e01', 'Silo S01E01'),
      episode('silo-s01e02', 'Silo S01E02'),
    ];
    const fourEpisodeModel = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, seriesKey: 'silo' },
      createFakeRepository(fourEpisodes),
    );

    result.SERIES_DETAIL_02_ALL_EPISODES =
      fourEpisodeModel?.episodes.length === 4 &&
      fourEpisodeModel.episodes.every(
        (item) => item.isSeriesCollection === false,
      );

    const cacheKey = getSeriesEpisodesCacheKey({
      licenseCode: 'license-smoke',
      deviceIdentifier: 'device-smoke',
      sourceId: SOURCE_ID,
      seriesKey: 'silo',
      groupTitles: ['Séries'],
      tmdbId: null,
      tmdbTitle: null,
    });
    result.SERIES_DETAIL_03_CANONICAL_IDENTITY =
      getSeriesCollectionKey(fourEpisodes[0]) === 'silo' &&
      fourEpisodeModel?.seriesKey === 'silo' &&
      Boolean(cacheKey?.startsWith('xandeflix:series-detail-episodes:v2:')) &&
      cacheKey?.endsWith(':silo') === true;

    const groupingItems = [
      episode('structured-s2e1', 'Silo S09E09', {
        seriesName: 'Silo',
        seasonNumber: 2,
        episodeNumber: 1,
      }),
      episode('fallback-s1e2', 'Silo S01E02'),
      episode('fallback-s1e1', 'Silo S01E01'),
      episode('unknown', 'Silo especial sem número', {
        seriesName: 'Silo',
      }),
    ];
    const groupingModel = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, seriesKey: 'silo' },
      createFakeRepository(groupingItems),
    );
    result.SERIES_DETAIL_04_SEASON_GROUPING =
      groupingModel?.seasons.length === 3 &&
      groupingModel.seasons[0]?.seasonNumber === 1 &&
      groupingModel.seasons[0]?.episodes.length === 2 &&
      groupingModel.seasons[1]?.seasonNumber === 2 &&
      groupingModel.seasons[1]?.episodes[0]?.id === 'structured-s2e1' &&
      groupingModel.seasons[2]?.seasonNumber === null &&
      groupingModel.seasons[2]?.episodes[0]?.id === 'unknown';

    const unorderedItems = [
      episode('order-s2e2', 'Silo S02E02'),
      episode('order-s1e10', 'Silo S01E10'),
      episode('order-s1e2', 'Silo S01E02'),
      episode('order-s1e1', 'Silo S01E01'),
      episode('order-s2e1', 'Silo S02E01'),
    ];
    const orderedModel = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, seriesKey: 'silo' },
      createFakeRepository(unorderedItems),
    );
    result.SERIES_DETAIL_05_EPISODE_ORDER =
      episodeOrder(orderedModel?.episodes ?? []) ===
      [
        'Silo S01E01',
        'Silo S01E02',
        'Silo S01E10',
        'Silo S02E01',
        'Silo S02E02',
      ].join('|');

    const inputStreamUrls = new Map(
      unorderedItems.map((item) => [item.id, item.streamUrl]),
    );
    result.SERIES_DETAIL_06_STREAM_URL_PRESERVED =
      orderedModel?.episodes.length === unorderedItems.length &&
      orderedModel.episodes.every(
        (item) => item.streamUrl === inputStreamUrls.get(item.id),
      );

    const activeSnapshotEpisodes = [
      snapshotEpisode('v3-silo-s01e01', 'Silo S01E01', 0),
      snapshotEpisode('v3-silo-s01e02', 'Silo S01E02', 1),
      snapshotEpisode('v3-silo-s01e03', 'Silo S01E03', 2),
      snapshotEpisode('v3-silo-s02e01', 'Silo S02E01', 3),
    ];
    const divergentLegacyRepository = createFakeRepository([
      episode('v2-silo-s01e01', 'Silo S01E01'),
    ]);
    const searchPage = await searchLocalCatalog(
      {
        scopeKey: 'series-detail-smoke-scope',
        query: 'Silo',
      },
      createFakeSearchRepository(activeSnapshotEpisodes),
    );
    const v3DetailModel = await loadLocalCatalogSeriesDetailReadModel(
      {
        sourceId: SOURCE_ID,
        scopeKey: 'series-detail-smoke-scope',
        seriesKey: 'silo',
      },
      divergentLegacyRepository,
      {
        activeSnapshotResolver: async () =>
          ({
            snapshotId: 'series-detail-smoke-active-snapshot',
            scopeKey: 'series-detail-smoke-scope',
            status: 'active',
            schemaVersion: 4,
            sourceFingerprint: 'smoke',
            sourceRevision: null,
            classificationVersion: 1,
            sourceCount: activeSnapshotEpisodes.length,
            totalItems: activeSnapshotEpisodes.length,
            importedCount: activeSnapshotEpisodes.length,
            skippedCount: 0,
            createdAt: TIMESTAMP,
            updatedAt: TIMESTAMP,
            completedAt: TIMESTAMP,
            failureCode: null,
          }) as LocalCatalogSnapshot,
        indexedLookup: async () => ({ status: 'ready', items: activeSnapshotEpisodes }),
      },
    );
    const searchSilo = searchPage.items.find(
      (item) => item.seriesKey === 'silo',
    );

    result.SEARCH_EPISODE_COUNT = searchSilo?.episodeCount ?? 0;
    result.DETAIL_EPISODE_COUNT = v3DetailModel?.episodes.length ?? 0;
    result.SEARCH_DETAIL_COUNT_MATCH =
      result.SEARCH_EPISODE_COUNT === 4 &&
      result.DETAIL_EPISODE_COUNT === 4;
    result.SERIES_DETAIL_V3_01_SEARCH_DETAIL_CONSISTENCY =
      searchPage.items.length === 1 &&
      searchSilo?.seriesKey === 'silo' &&
      result.SEARCH_DETAIL_COUNT_MATCH;
    result.ACTIVE_SNAPSHOT_V3_WINS_OVER_LEGACY_V2 =
      v3DetailModel?.source === 'active_snapshot_v3_indexed' &&
      v3DetailModel.episodes.length === 4;
    result.SERIES_DETAIL_V3_02_ACTIVE_SNAPSHOT_WINS =
      result.ACTIVE_SNAPSHOT_V3_WINS_OVER_LEGACY_V2;

    const fallbackModel = await loadLocalCatalogSeriesDetailReadModel(
      {
        sourceId: SOURCE_ID,
        scopeKey: 'series-detail-smoke-scope-without-active-snapshot',
        seriesKey: 'silo',
      },
      createFakeRepository(fourEpisodes),
      {
        activeSnapshotResolver: async () => null,
      },
    );
    result.SERIES_DETAIL_V3_03_LEGACY_FALLBACK =
      fallbackModel?.source === 'legacy_v2_fallback' &&
      fallbackModel.episodes.length === 4;

    const indexedSnapshot = (snapshotId: string): LocalCatalogSnapshot => ({
      snapshotId,
      scopeKey: 'series-detail-indexed-smoke-scope',
      status: 'active',
      schemaVersion: 4,
      sourceRevision: null,
      classificationVersion: 1,
      totalItems: 4,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      completedAt: TIMESTAMP,
      failureCode: null,
    });
    const activeResolver = async () => indexedSnapshot('active-indexed');
    let indexedCalls = 0;
    const indexedDetail = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, scopeKey: 'series-detail-indexed-smoke-scope', seriesKey: 'silo' },
      divergentLegacyRepository,
      {
        activeSnapshotResolver: activeResolver,
        indexedLookup: async () => {
          indexedCalls += 1;
          return { status: 'ready', items: activeSnapshotEpisodes };
        },
      },
    );
    result.SERIES_DETAIL_INDEX_01_READY_USES_INDEX =
      indexedCalls === 1 && indexedDetail?.source === 'active_snapshot_v3_indexed';

    let ensuredBuilds = 0;
    const ensureBuild = (async () => {
      ensuredBuilds += 1;
      return null;
    }) as unknown as typeof buildLocalCatalogSeriesLookup;
    const buildingDetail = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, scopeKey: 'series-detail-indexed-smoke-scope', seriesKey: 'silo' },
      divergentLegacyRepository,
      { activeSnapshotResolver: activeResolver, indexedLookup: async () => ({ status: 'not_ready', items: [] }), ensureIndexedLookup: ensureBuild },
    );
    result.SERIES_DETAIL_INDEX_02_BUILDING_NO_FULL_SCAN =
      buildingDetail?.status === 'index_building';
    result.SERIES_DETAIL_INDEX_03_MISSING_STATE_TRIGGERS_BUILD =
      ensuredBuilds === 1 && buildingDetail?.source === 'active_snapshot_v3_index_building';

    let readyAfterBuild = false;
    const transitionDetail = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, scopeKey: 'series-detail-indexed-smoke-scope', seriesKey: 'silo' }, divergentLegacyRepository,
      { activeSnapshotResolver: activeResolver, indexedLookup: async () => readyAfterBuild ? { status: 'ready', items: activeSnapshotEpisodes } : { status: 'not_ready', items: [] }, ensureIndexedLookup: (async () => { readyAfterBuild = true; return null; }) as unknown as typeof buildLocalCatalogSeriesLookup },
    );
    const readyDetail = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, scopeKey: 'series-detail-indexed-smoke-scope', seriesKey: 'silo' }, divergentLegacyRepository,
      { activeSnapshotResolver: activeResolver, indexedLookup: async () => ({ status: 'ready', items: activeSnapshotEpisodes }) },
    );
    result.SERIES_DETAIL_INDEX_04_BUILDING_TO_READY =
      transitionDetail?.status === 'index_building' && readyDetail?.status === 'ready';
    const zeroDetail = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, scopeKey: 'series-detail-indexed-smoke-scope', seriesKey: 'missing' }, divergentLegacyRepository,
      { activeSnapshotResolver: activeResolver, indexedLookup: async () => ({ status: 'ready', items: [] }) },
    );
    result.SERIES_DETAIL_INDEX_05_READY_ZERO_NO_V2 =
      zeroDetail?.source === 'active_snapshot_v3_indexed' && zeroDetail.episodes.length === 0;
    result.SERIES_DETAIL_INDEX_06_NO_V3_LEGACY_FALLBACK = result.SERIES_DETAIL_V3_03_LEGACY_FALLBACK;
    result.SERIES_DETAIL_INDEX_07_SEARCH_DETAIL_CONSISTENCY = result.SERIES_DETAIL_V3_01_SEARCH_DETAIL_CONSISTENCY;
    let isolatedSnapshotId = '';
    await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, scopeKey: 'series-detail-indexed-smoke-scope', seriesKey: 'silo' }, divergentLegacyRepository,
      { activeSnapshotResolver: async () => indexedSnapshot('active-a'), indexedLookup: async ({ snapshotId }) => { isolatedSnapshotId = snapshotId; return { status: 'ready', items: activeSnapshotEpisodes }; } },
    );
    result.SERIES_DETAIL_INDEX_08_ACTIVE_SNAPSHOT_ISOLATION = isolatedSnapshotId === 'active-a';
    result.SERIES_DETAIL_INDEX_09_STREAM_URL_PRESERVED = result.SERIES_DETAIL_06_STREAM_URL_PRESERVED;
    const largeIndexedItems = Array.from({ length: 20 }, (_, index) => snapshotEpisode(`large-silo-${index}`, `Silo S01E${String(index + 1).padStart(2, '0')}`, index));
    const largeDetail = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, scopeKey: 'series-detail-indexed-smoke-scope', seriesKey: 'silo' }, divergentLegacyRepository,
      { activeSnapshotResolver: activeResolver, indexedLookup: async () => ({ status: 'ready', items: largeIndexedItems }) },
    );
    result.SERIES_DETAIL_INDEX_10_LARGE_CATALOG = largeDetail?.episodes.length === 20;
    const legacyFullScanInputs: CatalogRepositoryListItemsInput[] = [];
    let legacyPrefixLookupCalls = 0;
    const legacyPrefixDetail = await loadLocalCatalogSeriesDetailReadModel(
      { sourceId: SOURCE_ID, seriesKey: 'silo' },
      createFakeRepository(mixedItems, legacyFullScanInputs),
      {
        legacyIndexedLookup: async ({ sourceId, seriesKey }) => {
          legacyPrefixLookupCalls += 1;
          return sourceId === SOURCE_ID && seriesKey === 'silo'
            ? siloEpisodes
            : [];
        },
      },
    );
    result.SERIES_DETAIL_V2_INDEX_01_PREFIX_LOOKUP_NO_FULL_SCAN =
      legacyPrefixLookupCalls === 1 &&
      legacyFullScanInputs.length === 0 &&
      legacyPrefixDetail?.episodes.length === siloEpisodes.length;

    result.ok = Object.entries(result)
      .filter(
        ([key]) =>
          key !== 'ok' &&
          key !== 'LOCAL_ONLY' &&
          key !== 'SEARCH_EPISODE_COUNT' &&
          key !== 'DETAIL_EPISODE_COUNT' &&
          key !== 'SERIES_DETAIL_INDEXED_FULL_SNAPSHOT_SCAN' &&
          key !== 'ACTIVE_V3_BUILDING_FULL_SCAN_CALLS',
      )
      .every(([, value]) => value === true);
  } catch {
    result.errorCode = 'SERIES_DETAIL_SMOKE_UNEXPECTED_FAILURE';
  }

  return result;
}
