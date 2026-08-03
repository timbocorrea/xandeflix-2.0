import type { HomeVodItem } from '@/features/catalog/services/homeVod.service';
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

type LocalCatalogItemWithSourceOrder = LocalCatalogItem & {
  sourceOrder?: number | null;
};

export type SeriesDetailEpisode = HomeVodItem & {
  seriesIdentityKey: string;
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
  source: 'active_snapshot_v3_indexed' | 'legacy_v2_fallback';
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
    seriesIdentityKey: seriesKey,
    seriesKey: undefined,
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
    seriesIdentityKey: seriesKey,
    seriesKey: undefined,
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
  const candidates: LocalCatalogItem[] = [];

  for (const contentKind of SERIES_DETAIL_CONTENT_KINDS) {
    let offset = 0;

    for (;;) {
      const page = await repository.listItems({
        sourceId,
        contentKind,
        limit: SERIES_DETAIL_PAGE_SIZE,
        offset,
      });

      candidates.push(...page);

      if (page.length < SERIES_DETAIL_PAGE_SIZE) {
        break;
      }

      offset += page.length;
    }
  }

  return candidates;
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

  if (scopeKey) {
    const startedAt = performance.now();
    const activeSnapshot = await (dependencies.activeSnapshotResolver ?? getReadableLocalCatalogActiveSnapshot)(scopeKey);
    if (activeSnapshot) {
      const indexed = await (dependencies.indexedLookup ?? listLocalCatalogSeriesLookupItems)({
        snapshotId: activeSnapshot.snapshotId, seriesKey: requestedSeriesKey,
      });
      if (indexed.status !== 'ready') {
        void (dependencies.ensureIndexedLookup ?? buildLocalCatalogSeriesLookup)({ snapshotId: activeSnapshot.snapshotId });
        console.info('[XANDEFLIX_SERIES_DETAIL_SOURCE]', { source: 'active_snapshot_v3_index_building', lookupStatus: indexed.status, elapsedMs: Math.round(performance.now() - startedAt) });
        return { status: 'index_building', source: 'active_snapshot_v3_index_building', sourceId, snapshotId: activeSnapshot.snapshotId, seriesKey: requestedSeriesKey, canonicalTitle: requestedSeriesKey, episodes: [], seasons: [] };
      }
      const matchingItems = indexed.items as LocalCatalogSnapshotEpisodeItem[];
      const episodes = sortEpisodesNaturally(
        matchingItems.map((item) =>
          mapSnapshotItemToSeriesDetailEpisode(item, requestedSeriesKey),
        ),
      ) as SeriesDetailEpisode[];
      const canonicalTitle =
        normalizeSeriesCollectionTitle(
          matchingItems[0]?.seriesName || matchingItems[0]?.rawName,
        ) || requestedSeriesKey;

      console.info('[XANDEFLIX_SERIES_DETAIL_SOURCE]', {
        source: 'active_snapshot_v3_indexed',
        resultCount: episodes.length,
        elapsedMs: Math.round(performance.now() - startedAt),
      });

      return {
        status: 'ready',
        source: 'active_snapshot_v3_indexed',
        sourceId,
        snapshotId: activeSnapshot.snapshotId,
        seriesKey: requestedSeriesKey,
        canonicalTitle,
        episodes,
        seasons: groupSeriesDetailEpisodesBySeason(episodes),
      };
    }
  }

  const importMetadata = await repository.getImportMetadata(sourceId);

  if (!isLocalCatalogReadable(importMetadata)) {
    return null;
  }

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
