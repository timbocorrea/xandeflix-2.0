export type IptvChannel = {
  id: string;
  name: string;
  url: string;
  logo?: string;
  groupTitle?: string;
  tvgId?: string;
  tvgName?: string;
  contentKind?: 'live' | 'movie' | 'series' | 'unknown' | null;
  tmdbId?: number | null;
  tmdbMediaType?: 'movie' | 'tv' | null;
  tmdbMatchStatus?:
    | 'pending'
    | 'matched'
    | 'not_found'
    | 'ambiguous'
    | 'skipped'
    | 'error'
    | null;
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

export type PlaylistDiagnostics = {
  contentLength: number;
  totalLines: number;
  startsWithExtM3u: boolean;
  extinfLines: number;
  playableUrlLines: number;
  firstNonEmptyLine: string;
};

export type LoadedPlaylist = {
  channels: IptvChannel[];
  total: number;
  diagnostics: PlaylistDiagnostics;
};

export type PlaylistLoadProgressPhase =
  | 'downloading'
  | 'parsing'
  | 'finalizing';

export type PlaylistLoadProgress = {
  phase: PlaylistLoadProgressPhase;
  bytesTotal: number | null;
  bytesReceived: number;
  parsedLines: number;
  channelsParsed: number;
  extinfLines: number;
  playableUrlLines: number;
};

export type PlaylistRuntimeStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error';

export type PlaylistSource = {
  url: string;
  name?: string;
};
