import { env } from '@/config/env';
import { normalizeSeriesCollectionTitle } from '@/features/localCatalog/services/localCatalogSeriesIdentity.service';

import type { HomeVodItem } from './homeVod.service';
import type {
  ProviderLookupResult,
  SeriesMetadataResolution,
  SeriesMetadataCache,
  SeriesMetadataProvider,
  SeriesMetadataQuery,
} from './seriesMetadata.types';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const SERIES_HERO_TMDB_CACHE_STORAGE_KEY = 'xandeflix:series-hero-tmdb:v2';
const SERIES_HERO_TMDB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SERIES_HERO_TMDB_CACHE_LIMIT = 80;
const SERIES_HERO_TMDB_CONCURRENCY = 3;
const SERIES_CARD_ENRICHMENT_LIMIT = 18;
const TMDB_REQUEST_TIMEOUT_MS = 8000;

type TmdbSearchResult = {
  id: number;
  name?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
};

type TmdbSearchResponse = {
  results?: TmdbSearchResult[];
};

type SeriesHeroTmdbMetadata = Pick<
  HomeVodItem,
  | 'tmdbId'
  | 'tmdbTitle'
  | 'overview'
  | 'posterUrl'
  | 'backdropUrl'
  | 'tmdbGenres'
  | 'tmdbRating'
  | 'tmdbReleaseYear'
>;

type SeriesHeroTmdbCacheEntry = {
  createdAt: number;
  metadata: SeriesHeroTmdbMetadata | null;
};

type SeriesHeroTmdbCache = Record<string, SeriesHeroTmdbCacheEntry>;

const TV_GENRES_BY_ID = new Map<number, string>([
  [10759, 'Ação e Aventura'],
  [16, 'Animação'],
  [35, 'Comédia'],
  [80, 'Crime'],
  [99, 'Documentário'],
  [18, 'Drama'],
  [10751, 'Família'],
  [10762, 'Infantil'],
  [9648, 'Mistério'],
  [10763, 'Notícias'],
  [10764, 'Reality'],
  [10765, 'Ficção Científica e Fantasia'],
  [10766, 'Novela'],
  [10767, 'Talk Show'],
  [10768, 'Guerra e Política'],
  [37, 'Faroeste'],
]);

let memoryCache: SeriesHeroTmdbCache | null = null;

