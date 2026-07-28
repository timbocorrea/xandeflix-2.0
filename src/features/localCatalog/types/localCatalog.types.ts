import type {
  UniversalCatalogContentKind,
  UniversalCatalogSourceType,
} from '@/features/universalCatalog';

export type LocalCatalogContentKind = UniversalCatalogContentKind;

export type LocalCatalogItem = {
  id: string;
  sourceId: string;
  sourceType?: UniversalCatalogSourceType;
  name: string;
  rawName?: string;
  normalizedName: string;
  groupTitle: string | null;
  normalizedGroup?: string | null;
  contentKind: LocalCatalogContentKind;
  streamUrl: string;
  tvgId?: string | null;
  tvgName?: string | null;
  tvgLogo?: string | null;
  seriesName?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  classificationVersion?: number;
  importSessionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalCatalogMetadata = {
  key: string;
  value: unknown;
  updatedAt: string;
};

export type LocalTmdbMatchStatus =
  | 'pending'
  | 'matched'
  | 'not_found'
  | 'ambiguous'
  | 'skipped'
  | 'error';

export type LocalTmdbMetadata = {
  id: string;
  sourceItemId: string;
  tmdbId?: number | null;
  title?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string | null;
  matchStatus?: LocalTmdbMatchStatus | null;
  updatedAt: string;
};

export type LocalCatalogStats = {
  playlistItemsCount: number;
  catalogMetadataCount: number;
  tmdbMetadataCount: number;
  byContentKind: Record<LocalCatalogContentKind, number>;
};

export type LocalCatalogImportStatus =
  | 'idle'
  | 'importing'
  | 'ready'
  | 'failed'
  | 'canceled';

export type LocalCatalogImportMetadata = {
  sourceId: string;
  sourceType: UniversalCatalogSourceType;
  status: LocalCatalogImportStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  lastSuccessfulImportAt?: string | null;
  parsedCount: number;
  importedCount: number;
  updatedCount: number;
  removedCount: number;
  unknownCount: number;
  withoutGroupCount: number;
  classificationVersion: number;
  errorCode?: string | null;
};

export type LocalCatalogCategory = {
  id: string;
  title: string;
  normalizedTitle: string;
  contentKind: LocalCatalogContentKind;
  itemCount: number;
  isUncategorized: boolean;
  isUnknownKind: boolean;
};

export type ListLocalCatalogItemsInput = {
  sourceId?: string;
  contentKind?: LocalCatalogContentKind;
  groupTitle?: string | null;
  normalizedGroup?: string | null;
  uncategorizedOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type LocalCatalogScopeAccessStatus =
  | 'active'
  | 'signed_out'
  | 'revoked'
  | 'superseded';

export type LocalCatalogScope = {
  scopeKey: string;
  tenantScopeId: string;
  sourceId: string;
  activeSnapshotId: string | null;
  stagingSnapshotId: string | null;
  accessStatus: LocalCatalogScopeAccessStatus;
  runtimeEpoch: number;
  retentionPolicyVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalCatalogSnapshotStatus =
  | 'building'
  | 'validating'
  | 'ready'
  | 'active'
  | 'superseded'
  | 'failed'
  | 'canceled';

export type LocalCatalogSnapshot = {
  snapshotId: string;
  scopeKey: string;
  status: LocalCatalogSnapshotStatus;
  sourceRevision: string | null;
  classificationVersion: number;
  schemaVersion: number;
  totalItems: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  failureCode: string | null;
};

export type LocalCatalogImportCheckpoint = {
  snapshotId: string;
  scopeKey: string;
  batchSequence: number;
  confirmedItems: number;
  confirmedBytes: number;
  sourceEtag: string | null;
  sourceLastModified: string | null;
  sourceRevision: string | null;
  parserVersion: number;
  updatedAt: string;
};

export type LocalCatalogLogicalIdentity = {
  version: number;
  strategy: 'external_id' | 'tvg_id' | 'normalized_fields' | 'url_fallback';
  value: string;
};

export type LocalCatalogSnapshotItem = {
  snapshotId: string;
  itemId: string;
  scopeKey: string;
  logicalIdentity: LocalCatalogLogicalIdentity;
  sourceItemId: string | null;
  contentKind: LocalCatalogContentKind;
  rawName: string;
  normalizedName: string;
  rawGroupTitle: string | null;
  normalizedGroup: string | null;
  streamUrl: string;
  artworkUrl?: string | null;
  sourceOrder: number;
  classificationVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalCatalogSeriesLookupRecord = {
  snapshotId: string;
  seriesKey: string;
  itemId: string;
  contentKind: Extract<LocalCatalogContentKind, 'series' | 'series_episode'>;
};

export type LocalCatalogSeriesLookupState = {
  snapshotId: string;
  status: 'building' | 'ready' | 'failed' | 'stale';
  lookupVersion: number;
  processedCount: number;
  indexedCount: number;
  checkpoint: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalCatalogSnapshotCategory = {
  snapshotId: string;
  categoryId: string;
  scopeKey: string;
  contentKind: LocalCatalogContentKind;
  title: string;
  normalizedTitle: string;
  itemCount: number;
  sortOrder: number;
  isUncategorized: boolean;
  isUnknownKind: boolean;
  updatedAt: string;
};

export type LocalCatalogSearchIndexStatus = 'pending' | 'ready' | 'failed';

export type LocalCatalogSearchDocument = {
  snapshotId: string;
  documentId: string;
  scopeKey: string;
  catalogItemId: string;
  contentKind: LocalCatalogContentKind;
  normalizedTitle: string;
  normalizedCategory: string | null;
  year: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  indexStatus: LocalCatalogSearchIndexStatus;
  updatedAt: string;
};

export type LocalCatalogSearchToken = {
  snapshotId: string;
  token: string;
  documentId: string;
  weight: number;
  position: number;
  prefixLength: number;
};

export type LocalCatalogSnapshotMetrics = {
  snapshotId: string;
  totalRawItems: number;
  totalMovies: number;
  totalSeries: number;
  totalEpisodes: number;
  totalLive: number;
  totalRadio: number;
  totalUnknown: number;
  totalCategories: number;
  indexedSearchItems: number;
  withPoster: number;
  withBackdrop: number;
  withMetadata: number;
  tmdbMatched: number;
  tmdbNoMatch: number;
  tmdbError: number;
  metadataPending: number;
  duplicatesIgnored: number;
  failedItems: number;
  removedItems: number;
  updatedAt: string;
};

export type LocalCatalogPageCursor = string;

export type LocalCatalogPageRequest<TFilters extends Record<string, unknown>> = {
  snapshotId: string;
  filters: TFilters;
  cursor?: LocalCatalogPageCursor;
  limit: number;
};

export type LocalCatalogPageResult<T> = {
  items: T[];
  nextCursor: LocalCatalogPageCursor | null;
};

export type LocalCatalogSnapshotTransition = {
  from: LocalCatalogSnapshotStatus;
  to: LocalCatalogSnapshotStatus;
};

export type LocalCatalogSnapshotFailureKind = 'transient' | 'fatal';

export type LocalCatalogResumeReasonCode =
  | 'LOCAL_CATALOG_RESUME_ELIGIBLE'
  | 'LOCAL_CATALOG_SCOPE_NOT_FOUND'
  | 'LOCAL_CATALOG_SCOPE_ACCESS_BLOCKED'
  | 'LOCAL_CATALOG_RUNTIME_EPOCH_MISMATCH'
  | 'LOCAL_CATALOG_STAGING_MISSING'
  | 'LOCAL_CATALOG_STAGING_INCONSISTENT'
  | 'LOCAL_CATALOG_CHECKPOINT_MISSING'
  | 'LOCAL_CATALOG_CHECKPOINT_INVALID'
  | 'LOCAL_CATALOG_PARSER_VERSION_MISMATCH'
  | 'LOCAL_CATALOG_SOURCE_REVISION_MISMATCH'
  | 'LOCAL_CATALOG_SOURCE_VALIDATOR_MISMATCH';

export type LocalCatalogResumeCheckpoint = Pick<
  LocalCatalogImportCheckpoint,
  'batchSequence' | 'confirmedItems' | 'confirmedBytes' | 'parserVersion' | 'updatedAt'
>;

export type LocalCatalogResumeDecision = {
  decision: 'resume_eligible' | 'restart_required' | 'blocked';
  reasonCode: LocalCatalogResumeReasonCode;
  snapshotId: string | null;
  checkpoint: LocalCatalogResumeCheckpoint | null;
};

export type LocalCatalogSnapshotLifecycleContext = {
  scopeKey: string;
  snapshotId: string;
  expectedRuntimeEpoch: number;
  timestamp: string;
};

export type LocalCatalogSnapshotPromotionResult = {
  scopeKey: string;
  activeSnapshotId: string;
  previousActiveSnapshotId: string | null;
};
