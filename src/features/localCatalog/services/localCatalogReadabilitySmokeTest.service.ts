import { prepareHomePlaylist } from '@/features/catalog/services/prepareHomePlaylist.service';
import { loadReadableLocalLiveChannels } from '@/features/live/services/localLiveCatalog.service';
import type { AuthorizedIptvSource } from '@/features/playlists/services/authorizedIptvSource.service';
import type { CatalogRepository } from '../repositories/catalogRepository.types';
import type {
  LocalCatalogImportMetadata,
  LocalCatalogItem,
} from '../types/localCatalog.types';
import { isLocalCatalogReadable } from './localCatalogReadability.service';

export type LocalCatalogReadabilitySmokeTestResult = {
  ok: boolean;
  firstImportIncomplete: boolean;
  ready: boolean;
  refreshImportingWithLastSuccess: boolean;
  refreshFailedWithLastSuccess: boolean;
  refreshCanceledWithLastSuccess: boolean;
  bootNoRedownload: boolean;
  bootScopePropagated: boolean;
  criticalCacheAvoidsIndexedDb: boolean;
  liveLocalFirst: boolean;
};

const SOURCE_ID = 'readability-smoke-source';
const LAST_SUCCESS = '2026-07-23T12:00:00.000Z';

function metadata(
  status: LocalCatalogImportMetadata['status'],
  lastSuccessfulImportAt: string | null,
): LocalCatalogImportMetadata {
  return {
    sourceId: SOURCE_ID,
    sourceType: 'm3u',
    status,
    startedAt: '2026-07-23T12:05:00.000Z',
    completedAt: status === 'importing' ? null : '2026-07-23T12:06:00.000Z',
    lastSuccessfulImportAt,
    parsedCount: status === 'ready' ? 10 : 0,
    importedCount: status === 'ready' ? 10 : 0,
    updatedCount: 0,
    removedCount: 0,
    unknownCount: 0,
    withoutGroupCount: 0,
    classificationVersion: 1,
    errorCode: status === 'failed' ? 'LOCAL_CATALOG_IMPORT_FAILED' : null,
  };
}

function repository(
  importMetadata: LocalCatalogImportMetadata,
  items: LocalCatalogItem[] = [],
): CatalogRepository {
  return {
    kind: 'local-indexeddb',
    getImportMetadata: async () => importMetadata,
    listItems: async () => items,
    listCategories: async () => [],
    getStats: async () => ({
      playlistItemsCount: items.length,
      catalogMetadataCount: 1,
      tmdbMetadataCount: 0,
      byContentKind: {
        live: items.filter((item) => item.contentKind === 'live').length,
        movie: 0,
        series: 0,
        series_episode: 0,
        radio: 0,
        unknown: 0,
      },
    }),
  };
}

export async function runLocalCatalogReadabilitySmokeTest(): Promise<LocalCatalogReadabilitySmokeTestResult> {
  const firstImportIncomplete = !isLocalCatalogReadable(
    metadata('importing', null),
  );
  const ready = isLocalCatalogReadable(metadata('ready', LAST_SUCCESS));
  const refreshImportingWithLastSuccess = isLocalCatalogReadable(
    metadata('importing', LAST_SUCCESS),
  );
  const refreshFailedWithLastSuccess = isLocalCatalogReadable(
    metadata('failed', LAST_SUCCESS),
  );
  const refreshCanceledWithLastSuccess = isLocalCatalogReadable(
    metadata('canceled', LAST_SUCCESS),
  );
  let sourceLoads = 0;
  let channelLoads = 0;
  const authorizedSource: AuthorizedIptvSource = {
    license: {
      id: 'internal-license-id',
      code: 'SMOKE',
      status: 'active',
      expiresAt: null,
    },
    device: {
      id: 'device-id',
      platform: 'smoke',
    },
    source: {
      id: SOURCE_ID,
      name: 'Fonte local simulada',
      type: 'm3u',
      url: 'https://source.example.invalid/playlist.m3u',
    },
  };

  const preparedPlaylist = await prepareHomePlaylist(
    {
      licenseCode: 'SMOKE',
      deviceIdentifier: 'device-id',
      currentChannelsCount: 0,
      currentStatus: 'idle',
      loadFromSource: async () => {
        sourceLoads += 1;
      },
      loadFromChannels: () => {
        channelLoads += 1;
      },
      clearRuntime: () => undefined,
    },
    {
      getAuthorizedSource: async () => authorizedSource,
      repository: repository(metadata('failed', LAST_SUCCESS)),
    },
  );

  const bootNoRedownload = sourceLoads === 0 && channelLoads === 1;
  const bootScopePropagated =
    preparedPlaylist.source.sourceId === SOURCE_ID &&
    /^scope_v1_[a-f0-9]{64}$/.test(
      preparedPlaylist.localCatalogScopeKey ?? '',
    );
  let criticalCacheMetadataReads = 0;
  let criticalCacheChannelLoads = 0;
  const criticalCachedPlaylist = await prepareHomePlaylist(
    {
      licenseCode: 'SMOKE',
      deviceIdentifier: 'device-id',
      currentChannelsCount: 0,
      currentStatus: 'idle',
      knownReadableSourceId: SOURCE_ID,
      loadFromSource: async () => {
        throw new Error('CRITICAL_CACHE_SOURCE_LOAD_FORBIDDEN');
      },
      loadFromChannels: () => {
        criticalCacheChannelLoads += 1;
      },
      clearRuntime: () => undefined,
    },
    {
      getAuthorizedSource: async () => authorizedSource,
      repository: {
        getImportMetadata: async () => {
          criticalCacheMetadataReads += 1;
          return metadata('ready', LAST_SUCCESS);
        },
      },
    },
  );
  const criticalCacheAvoidsIndexedDb =
    criticalCachedPlaylist.source.sourceId === SOURCE_ID &&
    criticalCacheMetadataReads === 0 &&
    criticalCacheChannelLoads === 1;
  const liveItem: LocalCatalogItem = {
    id: 'live-item',
    sourceId: SOURCE_ID,
    sourceType: 'm3u',
    name: 'Canal local',
    rawName: 'Canal local',
    normalizedName: 'canal local',
    groupTitle: 'Ao Vivo',
    normalizedGroup: 'ao vivo',
    contentKind: 'live',
    streamUrl: 'https://stream.example.invalid/live.m3u8',
    classificationVersion: 1,
    importSessionId: 'previous-success',
    createdAt: LAST_SUCCESS,
    updatedAt: LAST_SUCCESS,
  };
  const liveChannels = await loadReadableLocalLiveChannels(
    SOURCE_ID,
    repository(metadata('canceled', LAST_SUCCESS), [liveItem]),
  );
  const liveLocalFirst =
    liveChannels?.length === 1 &&
    liveChannels[0]?.id === liveItem.id &&
    liveChannels[0]?.url === liveItem.streamUrl;
  const result = {
    firstImportIncomplete,
    ready,
    refreshImportingWithLastSuccess,
    refreshFailedWithLastSuccess,
    refreshCanceledWithLastSuccess,
    bootNoRedownload,
    bootScopePropagated,
    criticalCacheAvoidsIndexedDb,
    liveLocalFirst,
  };

  return {
    ok: Object.values(result).every(Boolean),
    ...result,
  };
}
