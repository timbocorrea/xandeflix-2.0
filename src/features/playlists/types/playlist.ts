export type IptvChannel = {
  id: string;
  name: string;
  url: string;
  logo?: string;
  groupTitle?: string;
  tvgId?: string;
  tvgName?: string;
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
