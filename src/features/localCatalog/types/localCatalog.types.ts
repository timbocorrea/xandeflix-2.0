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
