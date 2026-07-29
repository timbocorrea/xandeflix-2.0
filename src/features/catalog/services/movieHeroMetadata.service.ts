import { env } from '@/config/env';
import {
  getLocalCatalogMetadata,
  putLocalCatalogMetadata,
} from '@/features/localCatalog/services/localCatalogDb.service';

import type { HomeVodItem } from './homeVod.service';
import { resolveSeriesMetadataCacheScopeKey } from './seriesMetadataCache.service';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
export const MOVIE_HERO_CACHE_PREFIX = 'movie-hero-metadata:v2';
const MOVIE_HERO_MATCHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MOVIE_HERO_NO_MATCH_TTL_MS = 24 * 60 * 60 * 1000;
const MOVIE_HERO_ERROR_TTL_MS = 5 * 60 * 1000;
const MOVIE_HERO_ENRICHMENT_LIMIT = 5;
const MOVIE_HERO_ENRICHMENT_CONCURRENCY = 3;
const TMDB_REQUEST_TIMEOUT_MS = 8000;
const MOVIE_GENRES_BY_ID = new Map<number, string>([
  [12, 'Aventura'],
  [14, 'Fantasia'],
  [16, 'Animação'],
  [18, 'Drama'],
  [27, 'Terror'],
  [28, 'Ação'],
  [35, 'Comédia'],
  [36, 'História'],
  [37, 'Faroeste'],
  [53, 'Suspense'],
  [80, 'Crime'],
  [99, 'Documentário'],
  [878, 'Ficção científica'],
  [9648, 'Mistério'],
  [10402, 'Música'],
  [10749, 'Romance'],
  [10751, 'Família'],
  [10752, 'Guerra'],
  [10770, 'Cinema TV'],
]);

type TmdbMovieResult = {
  id?: number;
  title?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  genre_ids?: number[];
};

export type MovieHeroMetadata = {
  tmdbId?: string;
  tmdbTitle?: string;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  tmdbGenres?: string;
  tmdbRating?: string;
  tmdbReleaseYear?: string;
};

export type MovieHeroCacheEntry = {
  status: 'matched' | 'no_match' | 'error';
  metadata?: MovieHeroMetadata;
  expiresAt: number;
};

export type MovieMetadataCache = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, entry: MovieHeroCacheEntry) => Promise<void>;
};

export type MovieMetadataEnrichmentOptions = {
  sourceId?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  detailMode?: boolean;
  scopeKey?: string;
  cache?: MovieMetadataCache;
};

export type MovieSearchIdentity = {
  rawTitle: string;
  cleanTitle: string;
  year?: string;
  normalizedTitle: string;
};

