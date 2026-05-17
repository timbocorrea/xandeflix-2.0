import { env } from '@/config/env';

import type { CatalogItem, CatalogSection } from '../types';

const TMDB_SEARCH_BASE_URL = 'https://api.themoviedb.org/3/search';
const MAX_TMDB_ITEMS = 18;

type TmdbSearchResult = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
};

type TmdbSearchResponse = {
  results?: TmdbSearchResult[];
};

type TmdbMatch = {
  tmdbId: number;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  year?: string;
  rating?: string;
};

const tmdbMatchCache = new Map<string, Promise<TmdbMatch | null>>();

const LOCAL_TMDB_MATCHES: Record<string, TmdbMatch> = {
  'ataque terrorista': {
    tmdbId: 14076,
    posterPath: '/s2q2BIcVRXheJHZpdi6CYDlCGGX.jpg',
    overview:
      'Filme que acompanha a policia inglesa apos a ordem de atirar em suspeitos de terrorismo depois dos atentados de Londres em 2005.',
    year: '2007',
    rating: '6.2',
  },
  'foxter max um cachorro de outro mundo': {
    tmdbId: 611014,
    posterPath: '/zmJNzjmWGwqKCNdUZ81mu53HtRg.jpg',
    backdropPath: '/xgBjOcLGnjFs4N2LAR64cV3awDB.jpg',
    overview:
      'Um garoto descobre que o cachorro que pintou em um grafite ganhou vida como um supercao criado por nanotecnologia.',
    year: '2019',
    rating: '7.2',
  },
  'guerra ao trafico': {
    tmdbId: 1169368,
    posterPath: '/ef0x4S5JBZp7Vqkct2R4oXkawgP.jpg',
    backdropPath: '/6DEwPkgf4tUJiBrovVrWjoAjgNl.jpg',
    overview:
      'Uma estudante de medicina foge para o deserto americano depois de descobrir a ligacao do irmao com um cartel.',
    year: '2023',
    rating: '5.5',
  },
};

function isVodCatalogItem(item: CatalogItem) {
  return item.mediaType === 'movie' || item.mediaType === 'series';
}

function normalizeSearchTitle(title: string) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fhd|hd|sd|4k|uhd|h265|hevc|dual audio|dublado|legendado)\b/gi, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\([^\)]*\b(19|20)\d{2}\b[^\)]*\)/g, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\b(filmes?|series?|vod)\b/gi, '')
    .replace(/&/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .toLowerCase()
    .trim();
}

function getLocalTmdbMatch(query: string) {
  const exactMatch = LOCAL_TMDB_MATCHES[query];

  if (exactMatch) {
    return exactMatch;
  }

  const localEntry = Object.entries(LOCAL_TMDB_MATCHES).find(([localTitle]) => {
    return query.includes(localTitle) || localTitle.includes(query);
  });

  return localEntry?.[1] ?? null;
}

function getSearchType(item: CatalogItem) {
  return item.mediaType === 'series' ? 'tv' : 'movie';
}

function getYearFromResult(result: TmdbSearchResult) {
  const date = result.release_date || result.first_air_date;

  return date?.slice(0, 4);
}

function mapTmdbResult(result: TmdbSearchResult): TmdbMatch | null {
  if (!result.poster_path && !result.backdrop_path) {
    return null;
  }

  return {
    tmdbId: result.id,
    posterPath: result.poster_path ?? undefined,
    backdropPath: result.backdrop_path ?? undefined,
    overview: result.overview?.trim() || undefined,
    year: getYearFromResult(result),
    rating:
      typeof result.vote_average === 'number' && result.vote_average > 0
        ? result.vote_average.toFixed(1)
        : undefined,
  };
}

async function fetchTmdbMatch(item: CatalogItem): Promise<TmdbMatch | null> {
  const apiKey = env.tmdbApiKey.trim();
  const query = normalizeSearchTitle(item.title);
  const localMatch = getLocalTmdbMatch(query);

  if (localMatch) {
    return localMatch;
  }

  if (!apiKey || !query) {
    return null;
  }

  const searchType = getSearchType(item);
  const cacheKey = `${searchType}:${query.toLowerCase()}`;
  const cachedMatch = tmdbMatchCache.get(cacheKey);

  if (cachedMatch) {
    return cachedMatch;
  }

  const request = (async () => {
    try {
      const searchUrl = new URL(`${TMDB_SEARCH_BASE_URL}/${searchType}`);

      searchUrl.searchParams.set('api_key', apiKey);
      searchUrl.searchParams.set('language', 'pt-BR');
      searchUrl.searchParams.set('include_adult', 'false');
      searchUrl.searchParams.set('query', query);

      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as TmdbSearchResponse;
      const firstResult = payload.results?.find(
        (result) => result.poster_path || result.backdrop_path,
      );

      return firstResult ? mapTmdbResult(firstResult) : null;
    } catch {
      return null;
    }
  })();

  tmdbMatchCache.set(cacheKey, request);
  return request;
}

async function enrichCatalogItemWithTmdb(item: CatalogItem) {
  if (!isVodCatalogItem(item)) {
    return item;
  }

  const tmdbMatch = await fetchTmdbMatch(item);

  if (!tmdbMatch) {
    return item;
  }

  return {
    ...item,
    tmdbId: tmdbMatch.tmdbId,
    posterPath: tmdbMatch.posterPath ?? item.posterPath,
    backdropPath: tmdbMatch.backdropPath ?? item.backdropPath,
    overview: tmdbMatch.overview ?? item.overview,
    year: item.year ?? tmdbMatch.year,
    rating: item.rating ?? tmdbMatch.rating,
  };
}

export async function enrichCatalogSectionsWithTmdb(
  sections: CatalogSection[],
): Promise<CatalogSection[]> {
  let remainingItems = MAX_TMDB_ITEMS;

  const enrichedSections = await Promise.all(
    sections.map(async (section) => {
      const itemsToEnrich = section.items.slice(0, remainingItems);
      remainingItems = Math.max(0, remainingItems - itemsToEnrich.length);

      const enrichedItems = await Promise.all(
        itemsToEnrich.map(enrichCatalogItemWithTmdb),
      );

      return {
        ...section,
        items: [...enrichedItems, ...section.items.slice(itemsToEnrich.length)],
      };
    }),
  );

  return enrichedSections;
}
