export const MOVIE_HERO_CACHE_PREFIX = 'movie-hero-metadata:v2';

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
    const normalizedTitle = normalizeMovieTitle(rawTitle);
    return {
      rawTitle,
      cleanTitle: rawTitle,
      normalizedTitle,
    };
  }

  const yearMatch = rawTitle.match(/^(.*?)\s*[([]?((?:19|20)\d{2})[\])]?$/i);
  if (yearMatch && yearMatch[1].trim()) {
    const cleanTitle = yearMatch[1].trim();
    const year = yearMatch[2];
    return {
      rawTitle,
      cleanTitle,
      year,
      normalizedTitle: normalizeMovieTitle(cleanTitle),
    };
  }

  return {
    rawTitle,
    cleanTitle: rawTitle,
    normalizedTitle: normalizeMovieTitle(rawTitle),
  };
}

export function createMovieMetadataCacheKey(
  scopeKey: string,
  movieIdentity: string,
) {
  return `${MOVIE_HERO_CACHE_PREFIX}::${scopeKey}::${movieIdentity}`;
}
