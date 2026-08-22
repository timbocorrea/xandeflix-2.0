import type { HomeVodItem } from '@/features/catalog/services/homeVod.service';
import { e8DiagnosticLog } from '@/platform/e8DiagnosticLog';
import {
  parseEpisodeNaturalOrder,
  sortEpisodesNaturally,
} from '@/features/catalog/services/episodeNaturalOrder.service';

import type { CatalogRepository } from '../repositories/catalogRepository.types';
import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import { getReadableLocalCatalogActiveSnapshot } from '../services/localCatalogSnapshotLifecycle.service';
import {
  buildLocalCatalogSeriesLookup,
  listLocalCatalogSeriesLookupItems,
} from '../services/localCatalogSeriesLookup.service';
import {
  LOCAL_CATALOG_V3_STORES,
  getLocalCatalogScope,
  openLocalCatalogDb,
} from '../services/localCatalogDb.service';
import { resolveLocalCatalogArtwork } from '../services/localCatalogArtwork.service';
import { isLocalCatalogReadable } from '../services/localCatalogReadability.service';
import { listLocalCatalogLegacySeriesItems } from '../services/localCatalogLegacySeriesLookup.service';
import {
  getSeriesCollectionKey,
  normalizeSeriesCollectionTitle,
} from '../services/localCatalogSeriesIdentity.service';
import type {
  LocalCatalogItem,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';

const SERIES_DETAIL_PAGE_SIZE = 100;
const SERIES_DETAIL_CONTENT_KINDS = ['series', 'series_episode'] as const;
const SERIES_PERF_DIAGNOSTICS_ENABLED =
  import.meta.env.VITE_FOCUS_DIAGNOSTICS === 'true';

function logSeriesPerformanceDiagnostic(
  stage: string,
  payload: Record<string, unknown> = {},
) {
  if (!SERIES_PERF_DIAGNOSTICS_ENABLED) {
    return;
  }

  console.error(
    '[XANDEFLIX_SERIES_PERF]',
    JSON.stringify({
      stage,
      atMs: Math.round(performance.now()),
      ...payload,
    }),
  );
}

type LocalCatalogItemWithSourceOrder = LocalCatalogItem & {
  sourceOrder?: number | null;
};

export type SeriesDetailEpisode = HomeVodItem & {
  seriesKey: string;
  sourceOrder: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  isSeriesCollection?: false;
};

export type SeriesDetailSeason = {
  seasonNumber: number | null;
  title: string;
  episodes: SeriesDetailEpisode[];
};

export type LocalCatalogSeriesDetailReadyReadModel = {
  status: 'ready';
  source:
    | 'active_snapshot_v3_indexed'
    | 'legacy_v2_fallback'
    | 'active_snapshot_v3_direct_fallback'
    | 'staging_snapshot_v3_direct_fallback';
  sourceId: string;
  snapshotId: string | null;
  seriesKey: string;
  canonicalTitle: string;
  episodes: SeriesDetailEpisode[];
  seasons: SeriesDetailSeason[];
};

export type LocalCatalogSeriesDetailIndexBuildingReadModel = {
  status: 'index_building';
  source: 'active_snapshot_v3_index_building';
  sourceId: string;
  snapshotId: string;
  seriesKey: string;
  canonicalTitle: string;
  episodes: [];
  seasons: [];
};

export type LocalCatalogSeriesDetailReadModel =
  | LocalCatalogSeriesDetailReadyReadModel
  | LocalCatalogSeriesDetailIndexBuildingReadModel;

export type LoadLocalCatalogSeriesDetailInput = {
  sourceId: string;
  scopeKey?: string | null;
  seriesKey: string;
};

export type LocalCatalogSeriesDetailDependencies = {
  activeSnapshotResolver?: typeof getReadableLocalCatalogActiveSnapshot;
  indexedLookup?: typeof listLocalCatalogSeriesLookupItems;
  ensureIndexedLookup?: typeof buildLocalCatalogSeriesLookup;
  legacyIndexedLookup?: typeof listLocalCatalogLegacySeriesItems;
  directedSnapshotLookup?: typeof listDirectedSnapshotSeriesCandidates;
};

function toValidEpisodeNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
type LocalCatalogSnapshotEpisodeItem = LocalCatalogSnapshotItem & {
  seriesName?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
};

function mapSnapshotItemToSeriesDetailEpisode(
  item: LocalCatalogSnapshotEpisodeItem,
  seriesKey: string,
): SeriesDetailEpisode {
  const title = item.rawName.trim() || item.itemId;
  const parsedOrder = parseEpisodeNaturalOrder(title);
  const artwork = resolveLocalCatalogArtwork({
    tvgLogo: item.artworkUrl,
  });

  return {
    id: item.itemId,
    title,
    episodeTitle: title,
    subtitle: item.rawGroupTitle?.trim() || undefined,
    posterUrl: artwork.posterUrl,
    backdropUrl: artwork.backdropUrl,
    artworkCandidates: artwork.posterCandidates,
    streamUrl: item.streamUrl,
    groupTitle: item.rawGroupTitle?.trim() || undefined,
    seriesKey,
    sourceOrder: toValidEpisodeNumber(item.sourceOrder),
    seasonNumber:
      toValidEpisodeNumber(item.seasonNumber) ?? parsedOrder.seasonNumber,
    episodeNumber:
      toValidEpisodeNumber(item.episodeNumber) ?? parsedOrder.episodeNumber,
    isSeriesCollection: false,
    kind: 'series',
  };
}

function mapLocalItemToSeriesDetailEpisode(
  item: LocalCatalogItemWithSourceOrder,
  seriesKey: string,
): SeriesDetailEpisode {
  const title = item.rawName?.trim() || item.name.trim() || item.id;
  const parsedOrder = parseEpisodeNaturalOrder(title);
  const artwork = resolveLocalCatalogArtwork(item);

  return {
    id: item.id,
    title,
    episodeTitle: title,
    subtitle: item.groupTitle?.trim() || undefined,
    posterUrl: artwork.posterUrl,
    backdropUrl: artwork.backdropUrl,
    artworkCandidates: artwork.posterCandidates,
    streamUrl: item.streamUrl,
    groupTitle: item.groupTitle?.trim() || undefined,
    seriesKey,
    sourceOrder: toValidEpisodeNumber(item.sourceOrder),
    seasonNumber:
      toValidEpisodeNumber(item.seasonNumber) ?? parsedOrder.seasonNumber,
    episodeNumber:
      toValidEpisodeNumber(item.episodeNumber) ?? parsedOrder.episodeNumber,
    isSeriesCollection: false,
    kind: 'series',
  };
}

export function groupSeriesDetailEpisodesBySeason(
  episodes: readonly SeriesDetailEpisode[],
): SeriesDetailSeason[] {
  const seasons = new Map<number | null, SeriesDetailEpisode[]>();

  for (const episode of episodes) {
    const seasonNumber = episode.seasonNumber;
    const seasonEpisodes = seasons.get(seasonNumber) ?? [];
    seasonEpisodes.push(episode);
    seasons.set(seasonNumber, seasonEpisodes);
  }

  return Array.from(seasons.entries())
    .sort(([firstSeason], [secondSeason]) => {
      if (firstSeason === null) return 1;
      if (secondSeason === null) return -1;
      return firstSeason - secondSeason;
    })
    .map(([seasonNumber, seasonEpisodes]) => ({
      seasonNumber,
      title:
        seasonNumber === null
          ? 'Outros episódios'
          : `Temporada ${seasonNumber}`,
      episodes: [...seasonEpisodes],
    }));
}

async function listAllLocalSeriesCandidates(
  sourceId: string,
  repository: CatalogRepository,
) {
  const startedAt = performance.now();
  const candidates: LocalCatalogItem[] = [];
  let queryCount = 0;

  logSeriesPerformanceDiagnostic('SERIES_DB_QUERY_START_TS');

  for (const contentKind of SERIES_DETAIL_CONTENT_KINDS) {
    let offset = 0;

    for (;;) {
      const queryStartedAt = performance.now();
      const page = await repository.listItems({
        sourceId,
        contentKind,
        limit: SERIES_DETAIL_PAGE_SIZE,
        offset,
      });
      queryCount += 1;
      logSeriesPerformanceDiagnostic('SERIES_DB_QUERY_END_TS', {
        contentKind,
        elapsedMs: performance.now() - queryStartedAt,
        pageCount: page.length,
        offset,
        queryCount,
      });

      candidates.push(...page);

      if (page.length < SERIES_DETAIL_PAGE_SIZE) {
        break;
      }

      offset += page.length;
    }
  }

  logSeriesPerformanceDiagnostic('SERIES_DB_QUERY_COMPLETE_TS', {
    elapsedMs: performance.now() - startedAt,
    queryCount,
    rowsScanned: candidates.length,
  });

  return candidates;
}

type DirectedSnapshotSeriesCandidates = {
  items: LocalCatalogSnapshotItem[];
  rowsScanned: number;
};

function normalizeSeriesLookupIdentity(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function listDirectedSnapshotSeriesCandidates(input: {
  scopeKey: string;
  snapshotId: string;
  seriesKey: string;
}): Promise<DirectedSnapshotSeriesCandidates> {
  const scopeKey = input.scopeKey.trim();
  const snapshotId = input.snapshotId.trim();
  const normalizedPrefix = normalizeSeriesLookupIdentity(input.seriesKey);

  if (!scopeKey || !snapshotId || !normalizedPrefix) {
    return { items: [], rowsScanned: 0 };
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.items,
      'readonly',
    );
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error('LOCAL_CATALOG_SERIES_DIRECTED_LOOKUP_FAILED'),
        );
    });
    const index = transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.items)
      .index('snapshotIdNormalizedName');
    const range = IDBKeyRange.bound(
      [snapshotId, normalizedPrefix],
      [snapshotId, `${normalizedPrefix}\uffff`],
    );
    const items: LocalCatalogSnapshotItem[] = [];
    let rowsScanned = 0;

    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(range);

      request.onerror = () =>
        reject(
          request.error ??
            new Error('LOCAL_CATALOG_SERIES_DIRECTED_LOOKUP_FAILED'),
        );
      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve();
          return;
        }

        const item = cursor.value as LocalCatalogSnapshotItem;
        rowsScanned += 1;

        if (
          item.snapshotId === snapshotId &&
          item.scopeKey === scopeKey &&
          SERIES_DETAIL_CONTENT_KINDS.includes(
            item.contentKind as (typeof SERIES_DETAIL_CONTENT_KINDS)[number],
          )
        ) {
          items.push(item);
        }

        cursor.continue();
      };
    });

    await completed;
    return { items, rowsScanned };
  } finally {
    db.close();
  }
}

