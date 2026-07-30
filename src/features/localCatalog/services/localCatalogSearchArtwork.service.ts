import {
  createMovieMetadataCacheKey,
  parseMovieSearchIdentity,
} from '@/features/catalog/services/movieMetadataCacheIdentity.service';
import { createSeriesMetadataCacheKey } from '@/features/catalog/services/seriesMetadataCache.service';

import { getSafeLocalCatalogArtworkUrl } from '../readModels/localCatalogHomeVodAdapter.service';
import type { LocalCatalogSearchResultItem } from '../readModels/localCatalogSearchReadModel.service';
import { getSeriesCollectionKey } from './localCatalogSeriesIdentity.service';
import { getLocalCatalogMetadataBatch } from './localCatalogDb.service';

export type LocalCatalogSearchArtworkReader = (
  keys: string[],
) => Promise<Map<string, unknown>>;

type SearchArtworkItem = Pick<
  LocalCatalogSearchResultItem,
  'id' | 'title' | 'contentKind' | 'artworkUrl' | 'seriesKey'
>;

function isFreshCacheEntry(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as { expiresAt?: unknown };
  return typeof entry.expiresAt === 'number' && entry.expiresAt > Date.now();
}

function getMovieCachedArtwork(value: unknown) {
  if (!isFreshCacheEntry(value)) {
    return null;
  }

  const entry = value as {
    status?: unknown;
    metadata?: { posterUrl?: unknown; backdropUrl?: unknown };
  };
  if (entry.status !== 'matched' || !entry.metadata) {
    return null;
  }

  return getSafeLocalCatalogArtworkUrl(
    typeof entry.metadata.posterUrl === 'string'
      ? entry.metadata.posterUrl
      : typeof entry.metadata.backdropUrl === 'string'
        ? entry.metadata.backdropUrl
        : null,
  );
}

function getSeriesCachedArtwork(value: unknown) {
  if (!isFreshCacheEntry(value)) {
    return null;
  }

  const entry = value as {
    matchStatus?: unknown;
    metadata?: { posterUrl?: unknown; backdropUrl?: unknown };
  };
  if (entry.matchStatus !== 'matched' || !entry.metadata) {
    return null;
  }

  return getSafeLocalCatalogArtworkUrl(
    typeof entry.metadata.posterUrl === 'string'
      ? entry.metadata.posterUrl
      : typeof entry.metadata.backdropUrl === 'string'
        ? entry.metadata.backdropUrl
        : null,
  );
}

function getArtworkCacheKey(item: SearchArtworkItem, scopeKey: string) {
  if (item.contentKind === 'movie') {
    const identity = parseMovieSearchIdentity(item.title).normalizedTitle;
    return identity
      ? {
          key: createMovieMetadataCacheKey(scopeKey, identity),
          kind: 'movie' as const,
        }
      : null;
  }

  if (item.contentKind === 'series') {
    const seriesKey = getSeriesCollectionKey({
      id: item.id,
      seriesKey: item.seriesKey,
      title: item.title,
    });
    return seriesKey
      ? {
          key: createSeriesMetadataCacheKey(scopeKey, seriesKey),
          kind: 'series' as const,
        }
      : null;
  }

  return null;
}

async function readLocalSearchArtworkMetadata(keys: string[]) {
  const records = await getLocalCatalogMetadataBatch(keys);
  return new Map(
    Array.from(records, ([key, record]) => [key, record.value] as const),
  );
}

export async function resolveLocalCatalogSearchArtwork<
  T extends SearchArtworkItem,
>(
  items: T[],
  scopeKey: string,
  readMetadata: LocalCatalogSearchArtworkReader =
    readLocalSearchArtworkMetadata,
): Promise<T[]> {
  const plans = items.map((item) => {
    const localArtwork = getSafeLocalCatalogArtworkUrl(item.artworkUrl);
    return {
      item,
      localArtwork,
      cache: localArtwork ? null : getArtworkCacheKey(item, scopeKey),
    };
  });
  const keys = plans.flatMap((plan) =>
    plan.cache ? [plan.cache.key] : [],
  );

  if (keys.length === 0) {
    return plans.map(({ item, localArtwork }) => ({
      ...item,
      artworkUrl: localArtwork ?? null,
    }));
  }

  const metadataByKey = await readMetadata(keys).catch(
    () => new Map<string, unknown>(),
  );

  return plans.map(({ item, localArtwork, cache }) => {
    const cachedArtwork =
      cache?.kind === 'movie'
        ? getMovieCachedArtwork(metadataByKey.get(cache.key))
        : cache?.kind === 'series'
          ? getSeriesCachedArtwork(metadataByKey.get(cache.key))
          : null;

    return {
      ...item,
      artworkUrl: localArtwork ?? cachedArtwork ?? null,
    };
  });
}
