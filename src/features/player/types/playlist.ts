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
