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
  SourceImportTask,
} from '@/features/playlists/types/playlist';
import { localCatalogRepository } from '@/features/localCatalog/repositories/localCatalogRepository.service';
import type { CatalogRepository } from '@/features/localCatalog/repositories/catalogRepository.types';
import { isLocalCatalogReadable } from '@/features/localCatalog/services/localCatalogReadability.service';
import { deriveLocalCatalogScope } from '@/features/localCatalog/services/localCatalogScope.service';
import { getReadableLocalCatalogActiveSnapshot } from '@/features/localCatalog/services/localCatalogSnapshotLifecycle.service';
import { env } from '@/config/env';
import { e8DiagnosticLog } from '@/platform/e8DiagnosticLog';

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
  startSourceImport?: (
    source: PlaylistSource,
    authorizationContext?: PlaylistRuntimeAuthorizationContext | null,
  ) => SourceImportTask;
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
  getActiveSnapshot?: typeof getReadableLocalCatalogActiveSnapshot;
};

export type PreparedHomePlaylist = {
  source: PlaylistSource;
  authorizationContext: PlaylistRuntimeAuthorizationContext | null;
  localCatalogScopeKey: string | null;
  firstFoldSnapshotId?: string | null;
  firstFoldReadMode?: 'staging' | 'active' | null;
  firstFoldHomeSections?: import('@/features/catalog/services/homeVod.service').HomeVodSection[];
};

const defaultDependencies: PrepareHomePlaylistDependencies = {
  getAuthorizedSource: getAuthorizedIptvSource,
  repository: localCatalogRepository,
  getActiveSnapshot: getReadableLocalCatalogActiveSnapshot,
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
  startSourceImport,
  loadFromSource,
  loadFromChannels,
  clearRuntime,
}: PrepareHomePlaylistInput, dependencies = defaultDependencies) {
  e8DiagnosticLog('PREPARE_HOME_ENTER');
  const consumerStartedAt = performance.now();
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

  let authorizedSource: Awaited<
    ReturnType<PrepareHomePlaylistDependencies['getAuthorizedSource']>
  >;
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

  let isCatalogUsable = false;
  if (isLocalCatalogReadable(metadata)) {
    if (preparedPlaylist.localCatalogScopeKey) {
      const activeSnapshot = await (
        dependencies.getActiveSnapshot ??
        getReadableLocalCatalogActiveSnapshot
      )(preparedPlaylist.localCatalogScopeKey).catch(() => null);
      isCatalogUsable = Boolean(
        activeSnapshot && (activeSnapshot.totalItems ?? 0) > 0,
      );
    } else {
      isCatalogUsable = true;
    }
  }

  if (isCatalogUsable) {
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
      if (typeof startSourceImport === 'function') {
        e8DiagnosticLog('SOURCE_IMPORT_DISPATCH', {
          managedRequested: Boolean(
            env.localCatalogSnapshotImportEnabled &&
              authorizationContext?.internalLicenseId?.trim() &&
              sourceId &&
              playlistSource.sourceType === 'm3u',
          ),
        });
        const task = startSourceImport(
          playlistSource,
          authorizationContext,
        );
        const firstFold = await task.firstFoldReady;
        e8DiagnosticLog('FIRST_FOLD_READY_CONSUMED', {
          consumerElapsedMs: Math.round(performance.now() - consumerStartedAt),
          readMode: firstFold.readMode,
          hasRenderableVodSections: firstFold.hasRenderableVodSections,
        });
        return {
          ...preparedPlaylist,
          localCatalogScopeKey:
            firstFold.scopeKey || preparedPlaylist.localCatalogScopeKey,
          firstFoldSnapshotId: firstFold.snapshotId,
          firstFoldReadMode: firstFold.readMode,
          firstFoldHomeSections: firstFold.homeSections ?? [],
        };
      }
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
