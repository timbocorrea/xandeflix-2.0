import type { HomeVodItem } from './homeVod.service';

const SERIES_DETAIL_EPISODES_CACHE_PREFIX = 'xandeflix:series-detail-episodes:v1:';
const SERIES_DETAIL_EPISODES_CACHE_LIMIT = 500;

export type SeriesEpisodesCacheInput = {
  licenseCode: string;
  deviceIdentifier: string;
  groupTitles: string[];
  tmdbId?: string | null;
  tmdbTitle?: string | null;
};

function normalizeSeriesCacheKey(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getSeriesEpisodesCacheKey(input: SeriesEpisodesCacheInput) {
  const identity =
    normalizeSeriesCacheKey(input.tmdbId) ||
    normalizeSeriesCacheKey(input.tmdbTitle);

  if (!identity) {
    return null;
  }

  const groupsKey = input.groupTitles
    .map((groupTitle) => normalizeSeriesCacheKey(groupTitle))
    .filter(Boolean)
    .sort()
    .join('__');

  return [
    SERIES_DETAIL_EPISODES_CACHE_PREFIX,
    normalizeSeriesCacheKey(input.licenseCode),
    normalizeSeriesCacheKey(input.deviceIdentifier),
    groupsKey,
    identity,
  ].join(':');
}

export function readCachedSeriesEpisodes(input: SeriesEpisodesCacheInput) {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const cacheKey = getSeriesEpisodesCacheKey(input);

    if (!cacheKey) {
      return [];
    }

    const rawValue = window.localStorage.getItem(cacheKey);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as HomeVodItem[];
  } catch {
    return [];
  }
}

export function storeCachedSeriesEpisodes(
  input: SeriesEpisodesCacheInput,
  items: HomeVodItem[],
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cacheKey = getSeriesEpisodesCacheKey(input);

    if (!cacheKey || items.length === 0) {
      return;
    }

    window.localStorage.setItem(
      cacheKey,
      JSON.stringify(items.slice(0, SERIES_DETAIL_EPISODES_CACHE_LIMIT)),
    );
  } catch {
    // Cache best-effort. Falha nao deve bloquear a navegacao.
  }
}
