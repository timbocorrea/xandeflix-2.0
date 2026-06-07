export type NeutralMediaType =
  | 'movie'
  | 'series'
  | 'episode'
  | 'liveChannel'
  | 'collection';

export type NeutralContentOrigin =
  | 'tmdb'
  | 'externalApi'
  | 'localPlaylist'
  | 'localCache'
  | 'legacySupabase'
  | 'manual';

export type NeutralContentIdentity = {
  mediaType: NeutralMediaType;
  tmdbId?: string | number | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  canonicalTitle?: string | null;
  contentFingerprint?: string | null;
};

export type NeutralContentArtwork = {
  posterUrl?: string | null;
  backdropUrl?: string | null;
  logoUrl?: string | null;
};

export type NeutralContentMetadata = {
  year?: string | number | null;
  genres?: string[];
  rating?: string | null;
  runtimeMinutes?: number | null;
  overview?: string | null;
};

export type NeutralCatalogItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  identity: NeutralContentIdentity;
  artwork?: NeutralContentArtwork;
  metadata?: NeutralContentMetadata;
  origin?: NeutralContentOrigin;
};

/**
 * Referência efêmera para reprodução em runtime.
 *
 * Não deve armazenar dados sensíveis da origem como identidade persistente
 * de conteúdo.
 */
export type NeutralRuntimePlaybackRef = {
  contentKey: string;
  playbackRef: string;
  expiresAt?: string | null;
};

export type NeutralDataSourceCapabilities = {
  canListHomeSections: boolean;
  canListMovieCollections: boolean;
  canListSeriesCollections: boolean;
  canListLiveChannels: boolean;
  canResolveRuntimePlayback: boolean;
};
