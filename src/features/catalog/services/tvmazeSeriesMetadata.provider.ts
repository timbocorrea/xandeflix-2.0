import type {
  ProviderLookupResult,
  SeriesMetadataProvider,
  SeriesMetadataQuery,
} from './seriesMetadata.types';

const TVMAZE_API_BASE_URL = 'https://api.tvmaze.com';
const TVMAZE_REQUEST_TIMEOUT_MS = 8000;

type TvmazeShow = {
  id?: unknown;
  url?: unknown;
  name?: unknown;
  genres?: unknown;
  premiered?: unknown;
  rating?: {
    average?: unknown;
  } | null;
  image?: {
    medium?: unknown;
    original?: unknown;
  } | null;
  summary?: unknown;
};

type TvmazeSearchResult = {
  score?: unknown;
  show?: TvmazeShow;
};

type TvmazeImageResolution = {
  url?: unknown;
  width?: unknown;
  height?: unknown;
};

type TvmazeImageItem = {
  type?: unknown;
  resolutions?: {
    original?: TvmazeImageResolution;
    medium?: TvmazeImageResolution;
  } | null;
};

function normalizeSearchTitle(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isConfidentTvmazeTitleMatch(
  providerTitle: string,
  query: SeriesMetadataQuery,
) {
  const showTitle = normalizeSearchTitle(providerTitle);
  const targetTitle = normalizeSearchTitle(query.canonicalTitle);

  return Boolean(showTitle && targetTitle && showTitle === targetTitle);
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined;
}

function asOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function stripSummaryMarkup(value: unknown) {
  const summary = asOptionalString(value);

  if (!summary) {
    return undefined;
  }

  return summary
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim() || undefined;
}

function getCandidateScore(
  result: TvmazeSearchResult,
  query: SeriesMetadataQuery,
) {
  const showTitle = normalizeSearchTitle(
    asOptionalString(result.show?.name),
  );
  const targetTitle = normalizeSearchTitle(query.canonicalTitle);
  const providerScore = asOptionalNumber(result.score) ?? 0;
  let score = providerScore * 100;

  if (showTitle === targetTitle) {
    score += 1000;
  } else if (
    showTitle.includes(targetTitle) ||
    targetTitle.includes(showTitle)
  ) {
    score += 180;
  }

  const releaseYear = asOptionalString(result.show?.premiered)?.slice(0, 4);
  if (query.releaseYear && query.releaseYear === releaseYear) {
    score += 100;
  }

  if (asOptionalString(result.show?.image?.original)) score += 20;
  if (stripSummaryMarkup(result.show?.summary)) score += 10;

  return score;
}

function pickBestResult(
  results: TvmazeSearchResult[],
  query: SeriesMetadataQuery,
) {
  const candidates = results
    .filter(
      (result) =>
        result.show &&
        asOptionalNumber(result.show.id) !== undefined &&
        asOptionalString(result.show.name) &&
        isConfidentTvmazeTitleMatch(
          asOptionalString(result.show.name) as string,
          query,
        ),
    )
    .sort(
      (left, right) =>
        getCandidateScore(right, query) - getCandidateScore(left, query),
    );
  const best = candidates[0];

  return best && getCandidateScore(best, query) >= 180 ? best : null;
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

export class TvmazeSeriesMetadataProvider
  implements SeriesMetadataProvider
{
  readonly id = 'tvmaze' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    fetchImpl: typeof fetch = globalThis.fetch,
    timeoutMs = TVMAZE_REQUEST_TIMEOUT_MS,
  ) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  private async fetchShowBackground(
    showId: number,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    try {
      const response = await this.fetchImpl(
        `${TVMAZE_API_BASE_URL}/shows/${showId}/images`,
        {
          headers: { Accept: 'application/json' },
          signal,
        },
      );

      if (!response.ok) {
        return undefined;
      }

      const payload: unknown = await response.json();

      if (!Array.isArray(payload)) {
        return undefined;
      }

      const backgroundItem = (payload as TvmazeImageItem[]).find((img) => {
        if (asOptionalString(img.type) !== 'background') {
          return false;
        }

        const url =
          asOptionalString(img.resolutions?.original?.url) ??
          asOptionalString(img.resolutions?.medium?.url);

        if (!url) {
          return false;
        }

        const width =
          asOptionalNumber(img.resolutions?.original?.width) ??
          asOptionalNumber(img.resolutions?.medium?.width);
        const height =
          asOptionalNumber(img.resolutions?.original?.height) ??
          asOptionalNumber(img.resolutions?.medium?.height);

        if (width === undefined || height === undefined || width <= height) {
          return false;
        }

        return true;
      });

      if (!backgroundItem) {
        return undefined;
      }

      return (
        asOptionalString(backgroundItem.resolutions?.original?.url) ??
        asOptionalString(backgroundItem.resolutions?.medium?.url)
      );
    } catch {
      return undefined;
    }
  }

  async lookup(
    query: SeriesMetadataQuery,
    options?: { signal?: AbortSignal; skipImages?: boolean },
  ): Promise<ProviderLookupResult> {
    const searchTitle = query.canonicalTitle.trim();

    if (!searchTitle) {
      return { status: 'no_match' };
    }

    const request = createRequestSignal(options?.signal, this.timeoutMs);

    try {
      const searchParams = new URLSearchParams({ q: searchTitle });
      const response = await this.fetchImpl(
        `${TVMAZE_API_BASE_URL}/search/shows?${searchParams.toString()}`,
        {
          headers: {
            Accept: 'application/json',
          },
          signal: request.signal,
        },
      );

      if (!response.ok) {
        return {
          status: 'error',
          errorCode: `TVMAZE_HTTP_${response.status}`,
        };
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        return {
          status: 'error',
          errorCode: 'TVMAZE_PARSE_ERROR',
        };
      }

      if (!Array.isArray(payload)) {
        return {
          status: 'error',
          errorCode: 'TVMAZE_PARSE_ERROR',
        };
      }

      const best = pickBestResult(
        payload as TvmazeSearchResult[],
        query,
      );

      if (!best?.show) {
        return { status: 'no_match' };
      }

      const providerId = asOptionalNumber(best.show.id);
      const canonicalTitle = asOptionalString(best.show.name);

      if (providerId === undefined || !canonicalTitle) {
        return {
          status: 'error',
          errorCode: 'TVMAZE_PARSE_ERROR',
        };
      }

      const genres = Array.isArray(best.show.genres)
        ? best.show.genres
            .map(asOptionalString)
            .filter((genre): genre is string => Boolean(genre))
        : [];

      let backdropUrl: string | undefined;

      if (!options?.skipImages && providerId !== undefined) {
        backdropUrl = await this.fetchShowBackground(
          providerId,
          request.signal,
        );
      }

      return {
        status: 'matched',
        metadata: {
          provider: 'tvmaze',
          providerId: String(providerId),
          canonicalTitle,
          originalTitle: canonicalTitle,
          releaseYear: asOptionalString(best.show.premiered)?.slice(0, 4),
          overview: stripSummaryMarkup(best.show.summary),
          genres: genres.length > 0 ? genres : undefined,
          rating: asOptionalNumber(best.show.rating?.average),
          posterUrl:
            asOptionalString(best.show.image?.original) ??
            asOptionalString(best.show.image?.medium),
          backdropUrl,
          sourceUrl: asOptionalString(best.show.url),
          matchStatus: 'matched',
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          status: 'error',
          errorCode: request.didTimeout()
            ? 'TVMAZE_TIMEOUT'
            : 'TVMAZE_ABORTED',
        };
      }

      return {
        status: 'error',
        errorCode: 'TVMAZE_NETWORK_ERROR',
      };
    } finally {
      request.dispose();
    }
  }
}
