import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';
import {
  getAuthorizedIptvSource,
  mapAuthorizedIptvSourceToPlaylistSource,
} from '@/features/playlists/services/authorizedIptvSource.service';
import type { PlaylistLoadProgress } from '@/features/playlists/types/playlist';

export type PrepareHomePlaylistInput = {
  currentChannelsCount: number;
  currentStatus: string;
  loadFromSource: (source: { url: string; name?: string }) => Promise<void>;
  onProgress?: (progress: PlaylistLoadProgress) => void;
};

export async function prepareHomePlaylist({
  currentChannelsCount,
  currentStatus,
  loadFromSource,
}: PrepareHomePlaylistInput) {
  if (
    currentChannelsCount > 0 ||
    currentStatus === 'loading' ||
    currentStatus === 'ready'
  ) {
    return;
  }

  const deviceIdentifier = getOrCreateDeviceIdentifier();
  const storedActivation = getStoredLicenseActivation();

  const authorizedSource = await getAuthorizedIptvSource({
    deviceIdentifier,
    licenseCode: storedActivation?.licenseCode,
  });

  await loadFromSource(mapAuthorizedIptvSourceToPlaylistSource(authorizedSource));
}
