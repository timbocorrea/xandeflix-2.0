export type LocalCatalogContentKind = 'live' | 'movie' | 'series' | 'unknown';

export type LocalCatalogItem = {
  id: string;
  sourceId: string;
  name: string;
  normalizedName: string;
  groupTitle: string | null;
  contentKind: LocalCatalogContentKind;
  streamUrl: string;
  tvgId?: string | null;
  tvgName?: string | null;
  tvgLogo?: string | null;
  seriesName?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
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

export type ListLocalCatalogItemsInput = {
  contentKind?: LocalCatalogContentKind;
  groupTitle?: string | null;
  limit?: number;
  offset?: number;
};