export async function loadLocalCatalogSeriesDetailReadModel(
  input: LoadLocalCatalogSeriesDetailInput,
  repository: CatalogRepository = localCatalogRepository,
  dependencies: LocalCatalogSeriesDetailDependencies = {},
): Promise<LocalCatalogSeriesDetailReadModel | null> {
  const sourceId = input.sourceId.trim();
  const scopeKey = input.scopeKey?.trim() ?? '';
  const requestedSeriesKey = input.seriesKey.trim().toLowerCase();

  if (!sourceId || !requestedSeriesKey) {
    return null;
  }

  const readModelStartedAt = performance.now();
  logSeriesPerformanceDiagnostic('SERIES_READ_MODEL_START_TS');

  e8DiagnosticLog('SERIES_SCOPE_PRESENT', { scopePresent: Boolean(scopeKey) });

  if (scopeKey) {
    const startedAt = performance.now();
    logSeriesPerformanceDiagnostic('SERIES_SCOPE_RESOLVE_START_TS');
    const scope = await getLocalCatalogScope(scopeKey).catch(() => null);
    logSeriesPerformanceDiagnostic('SERIES_SCOPE_RESOLVE_TS', {
      elapsedMs: performance.now() - startedAt,
    });
    e8DiagnosticLog('SERIES_ACTIVE_SNAPSHOT_PRESENT', {
      snapshotPresent: Boolean(scope?.activeSnapshotId),
    });
    e8DiagnosticLog('SERIES_STAGING_SNAPSHOT_PRESENT', {
      snapshotPresent: Boolean(scope?.stagingSnapshotId),
    });
    const snapshotStartedAt = performance.now();
    const activeSnapshot = await (dependencies.activeSnapshotResolver ?? getReadableLocalCatalogActiveSnapshot)(scopeKey);
    logSeriesPerformanceDiagnostic('SERIES_SNAPSHOT_RESOLVE_TS', {
      elapsedMs: performance.now() - snapshotStartedAt,
      snapshotPresent: Boolean(activeSnapshot),
    });
    if (!activeSnapshot) {
      e8DiagnosticLog('SERIES_LOOKUP_STATUS', { status: 'snapshot_unavailable' });
    }
    if (activeSnapshot) {
      const indexedStartedAt = performance.now();
      const indexed = await (dependencies.indexedLookup ?? listLocalCatalogSeriesLookupItems)({
        snapshotId: activeSnapshot.snapshotId, seriesKey: requestedSeriesKey,
      });
      logSeriesPerformanceDiagnostic('SERIES_INDEXED_LOOKUP_TS', {
        elapsedMs: performance.now() - indexedStartedAt,
        resultStatus: indexed.status,
        rowsMatched: indexed.items.length,
      });
      e8DiagnosticLog('SERIES_LOOKUP_STATUS', { status: indexed.status });
      if (indexed.status === 'ready') {
        const matchingItems = indexed.items as LocalCatalogSnapshotEpisodeItem[];
        logSeriesPerformanceDiagnostic('SERIES_FILTER_START_TS', {
          rowsScanned: matchingItems.length,
        });
        const episodes = sortEpisodesNaturally(
          matchingItems.map((item) =>
            mapSnapshotItemToSeriesDetailEpisode(item, requestedSeriesKey),
          ),
        ) as SeriesDetailEpisode[];
        logSeriesPerformanceDiagnostic('SERIES_FILTER_END_TS', {
          elapsedMs: performance.now() - indexedStartedAt,
          rowsMatched: matchingItems.length,
        });
        const groupingStartedAt = performance.now();
        const seasons = groupSeriesDetailEpisodesBySeason(episodes);
        logSeriesPerformanceDiagnostic('SERIES_GROUPING_END_TS', {
          elapsedMs: performance.now() - groupingStartedAt,
          seasonCount: seasons.length,
        });
        const canonicalTitle =
          normalizeSeriesCollectionTitle(
            matchingItems[0]?.seriesName || matchingItems[0]?.rawName,
          ) || requestedSeriesKey;

        console.info('[XANDEFLIX_SERIES_DETAIL_SOURCE]', {
          source: 'active_snapshot_v3_indexed',
          resultCount: episodes.length,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
        e8DiagnosticLog('SERIES_FALLBACK_CANDIDATE_COUNT', { count: matchingItems.length });
        e8DiagnosticLog('SERIES_PARENT_KEY_MATCH_COUNT', { count: matchingItems.length });
        e8DiagnosticLog('SERIES_SEASON_COUNT', { count: groupSeriesDetailEpisodesBySeason(episodes).length });
        e8DiagnosticLog('SERIES_EPISODE_COUNT', { count: episodes.length });

        return {
          status: 'ready',
          source: 'active_snapshot_v3_indexed',
          sourceId,
          snapshotId: activeSnapshot.snapshotId,
          seriesKey: requestedSeriesKey,
          canonicalTitle,
          episodes,
          seasons,
        };
      }

      const directedLookupStartedAt = performance.now();
      logSeriesPerformanceDiagnostic('SERIES_DB_QUERY_START_TS', {
        strategy: 'DIRECTED_SNAPSHOT_LOOKUP',
      });
      const directedLookup = dependencies.directedSnapshotLookup
        ? await dependencies.directedSnapshotLookup({
            scopeKey,
            snapshotId: activeSnapshot.snapshotId,
            seriesKey: requestedSeriesKey,
          })
        : typeof indexedDB === 'undefined'
          ? { items: [], rowsScanned: 0 }
          : await listDirectedSnapshotSeriesCandidates({
              scopeKey,
              snapshotId: activeSnapshot.snapshotId,
              seriesKey: requestedSeriesKey,
            });
      const matchingSnapshotItems = directedLookup.items.filter(
        (item) =>
          normalizeSeriesLookupIdentity(
            getSeriesCollectionKey({
              id: item.itemId,
              name: item.rawName,
              rawName: item.rawName,
              groupTitle: item.rawGroupTitle,
            }),
          ) === normalizeSeriesLookupIdentity(requestedSeriesKey),
      );
      logSeriesPerformanceDiagnostic('SERIES_DB_QUERY_END_TS', {
        strategy: 'DIRECTED_SNAPSHOT_LOOKUP',
        elapsedMs: performance.now() - directedLookupStartedAt,
        rowsScanned: directedLookup.rowsScanned,
        rowsAfterSnapshotScopeFilter: directedLookup.items.length,
        rowsAfterExactCollectionFilter: matchingSnapshotItems.length,
      });
      logSeriesPerformanceDiagnostic('SERIES_DB_QUERY_COMPLETE_TS', {
        strategy: 'DIRECTED_SNAPSHOT_LOOKUP',
        elapsedMs: performance.now() - directedLookupStartedAt,
        rowsScanned: directedLookup.rowsScanned,
        fullCatalogScanExecuted: false,
      });
      e8DiagnosticLog('SERIES_FALLBACK_CANDIDATE_COUNT', {
        count: directedLookup.rowsScanned,
      });
      e8DiagnosticLog('SERIES_PARENT_KEY_MATCH_COUNT', {
        count: matchingSnapshotItems.length,
      });

      if (matchingSnapshotItems.length > 0) {
        const episodes = sortEpisodesNaturally(
          matchingSnapshotItems.map((item) =>
            mapSnapshotItemToSeriesDetailEpisode(item, requestedSeriesKey),
          ),
        ) as SeriesDetailEpisode[];
        const seasons = groupSeriesDetailEpisodesBySeason(episodes);
        const canonicalTitle =
          normalizeSeriesCollectionTitle(
            matchingSnapshotItems[0]?.rawName,
          ) || requestedSeriesKey;
        const seasonParsedCount = episodes.filter(
          (episode) => episode.seasonNumber !== null,
        ).length;
        const episodeParsedCount = episodes.filter(
          (episode) => episode.episodeNumber !== null,
        ).length;

        logSeriesPerformanceDiagnostic('SERIES_IDENTITY_FILTER_END_TS', {
          elapsedMs: performance.now() - directedLookupStartedAt,
          rawRows: directedLookup.rowsScanned,
          matchedRows: matchingSnapshotItems.length,
          seriesIdFilterCount: 0,
          parentKeyFilterCount: 0,
          titleFallbackMatchCount: matchingSnapshotItems.length,
        });
        logSeriesPerformanceDiagnostic('SERIES_SEASON_GROUP_END_TS', {
          seasonCount: seasons.length,
          seasonParsedCount,
          episodeParsedCount,
        });
        e8DiagnosticLog('SERIES_SEASON_COUNT', {
          count: seasons.length,
        });
        e8DiagnosticLog('SERIES_EPISODE_COUNT', {
          count: episodes.length,
        });

        const source =
          activeSnapshot.status === 'active'
            ? 'active_snapshot_v3_direct_fallback'
            : 'staging_snapshot_v3_direct_fallback';
        console.info('[XANDEFLIX_SERIES_DETAIL_SOURCE]', {
          source,
          resultCount: episodes.length,
          rawRows: directedLookup.rowsScanned,
          fullCatalogScanExecuted: false,
          elapsedMs: Math.round(performance.now() - startedAt),
        });

        return {
          status: 'ready',
          source,
          sourceId,
          snapshotId: activeSnapshot.snapshotId,
          seriesKey: requestedSeriesKey,
          canonicalTitle,
          episodes,
          seasons,
        };
      }

      void (dependencies.ensureIndexedLookup ?? buildLocalCatalogSeriesLookup)({ snapshotId: activeSnapshot.snapshotId });
      console.info('[XANDEFLIX_SERIES_DETAIL_SOURCE]', { source: 'active_snapshot_v3_index_building', lookupStatus: indexed.status, elapsedMs: Math.round(performance.now() - startedAt) });
      e8DiagnosticLog('SERIES_FALLBACK_ENTER');

      if (activeSnapshot.status === 'active') {
        const legacySeriesLookup =
          dependencies.legacyIndexedLookup ??
          (repository === localCatalogRepository
            ? listLocalCatalogLegacySeriesItems
            : null);

        if (legacySeriesLookup) {
          const legacyItems = await legacySeriesLookup({
            sourceId,
            seriesKey: requestedSeriesKey,
          });

          if (legacyItems.length > 0) {
            const episodes = sortEpisodesNaturally(
              legacyItems.map((item) =>
                mapLocalItemToSeriesDetailEpisode(item, requestedSeriesKey),
              ),
            ) as SeriesDetailEpisode[];
            const seasons = groupSeriesDetailEpisodesBySeason(episodes);
            const canonicalTitle =
              normalizeSeriesCollectionTitle(
                legacyItems[0]?.seriesName ||
                  legacyItems[0]?.rawName ||
                  legacyItems[0]?.name,
              ) || requestedSeriesKey;

            e8DiagnosticLog('SERIES_FALLBACK_SOURCE', {
              source: 'legacy_v2_fallback',
            });
            e8DiagnosticLog('SERIES_FALLBACK_CANDIDATE_COUNT', {
              count: legacyItems.length,
            });
            e8DiagnosticLog('SERIES_PARENT_KEY_MATCH_COUNT', {
              count: legacyItems.length,
            });
            e8DiagnosticLog('SERIES_SEASON_COUNT', {
              count: seasons.length,
            });
            e8DiagnosticLog('SERIES_EPISODE_COUNT', {
              count: episodes.length,
            });

            console.info('[XANDEFLIX_SERIES_DETAIL_SOURCE]', {
              source: 'legacy_v2_fallback',
              resultCount: episodes.length,
              elapsedMs: Math.round(performance.now() - startedAt),
            });

            return {
              status: 'ready',
              source: 'legacy_v2_fallback',
              sourceId,
              snapshotId: activeSnapshot.snapshotId,
              seriesKey: requestedSeriesKey,
              canonicalTitle,
              episodes,
              seasons,
            };
          }
        }
      }

      if (activeSnapshot.status !== 'active') {
        e8DiagnosticLog('SERIES_SEASON_COUNT', { count: 0 });
        e8DiagnosticLog('SERIES_EPISODE_COUNT', { count: 0 });
        e8DiagnosticLog('SERIES_READ_MODEL_STATUS', { status: 'index_building' });
        return {
          status: 'index_building',
          source: 'active_snapshot_v3_index_building',
          sourceId,
          snapshotId: activeSnapshot.snapshotId,
          seriesKey: requestedSeriesKey,
          canonicalTitle: requestedSeriesKey,
          episodes: [],
          seasons: [],
        };
      }

      e8DiagnosticLog('SERIES_SEASON_COUNT', { count: 0 });
      e8DiagnosticLog('SERIES_EPISODE_COUNT', { count: 0 });
      e8DiagnosticLog('SERIES_READ_MODEL_STATUS', { status: 'index_building' });
      return { status: 'index_building', source: 'active_snapshot_v3_index_building', sourceId, snapshotId: activeSnapshot.snapshotId, seriesKey: requestedSeriesKey, canonicalTitle: requestedSeriesKey, episodes: [], seasons: [] };
    }
  }

  const importMetadata = await repository.getImportMetadata(sourceId);

  if (!isLocalCatalogReadable(importMetadata)) {
    e8DiagnosticLog('SERIES_READ_MODEL_STATUS', { status: 'unavailable' });
    return null;
  }

  e8DiagnosticLog('SERIES_FALLBACK_ENTER');

  const matchingItems = dependencies.legacyIndexedLookup
    ? await dependencies.legacyIndexedLookup({
        sourceId,
        seriesKey: requestedSeriesKey,
      })
    : repository === localCatalogRepository
      ? await listLocalCatalogLegacySeriesItems({
          sourceId,
          seriesKey: requestedSeriesKey,
        })
      : (await listAllLocalSeriesCandidates(sourceId, repository)).filter(
          (item) => getSeriesCollectionKey(item) === requestedSeriesKey,
        );
  logSeriesPerformanceDiagnostic('SERIES_FILTER_END_TS', {
    rowsMatched: matchingItems.length,
    elapsedMs: performance.now() - readModelStartedAt,
  });
  const episodes = sortEpisodesNaturally(
    matchingItems.map((item) =>
      mapLocalItemToSeriesDetailEpisode(item, requestedSeriesKey),
    ),
  ) as SeriesDetailEpisode[];
  const canonicalTitle =
    normalizeSeriesCollectionTitle(
      matchingItems[0]?.seriesName ||
        matchingItems[0]?.rawName ||
        matchingItems[0]?.name,
    ) || requestedSeriesKey;

  e8DiagnosticLog('SERIES_FALLBACK_SOURCE', { source: 'legacy_v2_fallback' });
  e8DiagnosticLog('SERIES_FALLBACK_CANDIDATE_COUNT', { count: matchingItems.length });
  e8DiagnosticLog('SERIES_PARENT_KEY_MATCH_COUNT', { count: matchingItems.length });
  e8DiagnosticLog('SERIES_SEASON_COUNT', { count: groupSeriesDetailEpisodesBySeason(episodes).length });
  e8DiagnosticLog('SERIES_EPISODE_COUNT', { count: episodes.length });

  console.info('[XANDEFLIX_SERIES_DETAIL_SOURCE]', {
    source: 'legacy_v2_fallback',
    resultCount: episodes.length,
  });

  return {
    status: 'ready',
    source: 'legacy_v2_fallback',
    sourceId,
    snapshotId: null,
    seriesKey: requestedSeriesKey,
    canonicalTitle,
    episodes,
    seasons: groupSeriesDetailEpisodesBySeason(episodes),
  };
}
