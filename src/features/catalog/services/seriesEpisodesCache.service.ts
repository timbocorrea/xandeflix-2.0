import type { HomeVodItem } from './homeVod.service';

const SERIES_DETAIL_EPISODES_CACHE_PREFIX = 'xandeflix:series-detail-episodes:v2:';

export type SeriesEpisodesCacheInput = {
  licenseCode: string;
  deviceIdentifier: string;
  sourceId?: string | null;
  seriesKey?: string | null;
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
    normalizeSeriesCacheKey(input.seriesKey) ||
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
    normalizeSeriesCacheKey(input.sourceId) || 'source-unavailable',
    groupsKey,
    identity,
  ].join(':');
}

function isCachedSeriesEpisode(item: unknown): item is HomeVodItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as Partial<HomeVodItem>;

  return (
    typeof candidate.id === 'string' &&
    Boolean(candidate.id.trim()) &&
    typeof candidate.title === 'string' &&
    Boolean(candidate.title.trim()) &&
    typeof candidate.streamUrl === 'string' &&
    Boolean(candidate.streamUrl.trim()) &&
    candidate.isSeriesCollection !== true
  );
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

    return parsed.filter(isCachedSeriesEpisode);
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
      JSON.stringify(items.filter(isCachedSeriesEpisode)),
    );
  } catch {
    // Cache best-effort. Falha nao deve bloquear a navegacao.
  }
}
