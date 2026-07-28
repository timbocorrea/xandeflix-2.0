import type {
  LocalCatalogItem,
  LocalTmdbMetadata,
} from '../types/localCatalog.types';

export type LocalCatalogArtworkSource =
  | 'tvg'
  | 'tmdb_poster'
  | 'tmdb_backdrop'
  | 'tvmaze_background';

export type LocalCatalogArtworkCandidate = {
  url: string;
  source: LocalCatalogArtworkSource;
  originalScheme: 'http' | 'https';
  host: string;
  upgradedToHttps: boolean;
};

export type LocalCatalogArtworkValueClassification =
  | 'missing'
  | 'valid_http'
  | 'valid_https'
  | 'invalid';

export type LocalCatalogArtworkResolution = {
  posterUrl?: string;
  backdropUrl?: string;
  posterCandidates: LocalCatalogArtworkCandidate[];
  tvgClassification: LocalCatalogArtworkValueClassification;
  tmdbPosterClassification: LocalCatalogArtworkValueClassification;
  tmdbBackdropClassification: LocalCatalogArtworkValueClassification;
};

type ClassifiedArtworkValue = {
  classification: LocalCatalogArtworkValueClassification;
  candidate?: LocalCatalogArtworkCandidate;
  candidates?: LocalCatalogArtworkCandidate[];
};

function sanitizeArtworkHost(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '')
    .slice(0, 120);
}

function classifyAbsoluteArtworkUrl(
  value: string | null | undefined,
  source: LocalCatalogArtworkSource,
): ClassifiedArtworkValue {
  const rawValue = value?.trim();

  if (!rawValue) {
    return { classification: 'missing' };
  }

  try {
    const parsedUrl = new URL(rawValue);

    if (
      (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return { classification: 'invalid' };
    }

    const originalScheme =
      parsedUrl.protocol === 'http:' ? 'http' : 'https';
    const upgradedToHttps = originalScheme === 'http';
    const candidates: LocalCatalogArtworkCandidate[] = [];

    if (upgradedToHttps) {
      const httpsUrl = new URL(rawValue);
      httpsUrl.protocol = 'https:';

      candidates.push({
        url: parsedUrl.toString(),
        source,
        originalScheme: 'http',
        host: sanitizeArtworkHost(parsedUrl.hostname),
        upgradedToHttps: false,
      });

      candidates.push({
        url: httpsUrl.toString(),
        source,
        originalScheme: 'http',
        host: sanitizeArtworkHost(httpsUrl.hostname),
        upgradedToHttps: true,
      });
    } else {
      candidates.push({
        url: parsedUrl.toString(),
        source,
        originalScheme: 'https',
        host: sanitizeArtworkHost(parsedUrl.hostname),
        upgradedToHttps: false,
      });
    }

    return {
      classification:
        originalScheme === 'http' ? 'valid_http' : 'valid_https',
      candidate: candidates[0],
      candidates,
    };
  } catch {
    return { classification: 'invalid' };
  }
}

function classifyTmdbArtwork(
  value: string | null | undefined,
  source: 'tmdb_poster' | 'tmdb_backdrop',
  size: 'w500' | 'w780',
): ClassifiedArtworkValue {
  const absolute = classifyAbsoluteArtworkUrl(value, source);

  if (absolute.classification !== 'invalid') {
    return absolute;
  }

  const path = value?.trim();

  if (!path?.startsWith('/') || path.includes('..')) {
    return { classification: path ? 'invalid' : 'missing' };
  }

  const candidate: LocalCatalogArtworkCandidate = {
    url: `https://image.tmdb.org/t/p/${size}${path}`,
    source,
    originalScheme: 'https',
    host: 'image.tmdb.org',
    upgradedToHttps: false,
  };

  return {
    classification: 'valid_https',
    candidate,
    candidates: [candidate],
  };
}

function uniqueCandidates(
  candidates: Array<LocalCatalogArtworkCandidate | undefined>,
) {
  const unique = new Map<string, LocalCatalogArtworkCandidate>();

  for (const candidate of candidates) {
    if (candidate && !unique.has(candidate.url)) {
      unique.set(candidate.url, candidate);
    }
  }

  return Array.from(unique.values());
}

export function classifyLocalCatalogArtworkUrl(
  value?: string | null,
): LocalCatalogArtworkValueClassification {
  return classifyAbsoluteArtworkUrl(value, 'tvg').classification;
}

export function resolveLocalCatalogArtwork(
  item: Pick<LocalCatalogItem, 'tvgLogo'>,
  tmdbMetadata?: Pick<
    LocalTmdbMetadata,
    'posterPath' | 'backdropPath'
  > | null,
): LocalCatalogArtworkResolution {
  const tvg = classifyAbsoluteArtworkUrl(item.tvgLogo, 'tvg');
  const tmdbPoster = classifyTmdbArtwork(
    tmdbMetadata?.posterPath,
    'tmdb_poster',
    'w500',
  );
  const tmdbBackdrop = classifyTmdbArtwork(
    tmdbMetadata?.backdropPath,
    'tmdb_backdrop',
    'w780',
  );
  const posterCandidates = uniqueCandidates([
    ...(tvg.candidates ?? (tvg.candidate ? [tvg.candidate] : [])),
    ...(tmdbPoster.candidates ?? (tmdbPoster.candidate ? [tmdbPoster.candidate] : [])),
    ...(tmdbBackdrop.candidates ?? (tmdbBackdrop.candidate ? [tmdbBackdrop.candidate] : [])),
  ]);

  return {
    posterUrl: posterCandidates[0]?.url,
    backdropUrl: tmdbBackdrop.candidate?.url,
    posterCandidates,
    tvgClassification: tvg.classification,
    tmdbPosterClassification: tmdbPoster.classification,
    tmdbBackdropClassification: tmdbBackdrop.classification,
  };
}

export function reportLocalCatalogArtworkLoadFailure(
  candidate: LocalCatalogArtworkCandidate,
  kind: 'movie' | 'series' | 'unknown',
) {
  console.warn('ARTWORK_LOAD_FAILED', {
    source: candidate.source.startsWith('tmdb') ? 'tmdb' : 'tvg',
    scheme: candidate.originalScheme,
    host: candidate.host,
    kind,
  });
}
