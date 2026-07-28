export type MetadataProviderId = 'tmdb' | 'tvmaze';

export type SeriesMetadataField =
  | 'canonicalTitle'
  | 'originalTitle'
  | 'releaseYear'
  | 'overview'
  | 'genres'
  | 'rating'
  | 'voteCount'
  | 'posterUrl'
  | 'backdropUrl';

export type SeriesMetadataQuery = {
  seriesKey: string;
  canonicalTitle: string;
  originalTitle: string;
  releaseYear?: string;
};

export type ProviderSeriesMetadata = {
  provider: MetadataProviderId;
  providerId: string;
  canonicalTitle: string;
  originalTitle?: string;
  releaseYear?: string;
  overview?: string;
  genres?: string[];
  rating?: number;
  voteCount?: number;
  posterUrl?: string;
  backdropUrl?: string;
  sourceUrl?: string;
  matchStatus: 'matched';
  updatedAt: string;
};

export type ProviderLookupResult =
  | {
      status: 'matched';
      metadata: ProviderSeriesMetadata;
    }
  | {
      status: 'no_match';
    }
  | {
      status: 'error';
      errorCode: string;
    };

export type SeriesMetadataProvider = {
  id: MetadataProviderId;
  lookup(
    query: SeriesMetadataQuery,
    options?: { signal?: AbortSignal; skipImages?: boolean },
  ): Promise<ProviderLookupResult>;
};

export type ResolvedSeriesMetadata = ProviderSeriesMetadata & {
  provenance: Partial<Record<SeriesMetadataField, MetadataProviderId>>;
  sourceUrls: Partial<Record<MetadataProviderId, string>>;
};

export type SeriesMetadataResolution =
  | {
      matchStatus: 'matched';
      metadata: ResolvedSeriesMetadata;
      updatedAt: string;
      expiresAt: number;
    }
  | {
      matchStatus: 'no_match';
      updatedAt: string;
      expiresAt: number;
    }
  | {
      matchStatus: 'error';
      errorCode: string;
      updatedAt: string;
      expiresAt: number;
    };

export type SeriesMetadataCache = {
  get(
    scopeKey: string,
    seriesKey: string,
  ): Promise<SeriesMetadataResolution | null>;
  set(
    scopeKey: string,
    seriesKey: string,
    resolution: SeriesMetadataResolution,
  ): Promise<void>;
};