function normalizeTitle(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*S\d{1,3}\s*-?\s*E\d{1,4}.*$/i, '')
    .replace(/\s*T\d{1,3}\s*-?\s*E\d{1,4}.*$/i, '')
    .replace(/\s*\d{1,3}x\d{1,4}.*$/i, '')
    .replace(/\s*-\s*episodio\s*\d+.*$/i, '')
    .replace(/\s*ep\.?\s*\d+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function removeTrailingYear(value: string) {
  return value.replace(/\s+(19|20)\d{2}\s*$/i, '').trim();
}

function getTrailingYear(value: string) {
  return value.match(/\b((?:19|20)\d{2})\s*$/)?.[1] ?? null;
}

function getSeriesHeroTmdbCacheKey(item: HomeVodItem) {
  return normalizeTitle(item.seriesKey || item.tmdbTitle || item.title);
}

function readCache() {
  if (memoryCache) {
    return memoryCache;
  }

  if (typeof window === 'undefined') {
    memoryCache = {};
    return memoryCache;
  }

  try {
    memoryCache = JSON.parse(
      window.localStorage.getItem(SERIES_HERO_TMDB_CACHE_STORAGE_KEY) ?? '{}',
    ) as SeriesHeroTmdbCache;
  } catch {
    memoryCache = {};
  }

  return memoryCache;
}

function persistCache(cache: SeriesHeroTmdbCache) {
  if (typeof window === 'undefined') {
    return;
  }

  const entries = Object.entries(cache)
    .sort(([, left], [, right]) => right.createdAt - left.createdAt)
    .slice(0, SERIES_HERO_TMDB_CACHE_LIMIT);

  memoryCache = Object.fromEntries(entries);

  try {
    window.localStorage.setItem(
      SERIES_HERO_TMDB_CACHE_STORAGE_KEY,
      JSON.stringify(memoryCache),
    );
  } catch {
    // Cache persistence is best effort; runtime enrichment can still proceed.
  }
}

function getFreshCachedMetadata(key: string) {
  const entry = readCache()[key];

  if (
    !entry ||
    Date.now() - entry.createdAt >= SERIES_HERO_TMDB_CACHE_TTL_MS
  ) {
    return undefined;
  }

  return entry.metadata;
}

export function getCachedSeriesHeroBackdropUrls(limit: number) {
  const currentTime = Date.now();

  return Array.from(
    new Set(
      Object.values(readCache())
        .filter(
          (entry) =>
            currentTime - entry.createdAt < SERIES_HERO_TMDB_CACHE_TTL_MS,
        )
        .map((entry) => entry.metadata?.backdropUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ).slice(0, limit);
}

export function hydrateSeriesHeroHighlightsFromCache(items: HomeVodItem[]) {
  return items.map((item) => {
    const key = getSeriesHeroTmdbCacheKey(item);
    const metadata = key ? getFreshCachedMetadata(key) : undefined;

    return metadata ? { ...item, ...metadata } : item;
  });
}

function createImageUrl(path: string | null | undefined, size: 'w500' | 'w780') {
  return path ? `${TMDB_IMAGE_BASE_URL}/${size}${path}` : undefined;
}

function resolveReleaseYear(result: TmdbSearchResult) {
  return result.first_air_date?.slice(0, 4) || undefined;
}

function resolveGenres(result: TmdbSearchResult) {
  return (result.genre_ids ?? [])
    .map((genreId) => TV_GENRES_BY_ID.get(genreId))
    .filter((genre): genre is string => Boolean(genre));
}

function getResultScore(
  result: TmdbSearchResult,
  targetTitle: string,
  targetYear: string | null,
) {
  const resultTitle = normalizeTitle(result.name || result.original_name);
  const normalizedTarget = removeTrailingYear(targetTitle);
  const normalizedResult = removeTrailingYear(resultTitle);
  let score = 0;

  if (normalizedResult === normalizedTarget) score += 1000;

  if (normalizedTarget.startsWith(`${normalizedResult} `)) {
    score += 260;
  } else if (normalizedResult.startsWith(`${normalizedTarget} `)) {
    const additionalWordCount = normalizedResult
      .slice(normalizedTarget.length)
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    score += 220 - Math.min(additionalWordCount * 20, 80);
  } else if (
    normalizedResult.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedResult)
  ) {
    score += 100;
  }

  if (targetYear && resolveReleaseYear(result) === targetYear) score += 100;
  if (result.backdrop_path) score += 50;
  if (result.overview?.trim()) score += 25;
  if (result.poster_path) score += 10;
  if (result.vote_average && result.vote_average > 0) score += 5;

  return score;
}

export function isConfidentTmdbSeriesTitleMatch(
  result: Pick<TmdbSearchResult, 'name' | 'original_name'>,
  query: string,
) {
  const normalizedTarget = removeTrailingYear(normalizeTitle(query));

  return [result.name, result.original_name]
    .map((title) => removeTrailingYear(normalizeTitle(title)))
    .some(
      (normalizedResult) =>
        Boolean(normalizedResult) && normalizedResult === normalizedTarget,
    );
}

function pickBestResult(results: TmdbSearchResult[], query: string) {
  const targetYear = getTrailingYear(query);
  const sortedResults = results
    .filter((result) => isConfidentTmdbSeriesTitleMatch(result, query))
    .sort(
    (left, right) =>
      getResultScore(right, query, targetYear) -
      getResultScore(left, query, targetYear),
    );
  const bestResult = sortedResults[0];

  if (!bestResult || getResultScore(bestResult, query, targetYear) < 180) {
    return null;
  }

  return bestResult;
}

function createRequestSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  let didTimeout = false;
  const abortFromCaller = () => controller.abort();
  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abortFromCaller, {
      once: true,
    });
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    dispose: () => {
      globalThis.clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

export class TmdbSeriesMetadataProvider implements SeriesMetadataProvider {
  readonly id = 'tmdb' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly apiKey: string;

  constructor({
    fetchImpl = globalThis.fetch,
    timeoutMs = TMDB_REQUEST_TIMEOUT_MS,
    apiKey = env.tmdbApiKey,
  }: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    apiKey?: string;
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.apiKey = apiKey;
  }

  private async search(
    query: string,
    signal?: AbortSignal,
  ): Promise<TmdbSearchResult[]> {
    const request = createRequestSignal(signal, this.timeoutMs);

    try {
      const searchParams = new URLSearchParams({
        api_key: this.apiKey,
        query,
        language: 'pt-BR',
        include_adult: 'false',
        page: '1',
      });
      const response = await this.fetchImpl(
        `${TMDB_API_BASE_URL}/search/tv?${searchParams.toString()}`,
        {
          headers: {
            Accept: 'application/json',
          },
          signal: request.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`TMDB_HTTP_${response.status}`);
      }

      let data: TmdbSearchResponse;

      try {
        data = (await response.json()) as TmdbSearchResponse;
      } catch {
        throw new Error('TMDB_PARSE_ERROR');
      }

      if (!Array.isArray(data.results)) {
        throw new Error('TMDB_PARSE_ERROR');
      }

      return data.results;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          request.didTimeout() ? 'TMDB_TIMEOUT' : 'TMDB_ABORTED',
          { cause: error },
        );
      }

      throw error;
    } finally {
      request.dispose();
    }
  }

  async lookup(
    query: SeriesMetadataQuery,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderLookupResult> {
    if (!this.apiKey.trim()) {
      return {
        status: 'error',
        errorCode: 'TMDB_API_KEY_UNAVAILABLE',
      };
    }

    const cacheKey = normalizeTitle(query.seriesKey);
    const cachedMetadata = cacheKey
      ? getFreshCachedMetadata(cacheKey)
      : undefined;

    if (cachedMetadata) {
      return {
        status: 'matched',
        metadata: {
          provider: 'tmdb',
          providerId: cachedMetadata.tmdbId ?? '',
          canonicalTitle:
            cachedMetadata.tmdbTitle ?? query.canonicalTitle,
          originalTitle: cachedMetadata.tmdbTitle,
          releaseYear: cachedMetadata.tmdbReleaseYear,
          overview: cachedMetadata.overview,
          genres: cachedMetadata.tmdbGenres
            ?.split(',')
            .map((genre) => genre.trim())
            .filter(Boolean),
          rating: cachedMetadata.tmdbRating
            ? Number(cachedMetadata.tmdbRating)
            : undefined,
          posterUrl: cachedMetadata.posterUrl,
          backdropUrl: cachedMetadata.backdropUrl,
          matchStatus: 'matched',
          updatedAt: new Date().toISOString(),
        },
      };
    }

    const normalizedQuery = normalizeTitle(query.canonicalTitle);
    const fallbackQuery = removeTrailingYear(normalizedQuery);
    let results = await this.search(normalizedQuery, options?.signal);

    if (results.length === 0 && fallbackQuery !== normalizedQuery) {
      results = await this.search(fallbackQuery, options?.signal);
    }

    const result = pickBestResult(results, normalizedQuery);

    if (!result) {
      return { status: 'no_match' };
    }

    const genres = resolveGenres(result);
    const heroMetadata: SeriesHeroTmdbMetadata = {
      tmdbId: String(result.id),
      tmdbTitle: result.name || result.original_name,
      overview: result.overview?.trim() || undefined,
      posterUrl: createImageUrl(result.poster_path, 'w500'),
      backdropUrl: createImageUrl(result.backdrop_path, 'w780'),
      tmdbGenres: genres.length > 0 ? genres.join(', ') : undefined,
      tmdbRating:
        typeof result.vote_average === 'number' && result.vote_average > 0
          ? String(Number(result.vote_average.toFixed(2)))
          : undefined,
      tmdbReleaseYear: resolveReleaseYear(result),
    };

    if (cacheKey) {
      const cache = readCache();
      cache[cacheKey] = {
        createdAt: Date.now(),
        metadata: heroMetadata,
      };
      persistCache(cache);
    }

    return {
      status: 'matched',
      metadata: {
        provider: 'tmdb',
        providerId: String(result.id),
        canonicalTitle:
          result.name || result.original_name || query.canonicalTitle,
        originalTitle: result.original_name,
        releaseYear: resolveReleaseYear(result),
        overview: result.overview?.trim() || undefined,
        genres: genres.length > 0 ? genres : undefined,
        rating:
          typeof result.vote_average === 'number' &&
          result.vote_average > 0
            ? result.vote_average
            : undefined,
        voteCount:
          typeof result.vote_count === 'number' && result.vote_count >= 0
            ? result.vote_count
            : undefined,
        posterUrl: heroMetadata.posterUrl,
        backdropUrl: heroMetadata.backdropUrl,
        matchStatus: 'matched',
        updatedAt: new Date().toISOString(),
      },
    };
  }
}

export function createSeriesMetadataQuery(
  item: HomeVodItem,
): SeriesMetadataQuery | null {
  const originalTitle = item.tmdbTitle || item.title;
  const canonicalTitle =
    normalizeSeriesCollectionTitle(originalTitle) || originalTitle.trim();
  const seriesKey =
    item.seriesKey?.trim() || canonicalTitle.toLowerCase();

  if (!seriesKey || !canonicalTitle) {
    return null;
  }

  return {
    seriesKey,
    canonicalTitle,
    originalTitle,
    releaseYear: item.tmdbReleaseYear || getTrailingYear(originalTitle) || undefined,
  };
}

export function applyResolvedSeriesMetadata(
  item: HomeVodItem,
  resolution: SeriesMetadataResolution,
) {
  if (resolution.matchStatus !== 'matched') {
    return item;
  }

  const metadata = resolution.metadata;
  const tmdbProviderId =
    metadata.provider === 'tmdb'
      ? metadata.providerId
      : item.tmdbId;

  const backdropUrl = metadata.backdropUrl || item.backdropUrl;
  const existingCandidates = item.artworkCandidates ?? [];
  const backdropSource =
    metadata.provider === 'tvmaze'
      ? ('tvmaze_background' as const)
      : ('tmdb_backdrop' as const);
  const hasBackdropCandidate =
    Boolean(backdropUrl) &&
    existingCandidates.some((candidate) => candidate.url === backdropUrl);

  const artworkCandidates =
    backdropUrl && !hasBackdropCandidate
      ? [
          ...existingCandidates,
          {
            url: backdropUrl,
            source: backdropSource,
            originalScheme: (backdropUrl.startsWith('https')
              ? 'https'
              : 'http') as 'https' | 'http',
            host: (() => {
              try {
                return new URL(backdropUrl).host;
              } catch {
                return metadata.provider === 'tvmaze'
                  ? 'api.tvmaze.com'
                  : 'image.tmdb.org';
              }
            })(),
            upgradedToHttps: false,
          },
        ]
      : existingCandidates;

  return {
    ...item,
    tmdbId: tmdbProviderId,
    tmdbTitle: metadata.canonicalTitle || item.tmdbTitle,
    overview: metadata.overview || item.overview,
    posterUrl: metadata.posterUrl || item.posterUrl,
    backdropUrl,
    artworkCandidates,
    tmdbGenres:
      metadata.genres && metadata.genres.length > 0
        ? metadata.genres.join(', ')
        : item.tmdbGenres,
    tmdbRating:
      metadata.rating !== undefined
        ? String(Number(metadata.rating.toFixed(2)))
        : item.tmdbRating,
    tmdbReleaseYear: metadata.releaseYear || item.tmdbReleaseYear,
    metadataProvider: metadata.provider,
    metadataProviderId: metadata.providerId,
    metadataProvenance: metadata.provenance,
    metadataSourceUrls: metadata.sourceUrls,
  } satisfies HomeVodItem;
}

export async function enrichSeriesHeroHighlights(
  items: HomeVodItem[],
  options: { sourceId?: string } = {},
) {
  return enrichSeriesMetadataItems(items, options);
}

type SeriesMetadataEnrichmentDependencies = {
  primaryProvider?: SeriesMetadataProvider;
  fallbackProvider?: SeriesMetadataProvider;
  cache?: SeriesMetadataCache;
  scopeKey?: string;
};

async function enrichSeriesMetadataItems(
  items: HomeVodItem[],
  options: { sourceId?: string } = {},
  dependencies: SeriesMetadataEnrichmentDependencies = {},
) {
  if (items.length === 0) {
    return items;
  }

  const [
    {
      createLocalSeriesMetadataCache,
      resolveSeriesMetadataCacheScopeKey,
    },
    { createSeriesMetadataResolver },
    { TvmazeSeriesMetadataProvider },
  ] = await Promise.all([
    import('./seriesMetadataCache.service'),
    import('./seriesMetadataResolver.service'),
    import('./tvmazeSeriesMetadata.provider'),
  ]);
  const noPersistentCache: SeriesMetadataCache = {
    get: async () => null,
    set: async () => undefined,
  };
  const primaryProvider =
    dependencies.primaryProvider ?? new TmdbSeriesMetadataProvider();
  const fallbackProvider =
    dependencies.fallbackProvider ?? new TvmazeSeriesMetadataProvider();
  const sourceId = options.sourceId?.trim() ?? '';
  const scopeKey =
    dependencies.scopeKey ??
    (sourceId
      ? await resolveSeriesMetadataCacheScopeKey(sourceId).catch(() => null)
      : null);
  const resolver = createSeriesMetadataResolver({
    primaryProvider,
    fallbackProvider,
    cache:
      dependencies.cache ??
      (scopeKey ? createLocalSeriesMetadataCache() : noPersistentCache),
  });
  const effectiveScopeKey = scopeKey ?? 'uncached-runtime';
  const enrichedItems = [...items];
  let nextIndex = 0;

  async function enrichNextItem() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= enrichedItems.length) {
        return;
      }

      const item = enrichedItems[index];

      if (!item) {
        return;
      }

      const query = createSeriesMetadataQuery(item);

      if (!query) {
        continue;
      }

      const resolution = await resolver({
        scopeKey: effectiveScopeKey,
        query,
      });
      enrichedItems[index] = applyResolvedSeriesMetadata(item, resolution);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(SERIES_HERO_TMDB_CONCURRENCY, enrichedItems.length) },
      () => enrichNextItem(),
    ),
  );

  return enrichedItems;
}

export function isSeriesCardPosterEnrichmentNeeded(item: HomeVodItem) {
  if (item.metadataProvenance?.posterUrl) {
    return false;
  }

  if (!item.posterUrl?.trim()) {
    return true;
  }

  const currentPosterCandidate = item.artworkCandidates?.find(
    (candidate) => candidate.url === item.posterUrl,
  );

  return currentPosterCandidate?.source === 'tvg';
}

export async function enrichSeriesCardPosters(
  items: HomeVodItem[],
  options: { sourceId?: string; limit?: number } = {},
  dependencies: SeriesMetadataEnrichmentDependencies = {},
) {
  const boundedCandidates = items
    .filter(isSeriesCardPosterEnrichmentNeeded)
    .slice(
      0,
      Math.max(0, options.limit ?? SERIES_CARD_ENRICHMENT_LIMIT),
    );

  if (boundedCandidates.length === 0) {
    return items;
  }

  const enrichedCandidates = await enrichSeriesMetadataItems(
    boundedCandidates,
    { sourceId: options.sourceId },
    dependencies,
  );
  const enrichedById = new Map(
    enrichedCandidates.map((item) => [item.id, item]),
  );

  return items.map((item) => enrichedById.get(item.id) ?? item);
}
