import { loadDirectSourcePlaylist } from '../../playlists/lib/directSourcePlaylistLoader';

import type { IptvChannel, PlaylistDiagnostics } from '../../playlists/types/playlist';
import type { IptvSource } from '../types/admin.types';

export type AdminPlaylistImportResult = {
  source: IptvSource;
  channels: IptvChannel[];
  diagnostics: PlaylistDiagnostics;
  total: number;
};

export async function importAdminPlaylistSource(
  source: IptvSource,
): Promise<AdminPlaylistImportResult> {
  const playlist = await loadDirectSourcePlaylist({
    url: source.source_url,
    name: source.name,
  });

  return {
    source,
    channels: playlist.channels,
    diagnostics: playlist.diagnostics,
    total: playlist.total,
  };
}
