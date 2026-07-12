import {
  getAuthorizedIptvSource,
  mapAuthorizedIptvSourceToPlaylistSource,
} from '@/features/playlists/services/authorizedIptvSource.service';
import type {
  PlaylistLoadProgress,
  PlaylistSource,
} from '@/features/playlists/types/playlist';

export type PrepareHomePlaylistInput = {
  licenseCode: string;
  deviceIdentifier: string;
  currentChannelsCount: number;
  currentStatus: string;
  currentSourceId?: string;
  loadFromSource: (source: PlaylistSource) => Promise<void>;
  clearRuntime: () => void;
  onProgress?: (progress: PlaylistLoadProgress) => void;
};

export async function prepareHomePlaylist({
  licenseCode,
  deviceIdentifier,
  currentChannelsCount,
  currentStatus,
  currentSourceId,
  loadFromSource,
  clearRuntime,
}: PrepareHomePlaylistInput) {
  try {
    const authorizedSource = await getAuthorizedIptvSource({
      deviceIdentifier,
      licenseCode,
    });
    const playlistSource = mapAuthorizedIptvSourceToPlaylistSource(authorizedSource);
    const isCurrentAuthorizedSource =
      Boolean(currentSourceId) && currentSourceId === playlistSource.sourceId;

    if (
      isCurrentAuthorizedSource &&
      (currentChannelsCount > 0 ||
        currentStatus === 'loading' ||
        currentStatus === 'ready')
    ) {
      return;
    }

    if (currentSourceId && !isCurrentAuthorizedSource) {
      clearRuntime();
    }

    void loadFromSource(playlistSource).catch(() => undefined);
  } catch (error) {
    clearRuntime();
    throw error;
  }
}