export function normalizeMovieTitle(value?: string | null): string {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();

  if (/^(?:19|20)\d{2}$/.test(trimmed)) {
    return trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  return trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*[([]?(?:19|20)\d{2}[\])]?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseMovieSearchIdentity(
  value?: string | null,
): MovieSearchIdentity {
  const rawTitle = value?.trim() ?? '';

  if (!rawTitle) {
    return {
      rawTitle: '',
      cleanTitle: '',
      normalizedTitle: '',
    };
  }

  if (/^(?:19|20)\d{2}$/.test(rawTitle)) {
    const norm = normalizeMovieTitle(rawTitle);
    return {
      rawTitle,
      cleanTitle: rawTitle,
      normalizedTitle: norm,
    };
  }

  const yearMatch = rawTitle.match(/^(.*?)\s*[([]?((?:19|20)\d{2})[\])]?$/i);
  if (yearMatch && yearMatch[1].trim()) {
    const cleanTitle = yearMatch[1].trim();
    const year = yearMatch[2];
    const normalizedTitle = normalizeMovieTitle(cleanTitle);
    return {
      rawTitle,
      cleanTitle,
      year,
      normalizedTitle,
    };
  }

  const normalizedTitle = normalizeMovieTitle(rawTitle);
  return {
    rawTitle,
    cleanTitle: rawTitle,
    normalizedTitle,
  };
}

function createMovieIdentity(item: HomeVodItem): string {
  return parseMovieSearchIdentity(item.tmdbTitle || item.title).normalizedTitle;
}

export function createMovieDetailRequestIdentity(
  item: HomeVodItem,
  sourceId?: string | null,
) {
  return [
    sourceId?.trim() || 'without-source',
    item.id?.trim() || createMovieIdentity(item),
  ].join('::');
}

export function shouldRequestMovieDetailMetadata({
  isMovieDetailPage,
  item,
  sourceId,
}: {
  isMovieDetailPage: boolean;
  item: HomeVodItem | null;
  sourceId?: string | null;
}) {
  return Boolean(
    isMovieDetailPage &&
      item?.kind === 'movie' &&
      sourceId?.trim() &&
      createMovieIdentity(item) &&
      !(
        item.overview?.trim() &&
        item.posterUrl?.trim() &&
        item.backdropUrl?.trim() &&
        item.tmdbGenres?.trim() &&
        item.tmdbRating?.trim() &&
        item.tmdbReleaseYear?.trim()
      ),
  );
}

function createCacheKey(scopeKey: string, movieIdentity: string) {
  return `${MOVIE_HERO_CACHE_PREFIX}::${scopeKey}::${movieIdentity}`;
}

function isMovieHeroCacheEntry(value: unknown): value is MovieHeroCacheEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<MovieHeroCacheEntry>;
  return (
    (entry.status === 'matched' ||
      entry.status === 'no_match' ||
      entry.status === 'error') &&
    typeof entry.expiresAt === 'number'
  );
}

function createImageUrl(
  path: string | null | undefined,
  size: 'w500' | 'w780',
) {
  return path ? `${TMDB_IMAGE_BASE_URL}/${size}${path}` : undefined;
}

function isConfidentMovieMatch(
  result: TmdbMovieResult,
  targetIdentity: MovieSearchIdentity,
) {
  const target = targetIdentity.normalizedTitle;
  if (!target) {
    return false;
  }

  return [result.title, result.original_title]
    .map((val) => normalizeMovieTitle(val))
    .some((candidate) => Boolean(candidate) && candidate === target);
}

function toMetadata(result: TmdbMovieResult): MovieHeroMetadata {
  const genres = (result.genre_ids ?? [])
    .map((genreId) => MOVIE_GENRES_BY_ID.get(genreId))
    .filter((genre): genre is string => Boolean(genre));

  return {
    tmdbId: typeof result.id === 'number' ? String(result.id) : undefined,
    tmdbTitle: result.title || result.original_title,
    overview: result.overview?.trim() || undefined,
    posterUrl: createImageUrl(result.poster_path, 'w500'),
    backdropUrl: createImageUrl(result.backdrop_path, 'w780'),
    tmdbGenres: genres.length > 0 ? genres.join(', ') : undefined,
    tmdbRating:
      typeof result.vote_average === 'number' && result.vote_average > 0
        ? String(Number(result.vote_average.toFixed(2)))
        : undefined,
    tmdbReleaseYear: result.release_date?.slice(0, 4) || undefined,
  };
}

export function applyMovieMetadataLocalFirst(
  item: HomeVodItem,
  metadata?: MovieHeroMetadata,
) {
  if (!metadata) {
    return item;
  }

  const backdropUrl = item.backdropUrl || metadata.backdropUrl;
  const existingCandidates = item.artworkCandidates ?? [];
  const hasBackdropCandidate =
    Boolean(backdropUrl) &&
    existingCandidates.some((candidate) => candidate.url === backdropUrl);

  const artworkCandidates =
    backdropUrl && !hasBackdropCandidate
      ? [
          ...existingCandidates,
          {
            url: backdropUrl,
            source: 'tmdb_backdrop' as const,
            originalScheme: (backdropUrl.startsWith('https')
              ? 'https'
              : 'http') as 'https' | 'http',
            host: (() => {
              try {
                return new URL(backdropUrl).host;
              } catch {
                return 'image.tmdb.org';
              }
            })(),
            upgradedToHttps: false,
          },
        ]
      : existingCandidates;

  return {
    ...item,
    tmdbId: item.tmdbId || metadata.tmdbId,
    tmdbTitle: item.tmdbTitle || metadata.tmdbTitle,
    overview: item.overview || metadata.overview,
    posterUrl: item.posterUrl || metadata.posterUrl,
    backdropUrl,
    artworkCandidates,
    tmdbGenres: item.tmdbGenres || metadata.tmdbGenres,
    tmdbRating: item.tmdbRating || metadata.tmdbRating,
    tmdbReleaseYear: item.tmdbReleaseYear || metadata.tmdbReleaseYear,
  } satisfies HomeVodItem;
}

async function fetchMovieMetadata(
  item: HomeVodItem,
  fetchImpl: typeof fetch,
  apiKey: string,
) {
  if (!apiKey.trim()) {
    return { status: 'error' as const };
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    TMDB_REQUEST_TIMEOUT_MS,
  );

  try {
    const identity = parseMovieSearchIdentity(item.tmdbTitle || item.title);
    if (!identity.cleanTitle) {
      return { status: 'no_match' as const };
    }

    const searchParams = new URLSearchParams({
      api_key: apiKey,
      query: identity.cleanTitle,
      language: 'pt-BR',
      include_adult: 'false',
      page: '1',
    });
    if (identity.year) {
      searchParams.append('year', identity.year);
    }

    const response = await fetchImpl(
      `${TMDB_API_BASE_URL}/search/movie?${searchParams.toString()}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return { status: 'error' as const };
    }

    const payload = (await response.json()) as { results?: TmdbMovieResult[] };
    const result = payload.results?.find((candidate) =>
      isConfidentMovieMatch(candidate, identity),
    );

    if (!result) {
      return { status: 'no_match' as const };
    }

    return { status: 'matched' as const, metadata: toMetadata(result) };
  } catch {
    return { status: 'error' as const };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function createLocalMovieMetadataCache(): MovieMetadataCache {
  return {
    async get(key) {
      return (await getLocalCatalogMetadata(key))?.value ?? null;
    },
    async set(key, entry) {
      await putLocalCatalogMetadata({
        key,
        value: entry,
        updatedAt: new Date().toISOString(),
      });
    },
  };
}

export async function enrichMovieHeroItems(
  items: HomeVodItem[],
  {
    sourceId,
    limit = MOVIE_HERO_ENRICHMENT_LIMIT,
    fetchImpl = globalThis.fetch,
    apiKey = env.tmdbApiKey,
    detailMode = false,
    scopeKey: providedScopeKey,
    cache = createLocalMovieMetadataCache(),
  }: MovieMetadataEnrichmentOptions = {},
) {
  const boundedItems = items
    .filter(
      (item) =>
        item.kind === 'movie' &&
        (detailMode
          ? shouldRequestMovieDetailMetadata({
              isMovieDetailPage: true,
              item,
              sourceId,
            })
          : !item.backdropUrl),
    )
    .slice(0, Math.max(0, limit));

  if (boundedItems.length === 0) {
    return items;
  }

  const scopeKey =
    providedScopeKey ??
    (sourceId?.trim()
      ? await resolveSeriesMetadataCacheScopeKey(sourceId).catch(() => null)
      : null);

  if (!scopeKey) {
    return items;
  }

  const effectiveScopeKey = scopeKey;
  const enrichedById = new Map<string, HomeVodItem>();
  let nextIndex = 0;

  async function enrichNext() {
    for (;;) {
      const item = boundedItems[nextIndex];
      nextIndex += 1;

      if (!item) {
        return;
      }

      const movieIdentity = createMovieIdentity(item);
      if (!movieIdentity) {
        continue;
      }

      const cacheKey = createCacheKey(effectiveScopeKey, movieIdentity);
      const cachedValue = await cache.get(cacheKey).catch(() => null);
      const cachedEntry = isMovieHeroCacheEntry(cachedValue)
        ? cachedValue
        : null;

      if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
        enrichedById.set(
          item.id,
          applyMovieMetadataLocalFirst(item, cachedEntry.metadata),
        );
        continue;
      }

      const result = await fetchMovieMetadata(item, fetchImpl, apiKey);
      const ttl =
        result.status === 'matched'
          ? MOVIE_HERO_MATCHED_TTL_MS
          : result.status === 'no_match'
            ? MOVIE_HERO_NO_MATCH_TTL_MS
            : MOVIE_HERO_ERROR_TTL_MS;
      const entry: MovieHeroCacheEntry = {
        status: result.status,
        metadata: result.status === 'matched' ? result.metadata : undefined,
        expiresAt: Date.now() + ttl,
      };

      await cache.set(cacheKey, entry).catch(() => undefined);
      enrichedById.set(
        item.id,
        applyMovieMetadataLocalFirst(item, entry.metadata),
      );
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          MOVIE_HERO_ENRICHMENT_CONCURRENCY,
          boundedItems.length,
        ),
      },
      () => enrichNext(),
    ),
  );

  return items.map((item) => enrichedById.get(item.id) ?? item);
}

export async function enrichMovieDetailItem(
  item: HomeVodItem,
  options: Omit<MovieMetadataEnrichmentOptions, 'limit' | 'detailMode'> = {},
) {
  const [enrichedItem] = await enrichMovieHeroItems([item], {
    ...options,
    limit: 1,
    detailMode: true,
  });

  return enrichedItem ?? item;
}
