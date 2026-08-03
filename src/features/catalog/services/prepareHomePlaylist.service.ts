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
import { deriveLocalCatalogScope } from '@/features/localCatalog/services/localCatalogScope.service';

export type PrepareHomePlaylistInput = {
  licenseCode: string;
  deviceIdentifier: string;
  currentChannelsCount: number;
  currentStatus: string;
  currentSourceId?: string;
  knownReadableSourceId?: string;
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

export type PreparedHomePlaylist = {
  source: PlaylistSource;
  authorizationContext: PlaylistRuntimeAuthorizationContext | null;
  localCatalogScopeKey: string | null;
};

const defaultDependencies: PrepareHomePlaylistDependencies = {
  getAuthorizedSource: getAuthorizedIptvSource,
  repository: localCatalogRepository,
};

const inFlightPrepareMap = new Map<string, Promise<PreparedHomePlaylist>>();


function createOfflinePreparedHomePlaylist(
  sourceId: string,
  loadFromChannels: PrepareHomePlaylistInput['loadFromChannels'],
) {
  const source: PlaylistSource = {
    sourceId,
    sourceType: 'm3u',
    name: 'Lista IPTV Local',
    url: '',
  };
  loadFromChannels({ source, channels: [] });
  return createPreparedHomePlaylist(source, null);
}

async function createPreparedHomePlaylist(
  source: PlaylistSource,
  authorizationContext: PlaylistRuntimeAuthorizationContext | null,
): Promise<PreparedHomePlaylist> {
  const internalLicenseId = authorizationContext?.internalLicenseId.trim();
  const sourceId = source.sourceId?.trim();

  if (!internalLicenseId || !sourceId) {
    return {
      source,
      authorizationContext,
      localCatalogScopeKey: null,
    };
  }

  const scope = await deriveLocalCatalogScope({
    internalLicenseId,
    sourceId,
  });

  return {
    source,
    authorizationContext,
    localCatalogScopeKey: scope.scopeKey,
  };
}

export async function prepareHomePlaylist({
  licenseCode,
  deviceIdentifier,
  currentChannelsCount,
  currentStatus,
  currentSourceId,
  knownReadableSourceId,
  loadFromSource,
  loadFromChannels,
  clearRuntime,
}: PrepareHomePlaylistInput, dependencies = defaultDependencies) {
  const readableOfflineSourceId =
    currentSourceId?.trim() || knownReadableSourceId?.trim() || '';

  if (
    readableOfflineSourceId &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    return createOfflinePreparedHomePlaylist(
      readableOfflineSourceId,
      loadFromChannels,
    );
  }

  let authorizedSource = null;
  try {
    authorizedSource = await dependencies.getAuthorizedSource({
      deviceIdentifier,
      licenseCode,
    });
  } catch (error) {
    const fallbackSourceId = readableOfflineSourceId || 'source-default';
    const fallbackMetadata = await dependencies.repository
      .getImportMetadata(fallbackSourceId)
      .catch(() => null);

    if (isLocalCatalogReadable(fallbackMetadata)) {
      return createOfflinePreparedHomePlaylist(
        fallbackSourceId,
        loadFromChannels,
      );
    }

    clearRuntime();
    throw error;
  }

  const playlistSource = mapAuthorizedIptvSourceToPlaylistSource(authorizedSource);
  const authorizationContext =
    mapAuthorizedIptvSourceToRuntimeAuthorizationContext(authorizedSource);
  const preparedPlaylist = await createPreparedHomePlaylist(
    playlistSource,
    authorizationContext,
  );
  const sourceId = playlistSource.sourceId?.trim();
  const isCurrentAuthorizedSource =
    Boolean(currentSourceId) && currentSourceId === sourceId;

  if (
    playlistSource.sourceType === 'm3u' &&
    sourceId &&
    knownReadableSourceId?.trim() === sourceId
  ) {
    loadFromChannels({
      source: playlistSource,
      channels: [],
      authorizationContext,
    });
    return preparedPlaylist;
  }

  if (
    isCurrentAuthorizedSource &&
    (currentChannelsCount > 0 ||
      currentStatus === 'loading' ||
      currentStatus === 'ready')
  ) {
    return preparedPlaylist;
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
    return preparedPlaylist;
  }

  if (sourceId && inFlightPrepareMap.has(sourceId)) {
    return await inFlightPrepareMap.get(sourceId)!;
  }

  const preparePromise = (async () => {
    try {
      await loadFromSource(playlistSource, authorizationContext);
      return preparedPlaylist;
    } finally {
      if (sourceId) {
        inFlightPrepareMap.delete(sourceId);
      }
    }
  })();

  if (sourceId) {
    inFlightPrepareMap.set(sourceId, preparePromise);
  }

  return await preparePromise;
}

