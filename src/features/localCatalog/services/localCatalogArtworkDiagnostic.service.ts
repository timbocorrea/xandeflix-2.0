import type { CatalogRepository } from '../repositories/catalogRepository.types';
import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import type {
  LocalCatalogContentKind,
  LocalTmdbMetadata,
} from '../types/localCatalog.types';
import {
  classifyLocalCatalogArtworkUrl,
  resolveLocalCatalogArtwork,
} from './localCatalogArtwork.service';

export type LocalCatalogArtworkDiagnostic = {
  contentKind: 'movie' | 'series';
  totalSample: number;
  withTvgLogo: number;
  withoutTvgLogo: number;
  tmdbMetadataFound: number;
  tmdbMatched: number;
  tmdbWithPosterPath: number;
  tmdbWithBackdropPath: number;
  finalPosterResolved: number;
  finalBackdropResolved: number;
  noArtworkAvailable: number;
  invalidTvgLogo: number;
  invalidTmdbPath: number;
  httpArtworkCount: number;
  httpsArtworkCount: number;
  tmdbSourceItemIdMatches: number;
};

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

function isValidTmdbPath(value?: string | null) {
  if (!hasText(value)) {
    return false;
  }

  const resolution = resolveLocalCatalogArtwork(
    { tvgLogo: null },
    { posterPath: value, backdropPath: null },
  );

  return resolution.tmdbPosterClassification.startsWith('valid_');
}

export async function diagnoseLocalCatalogArtworkSample(
  {
    sourceId: rawSourceId,
    contentKind,
    sampleLimit = 1000,
  }: {
    sourceId: string;
    contentKind: Extract<LocalCatalogContentKind, 'movie' | 'series'>;
    sampleLimit?: number;
  },
  repository: CatalogRepository = localCatalogRepository,
): Promise<LocalCatalogArtworkDiagnostic> {
  const sourceId = rawSourceId.trim();
  const safeLimit = Math.max(1, Math.min(2000, Math.floor(sampleLimit)));
  const items = sourceId
    ? await repository.listItems({
        sourceId,
        contentKind,
        limit: safeLimit,
      })
    : [];
  const metadataBySourceItemId =
    repository.getTmdbMetadataBySourceItemIds && items.length > 0
      ? await repository.getTmdbMetadataBySourceItemIds(
          items.map((item) => item.id),
        )
      : new Map<string, LocalTmdbMetadata>();
  const result: LocalCatalogArtworkDiagnostic = {
    contentKind,
    totalSample: items.length,
    withTvgLogo: 0,
    withoutTvgLogo: 0,
    tmdbMetadataFound: 0,
    tmdbMatched: 0,
    tmdbWithPosterPath: 0,
    tmdbWithBackdropPath: 0,
    finalPosterResolved: 0,
    finalBackdropResolved: 0,
    noArtworkAvailable: 0,
    invalidTvgLogo: 0,
    invalidTmdbPath: 0,
    httpArtworkCount: 0,
    httpsArtworkCount: 0,
    tmdbSourceItemIdMatches: 0,
  };

  for (const item of items) {
    const tmdbMetadata = metadataBySourceItemId.get(item.id);
    const artwork = resolveLocalCatalogArtwork(item, tmdbMetadata);

    if (hasText(item.tvgLogo)) {
      result.withTvgLogo += 1;
    } else {
      result.withoutTvgLogo += 1;
    }

    if (classifyLocalCatalogArtworkUrl(item.tvgLogo) === 'invalid') {
      result.invalidTvgLogo += 1;
    }

    if (tmdbMetadata) {
      result.tmdbMetadataFound += 1;
      result.tmdbSourceItemIdMatches += Number(
        tmdbMetadata.sourceItemId === item.id,
      );
      result.tmdbMatched += Number(tmdbMetadata.matchStatus === 'matched');
      result.tmdbWithPosterPath += Number(
        isValidTmdbPath(tmdbMetadata.posterPath),
      );
      result.tmdbWithBackdropPath += Number(
        isValidTmdbPath(tmdbMetadata.backdropPath),
      );
      result.invalidTmdbPath += Number(
        hasText(tmdbMetadata.posterPath) &&
          !isValidTmdbPath(tmdbMetadata.posterPath),
      );
      result.invalidTmdbPath += Number(
        hasText(tmdbMetadata.backdropPath) &&
          !isValidTmdbPath(tmdbMetadata.backdropPath),
      );
    }

    const finalCandidate = artwork.posterCandidates[0];

    if (finalCandidate) {
      result.finalPosterResolved += 1;
      result.httpArtworkCount += Number(
        finalCandidate.originalScheme === 'http',
      );
      result.httpsArtworkCount += Number(
        finalCandidate.originalScheme === 'https',
      );
    }

    result.finalBackdropResolved += Number(Boolean(artwork.backdropUrl));
    result.noArtworkAvailable += Number(
      !finalCandidate && !artwork.backdropUrl,
    );
  }

  return result;
}
