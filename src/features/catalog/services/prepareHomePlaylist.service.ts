import {
  getAuthorizedIptvSource,
  mapAuthorizedIptvSourceToPlaylistSource,
  mapAuthorizedIptvSourceToRuntimeAuthorizationContext,
} from '@/features/playlists/services/authorizedIptvSource.service';
import type {
  IptvChannel,
  PlaylistLoadProgress,
  PlaylistRuntimeAuthorizationContext,
  PlaylistSource,
} from '@/features/playlists/types/playlist';
import { localCatalogRepository } from '@/features/localCatalog/repositories/localCatalogRepository.service';
import type { CatalogRepository } from '@/features/localCatalog/repositories/catalogRepository.types';
import { isLocalCatalogReadable } from '@/features/localCatalog/services/localCatalogReadability.service';

export type PrepareHomePlaylistInput = {
  licenseCode: string;
  deviceIdentifier: string;
  currentChannelsCount: number;
  currentStatus: string;
  currentSourceId?: string;
  loadFromSource: (
    source: PlaylistSource,
    authorizationContext?: PlaylistRuntimeAuthorizationContext | null,
  ) => Promise<void>;
  loadFromChannels: (input: {
    source: PlaylistSource;
    channels: IptvChannel[];
    authorizationContext?: PlaylistRuntimeAuthorizationContext | null;
  }) => void;
  clearRuntime: () => void;
  onProgress?: (progress: PlaylistLoadProgress) => void;
};

export type PrepareHomePlaylistDependencies = {
  getAuthorizedSource: typeof getAuthorizedIptvSource;
  repository: Pick<CatalogRepository, 'getImportMetadata'>;
};

const defaultDependencies: PrepareHomePlaylistDependencies = {
  getAuthorizedSource: getAuthorizedIptvSource,
  repository: localCatalogRepository,
};

export async function prepareHomePlaylist({
  licenseCode,
  deviceIdentifier,
  currentChannelsCount,
  currentStatus,
  currentSourceId,
  loadFromSource,
  loadFromChannels,
  clearRuntime,
}: PrepareHomePlaylistInput, dependencies = defaultDependencies) {
  try {
    const authorizedSource = await dependencies.getAuthorizedSource({
      deviceIdentifier,
      licenseCode,
    });
    const playlistSource = mapAuthorizedIptvSourceToPlaylistSource(authorizedSource);
    const authorizationContext =
      mapAuthorizedIptvSourceToRuntimeAuthorizationContext(authorizedSource);
    const sourceId = playlistSource.sourceId?.trim();
    const isCurrentAuthorizedSource =
      Boolean(currentSourceId) && currentSourceId === sourceId;

    if (
      isCurrentAuthorizedSource &&
      (currentChannelsCount > 0 ||
        currentStatus === 'loading' ||
        currentStatus === 'ready')
    ) {
      return playlistSource;
    }

    if (currentSourceId && !isCurrentAuthorizedSource) {
      clearRuntime();
    }

    let metadata = null;

    if (playlistSource.sourceType === 'm3u' && sourceId) {
      try {
        metadata = await dependencies.repository.getImportMetadata(
          sourceId,
        );
      } catch {
        // IndexedDB indisponível torna o catálogo local inutilizável;
        // o fallback direto autorizado permanece no endpoint.
      }
    }

    if (isLocalCatalogReadable(metadata)) {
      loadFromChannels({
        source: playlistSource,
        channels: [],
        authorizationContext,
      });
      return playlistSource;
    }

    void loadFromSource(playlistSource, authorizationContext).catch(
      () => undefined,
    );

    return playlistSource;
  } catch (error) {
    clearRuntime();
    throw error;
  }
}
