import { env } from '@/config/env';

import type { HomeVodItem } from './homeVod.service';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const SERIES_HERO_TMDB_CACHE_STORAGE_KEY = 'xandeflix:series-hero-tmdb:v2';
const SERIES_HERO_TMDB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SERIES_HERO_TMDB_CACHE_LIMIT = 80;
const SERIES_HERO_TMDB_CONCURRENCY = 3;
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
  const genres = (result.genre_ids ?? [])
    .map((genreId) => TV_GENRES_BY_ID.get(genreId))
    .filter((genre): genre is string => Boolean(genre));

  return genres.length > 0 ? genres.join(', ') : undefined;
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

function pickBestResult(results: TmdbSearchResult[], query: string) {
  const targetYear = getTrailingYear(query);
  const sortedResults = [...results].sort(
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

async function searchSeriesTmdb(query: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TMDB_REQUEST_TIMEOUT_MS);

  try {
    const searchParams = new URLSearchParams({
      api_key: env.tmdbApiKey,
      query,
      language: 'pt-BR',
      include_adult: 'false',
      page: '1',
    });
    const response = await fetch(
      `${TMDB_API_BASE_URL}/search/tv?${searchParams.toString()}`,
      {
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`TMDB_HTTP_${response.status}`);
    }

    const data = (await response.json()) as TmdbSearchResponse;

    return data.results ?? [];
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchSeriesHeroTmdbMetadata(item: HomeVodItem) {
  const key = getSeriesHeroTmdbCacheKey(item);

  if (!key) {
    return null;
  }

  const cachedMetadata = getFreshCachedMetadata(key);

  if (cachedMetadata !== undefined) {
    return cachedMetadata;
  }

  const query = normalizeTitle(item.tmdbTitle || item.title);
  const fallbackQuery = removeTrailingYear(query);
  let results = await searchSeriesTmdb(query);

  if (results.length === 0 && fallbackQuery !== query) {
    results = await searchSeriesTmdb(fallbackQuery);
  }

  const result = pickBestResult(results, query);
  const metadata: SeriesHeroTmdbMetadata | null = result
    ? {
        tmdbId: String(result.id),
        tmdbTitle: result.name || result.original_name,
        overview: result.overview?.trim() || undefined,
        backdropUrl: createImageUrl(result.backdrop_path, 'w780'),
        tmdbGenres: resolveGenres(result),
        tmdbRating:
          typeof result.vote_average === 'number' && result.vote_average > 0
            ? String(Number(result.vote_average.toFixed(2)))
            : undefined,
        tmdbReleaseYear: resolveReleaseYear(result),
      }
    : null;
  const cache = readCache();

  cache[key] = {
    createdAt: Date.now(),
    metadata,
  };
  persistCache(cache);

  return metadata;
}

export async function enrichSeriesHeroHighlights(items: HomeVodItem[]) {
  if (!env.tmdbApiKey || items.length === 0) {
    return items;
  }

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

      try {
        const metadata = await fetchSeriesHeroTmdbMetadata(item);

        if (metadata) {
          enrichedItems[index] = {
            ...item,
            ...metadata,
          };
        }
      } catch {
        // Keep the original grouped item if TMDB is unavailable.
      }
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
