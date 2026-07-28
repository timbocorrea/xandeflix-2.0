import {
  getActiveLocalCatalogScopeBySourceId,
  getLocalCatalogMetadata,
  putLocalCatalogMetadata,
} from '@/features/localCatalog/services/localCatalogDb.service';

import type {
  SeriesMetadataCache,
  SeriesMetadataResolution,
} from './seriesMetadata.types';

const RESOLVED_SERIES_METADATA_PREFIX = 'resolved-series-metadata';
const SOURCE_SCOPE_DOMAIN =
  'xandeflix:resolved-series-metadata-source-scope:v1:';

function createCacheKey(scopeKey: string, seriesKey: string) {
  return [
    RESOLVED_SERIES_METADATA_PREFIX,
    scopeKey.trim(),
    seriesKey.trim(),
  ].join('::');
}

function isSeriesMetadataResolution(
  value: unknown,
): value is SeriesMetadataResolution {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const resolution = value as Partial<SeriesMetadataResolution>;

  if (
    !(
    (resolution.matchStatus === 'matched' ||
      resolution.matchStatus === 'no_match' ||
      resolution.matchStatus === 'error') &&
    typeof resolution.updatedAt === 'string' &&
    typeof resolution.expiresAt === 'number'
    )
  ) {
    return false;
  }

  if (resolution.matchStatus === 'matched') {
    return Boolean(
      resolution.metadata &&
        typeof resolution.metadata === 'object' &&
        resolution.metadata.matchStatus === 'matched',
    );
  }

  return (
    resolution.matchStatus !== 'error' ||
    typeof resolution.errorCode === 'string'
  );
}

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SERIES_METADATA_SCOPE_CRYPTO_UNAVAILABLE');
  }

  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function resolveSeriesMetadataCacheScopeKey(sourceId: string) {
  const normalizedSourceId = sourceId.trim();

  if (!normalizedSourceId) {
    return null;
  }

  const existingScope = await getActiveLocalCatalogScopeBySourceId(
    normalizedSourceId,
  ).catch(() => null);

  if (existingScope) {
    return existingScope.scopeKey;
  }

  const sourceDigest = await sha256(
    `${SOURCE_SCOPE_DOMAIN}${normalizedSourceId}`,
  );

  return `source_scope_v1_${sourceDigest}`;
}

export function createLocalSeriesMetadataCache(): SeriesMetadataCache {
  return {
    async get(scopeKey, seriesKey) {
      const record = await getLocalCatalogMetadata(
        createCacheKey(scopeKey, seriesKey),
      );

      return isSeriesMetadataResolution(record?.value)
        ? record.value
        : null;
    },
    async set(scopeKey, seriesKey, resolution) {
      await putLocalCatalogMetadata({
        key: createCacheKey(scopeKey, seriesKey),
        value: resolution,
        updatedAt: resolution.updatedAt,
      });
    },
  };
}
