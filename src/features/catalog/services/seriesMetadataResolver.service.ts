import type {
  MetadataProviderId,
  ProviderLookupResult,
  ProviderSeriesMetadata,
  ResolvedSeriesMetadata,
  SeriesMetadataCache,
  SeriesMetadataField,
  SeriesMetadataProvider,
  SeriesMetadataQuery,
  SeriesMetadataResolution,
} from './seriesMetadata.types';
import {
  endDiscoveryPerformanceSpan,
  incrementDiscoveryPerformanceCounter,
  markDiscoveryPerformance,
  startDiscoveryPerformanceSpan,
} from './discoveryPerformance.service';

export const SERIES_METADATA_MATCHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SERIES_METADATA_NO_MATCH_TTL_MS = 24 * 60 * 60 * 1000;
export const SERIES_METADATA_ERROR_TTL_MS = 5 * 60 * 1000;

const MERGE_FIELDS: SeriesMetadataField[] = [
  'canonicalTitle',
  'originalTitle',
  'releaseYear',
  'overview',
  'genres',
  'rating',
  'voteCount',
  'posterUrl',
  'backdropUrl',
];

function hasMetadataValue(
  value: ProviderSeriesMetadata[SeriesMetadataField],
) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return value !== undefined && value !== null;
}

export function isSeriesHeroMetadataComplete(
  metadata: ProviderSeriesMetadata,
) {
  return Boolean(
    metadata.overview?.trim() &&
      metadata.posterUrl?.trim() &&
      metadata.backdropUrl?.trim(),
  );
}

export function mergeSeriesMetadataByField(
  primary: ProviderSeriesMetadata | null,
  fallback: ProviderSeriesMetadata | null,
): ResolvedSeriesMetadata | null {
  const seed = primary ?? fallback;

  if (!seed) {
    return null;
  }

  const merged = { ...seed } as ResolvedSeriesMetadata;
  const provenance: Partial<
    Record<SeriesMetadataField, MetadataProviderId>
  > = {};
  const sourceUrls: Partial<Record<MetadataProviderId, string>> = {};

  if (primary?.sourceUrl) {
    sourceUrls[primary.provider] = primary.sourceUrl;
  }

  if (fallback?.sourceUrl) {
    sourceUrls[fallback.provider] = fallback.sourceUrl;
  }

  for (const field of MERGE_FIELDS) {
    const primaryValue = primary?.[field];
    const fallbackValue = fallback?.[field];
    const primaryProvider = primary?.provider;
    const fallbackProvider = fallback?.provider;

    if (primaryProvider && hasMetadataValue(primaryValue)) {
      Object.assign(merged, { [field]: primaryValue });
      provenance[field] = primaryProvider;
    } else if (fallbackProvider && hasMetadataValue(fallbackValue)) {
      Object.assign(merged, { [field]: fallbackValue });
      provenance[field] = fallbackProvider;
    } else {
      delete merged[field];
    }
  }

  merged.provenance = provenance;
  merged.sourceUrls = sourceUrls;
  merged.updatedAt = new Date().toISOString();

  return merged;
}

function toProviderError(
  provider: SeriesMetadataProvider,
  error: unknown,
): ProviderLookupResult {
  const rawCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `${provider.id.toUpperCase()}_LOOKUP_FAILED`;

  return {
    status: 'error',
    errorCode: rawCode,
  };
}

async function safelyLookup(
  provider: SeriesMetadataProvider,
  query: SeriesMetadataQuery,
  options?: { signal?: AbortSignal; skipImages?: boolean },
) {
  try {
    return await provider.lookup(query, options);
  } catch (error) {
    return toProviderError(provider, error);
  }
}

function createResolution(
  primaryResult: ProviderLookupResult,
  fallbackResult: ProviderLookupResult | null,
  now: number,
): SeriesMetadataResolution {
  const primaryMetadata =
    primaryResult.status === 'matched' ? primaryResult.metadata : null;
  const fallbackMetadata =
    fallbackResult?.status === 'matched' ? fallbackResult.metadata : null;
  const metadata = mergeSeriesMetadataByField(
    primaryMetadata,
    fallbackMetadata,
  );
  const updatedAt = new Date(now).toISOString();

  if (metadata) {
    return {
      matchStatus: 'matched',
      metadata,
      updatedAt,
      expiresAt: now + SERIES_METADATA_MATCHED_TTL_MS,
    };
  }

  const providerError = [primaryResult, fallbackResult].find(
    (result) => result?.status === 'error',
  );

  if (providerError?.status === 'error') {
    return {
      matchStatus: 'error',
      errorCode: providerError.errorCode,
      updatedAt,
      expiresAt: now + SERIES_METADATA_ERROR_TTL_MS,
    };
  }

  return {
    matchStatus: 'no_match',
    updatedAt,
    expiresAt: now + SERIES_METADATA_NO_MATCH_TTL_MS,
  };
}

export function createSeriesMetadataResolver({
  primaryProvider,
  fallbackProvider,
  cache,
  now = Date.now,
}: {
  primaryProvider: SeriesMetadataProvider;
  fallbackProvider: SeriesMetadataProvider;
  cache: SeriesMetadataCache;
  now?: () => number;
}) {
  return async function resolveSeriesMetadata({
    scopeKey,
    query,
    signal,
  }: {
    scopeKey: string;
    query: SeriesMetadataQuery;
    signal?: AbortSignal;
  }): Promise<SeriesMetadataResolution> {
    const cached = await cache.get(scopeKey, query.seriesKey).catch(
      () => null,
    );
    const currentTime = now();

    if (cached && cached.expiresAt > currentTime) {
      return cached;
    }

    const primaryRequestNumber =
      incrementDiscoveryPerformanceCounter(
        'series_primary_metadata_count',
      );
    const primarySpanName =
      `series_primary_metadata:${primaryRequestNumber}`;

    markDiscoveryPerformance(
      'series_primary_metadata_start',
      { once: false },
    );
    startDiscoveryPerformanceSpan(primarySpanName);

    let primaryResult: ProviderLookupResult;

    try {
      primaryResult = await safelyLookup(
        primaryProvider,
        query,
        { signal },
      );
    } finally {
      markDiscoveryPerformance(
        'series_primary_metadata_end',
        { once: false },
      );
      endDiscoveryPerformanceSpan(primarySpanName);
    }

    const shouldUseFallback =
      primaryResult.status !== 'matched' ||
      !isSeriesHeroMetadataComplete(primaryResult.metadata);

    let fallbackResult: ProviderLookupResult | null = null;

    if (shouldUseFallback) {
      const fallbackRequestNumber =
        incrementDiscoveryPerformanceCounter(
          'series_fallback_metadata_count',
        );
      const fallbackSpanName =
        `series_fallback_metadata:${fallbackRequestNumber}`;

      markDiscoveryPerformance(
        'series_fallback_metadata_start',
        { once: false },
      );
      startDiscoveryPerformanceSpan(fallbackSpanName);

      try {
        fallbackResult = await safelyLookup(
          fallbackProvider,
          query,
          {
            signal,
            skipImages:
              primaryResult.status === 'matched' &&
              Boolean(primaryResult.metadata.backdropUrl),
          },
        );
      } finally {
        markDiscoveryPerformance(
          'series_fallback_metadata_end',
          { once: false },
        );
        endDiscoveryPerformanceSpan(fallbackSpanName);
      }
    }

    const resolution = createResolution(
      primaryResult,
      fallbackResult,
      currentTime,
    );

    await cache
      .set(scopeKey, query.seriesKey, resolution)
      .catch(() => undefined);

    return resolution;
  };
}
