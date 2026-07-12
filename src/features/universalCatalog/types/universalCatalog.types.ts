export const UNIVERSAL_CATALOG_CONTRACT_VERSION = 1 as const;

export type UniversalCatalogContractVersion =
  typeof UNIVERSAL_CATALOG_CONTRACT_VERSION;

export type UniversalCatalogSourceType =
  | 'm3u'
  | 'xtream'
  | 'manual'
  | 'unknown';

export type UniversalCatalogContentKind =
  | 'live'
  | 'movie'
  | 'series'
  | 'series_episode'
  | 'radio'
  | 'unknown';

export type UniversalCatalogEnrichmentStatus =
  | 'pending'
  | 'processing'
  | 'matched'
  | 'no_match'
  | 'ambiguous'
  | 'error'
  | 'skipped';

export type UniversalCatalogStreamKind =
  | 'hls'
  | 'mpeg_ts'
  | 'dash'
  | 'file'
  | 'unknown';

export interface UniversalCatalogItem {
  id: string;
  licenseId?: string | null;
  sourceId: string;
  sourceType: UniversalCatalogSourceType;
  externalId?: string | null;
  streamId?: string | null;
  rawName: string;
  rawGroupTitle?: string | null;
  rawCategoryId?: string | null;
  rawCategoryName?: string | null;
  rawLogoUrl?: string | null;
  normalizedTitle: string;
  normalizedGroup?: string | null;
  contentKind: UniversalCatalogContentKind;
  contentSubtype?: string | null;
  streamUrl: string;
  streamKind?: UniversalCatalogStreamKind | null;
  tvgId?: string | null;
  tvgName?: string | null;
  seriesName?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  releaseYear?: number | null;
  languageHint?: string | null;
  countryHint?: string | null;
  isActive: boolean;
  sortOrder: number;
  classificationVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type UniversalCatalogMetadataProvider = 'tmdb' | 'manual' | 'unknown';

export interface UniversalCatalogEnrichedMetadata {
  provider: UniversalCatalogMetadataProvider;
  providerItemId?: string | null;
  mediaType?: 'movie' | 'tv' | 'episode' | 'unknown' | null;
  status: UniversalCatalogEnrichmentStatus;
  confidence?: number | null;
  title?: string | null;
  originalTitle?: string | null;
  overview?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  releaseYear?: number | null;
  rating?: number | null;
  genres?: string[] | null;
  attemptCount: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  errorCode?: string | null;
  updatedAt: string;
}

export interface UniversalCatalogMetrics {
  totalImported: number;
  totalActive: number;
  totalInactive: number;
  totalLive: number;
  totalMovies: number;
  totalSeries: number;
  totalEpisodes: number;
  totalRadio: number;
  totalUnknown: number;
  totalWithoutGroup: number;
  totalWithOriginalLogo: number;
  totalWithMetadata: number;
  totalWithPoster: number;
  totalWithBackdrop: number;
  totalPending: number;
  totalProcessing: number;
  totalMatched: number;
  totalNoMatch: number;
  totalAmbiguous: number;
  totalError: number;
  totalSkipped: number;
  totalVisible: number;
  totalPlayable: number;
}

export type UniversalCatalogMetricDimension =
  | 'licenseId'
  | 'sourceId'
  | 'sourceType'
  | 'contentKind'
  | 'groupTitle'
  | 'enrichmentStatus';

export interface UniversalCatalogMetricSlice {
  dimension: UniversalCatalogMetricDimension;
  dimensionValue: string | null;
  metrics: UniversalCatalogMetrics;
}
