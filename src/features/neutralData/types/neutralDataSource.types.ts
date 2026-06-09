import type {
  NeutralCatalogItem,
  NeutralDataSourceCapabilities,
  NeutralMediaType,
  NeutralRuntimePlaybackRef,
} from '@/features/neutralData/types/neutralContent.types';

export type NeutralCatalogSection = {
  id: string;
  title: string;
  description?: string | null;
  items: NeutralCatalogItem[];
};

export type NeutralListInput = {
  limit?: number;
  page?: number;
  query?: string;
};

export type NeutralCollectionInput = NeutralListInput & {
  mediaType?: Extract<NeutralMediaType, 'movie' | 'series' | 'collection'>;
  collectionKey?: string | null;
};

export type NeutralLiveChannelInput = NeutralListInput & {
  categoryKey?: string | null;
};

export type NeutralPlaybackInput = {
  contentKey: string;
  profileId?: string | null;
  deviceId?: string | null;
};

export type NeutralDataSourceHealth = {
  sourceName: string;
  isAvailable: boolean;
  checkedAt: string;
  details?: string | null;
};

export type NeutralDataSourceAdapter = {
  sourceName: string;
  capabilities: NeutralDataSourceCapabilities;

  listHomeSections?: (input?: NeutralListInput) => Promise<NeutralCatalogSection[]>;

  listMovieCollections?: (
    input?: NeutralCollectionInput,
  ) => Promise<NeutralCatalogSection[]>;

  listSeriesCollections?: (
    input?: NeutralCollectionInput,
  ) => Promise<NeutralCatalogSection[]>;

  listLiveChannels?: (
    input?: NeutralLiveChannelInput,
  ) => Promise<NeutralCatalogSection[]>;

  resolveRuntimePlayback?: (
    input: NeutralPlaybackInput,
  ) => Promise<NeutralRuntimePlaybackRef | null>;

  healthCheck?: () => Promise<NeutralDataSourceHealth>;
};
