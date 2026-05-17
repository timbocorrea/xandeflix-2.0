export type TmdbMediaType = 'movie' | 'tv';

export type TmdbMatchStatus =
  | 'pending'
  | 'matched'
  | 'not_found'
  | 'ambiguous'
  | 'skipped'
  | 'error';

export type TmdbCachedMetadata = {
  contentKind?: 'live' | 'movie' | 'series' | 'unknown' | null;
  tmdbId?: number | null;
  tmdbMediaType?: TmdbMediaType | null;
  tmdbMatchStatus?: TmdbMatchStatus | null;
  tmdbMatchScore?: number | null;
  tmdbTitle?: string | null;
  tmdbOriginalTitle?: string | null;
  tmdbOverview?: string | null;
  tmdbPosterPath?: string | null;
  tmdbBackdropPath?: string | null;
  tmdbReleaseYear?: number | null;
  tmdbRating?: number | null;
  tmdbGenres?: string[] | null;
  tmdbLastEnrichedAt?: string | null;
};

export type LicenseChannelTmdbCacheRecord = {
  id: string;
  name: string;
  group_title: string | null;
  tvg_id: string | null;
  content_kind: TmdbCachedMetadata['contentKind'];
  tmdb_id: number | null;
  tmdb_media_type: TmdbMediaType | null;
  tmdb_match_status: TmdbMatchStatus | null;
  tmdb_match_score: number | null;
  tmdb_title: string | null;
  tmdb_original_title: string | null;
  tmdb_overview: string | null;
  tmdb_poster_path: string | null;
  tmdb_backdrop_path: string | null;
  tmdb_release_year: number | null;
  tmdb_rating: number | null;
  tmdb_genres: string[] | null;
  tmdb_last_enriched_at: string | null;
};
