import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';
import {
  getAuthorizedIptvSource,
  mapAuthorizedIptvSourceToPlaylistSource,
} from '@/features/playlists/services/authorizedIptvSource.service';
import { listAuthorizedLicenseChannels } from '@/features/playlists/services/authorizedLicenseChannels.service';
import type { IptvChannel } from '@/features/playlists/types/playlist';
import type { PlaylistLoadProgress } from '@/features/playlists/types/playlist';

export type PrepareHomePlaylistInput = {
  currentChannelsCount: number;
  currentStatus: string;
  loadFromSource: (source: { url: string; name?: string }) => Promise<void>;
  loadFromChannels?: (input: {
    source: { url: string; name?: string };
    channels: IptvChannel[];
  }) => void;
  allowDirectFallback?: boolean;
  onProgress?: (progress: PlaylistLoadProgress) => void;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('HOME_LICENSE_CACHE_TIMEOUT'));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

export async function prepareHomePlaylist({
  currentChannelsCount,
  currentStatus,
  loadFromSource,
  loadFromChannels,
  allowDirectFallback = true,
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

  if (storedActivation?.licenseId && loadFromChannels) {
    try {
      const licenseChannels = await withTimeout(
        listAuthorizedLicenseChannels({
          licenseId: storedActivation.licenseId,
          pageSize: 100,
          maxPages: 4,
        }),
        7000,
      );

      if (licenseChannels.length > 0) {
        loadFromChannels({
          source: {
            url: `license-cache://${storedActivation.licenseId}`,
            name: 'Canais autorizados da licenca',
          },
          channels: licenseChannels,
        });

        return;
      }
    } catch {
      // Mantem o fallback legado para a playlist direta quando o cache falhar.
    }
  }

  if (!allowDirectFallback) {
    throw new Error('HOME_LICENSE_CACHE_UNAVAILABLE');
  }

  const authorizedSource = await getAuthorizedIptvSource({
    deviceIdentifier,
    licenseCode: storedActivation?.licenseCode,
  });

  await loadFromSource(mapAuthorizedIptvSourceToPlaylistSource(authorizedSource));
}
