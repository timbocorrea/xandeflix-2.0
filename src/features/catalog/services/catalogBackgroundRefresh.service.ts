import type {
  PlaylistRuntimeAuthorizationContext,
  PlaylistSource,
} from '@/features/playlists/types/playlist';
import { loadDirectSourcePlaylist } from '@/features/playlists/lib/directSourcePlaylistLoader';
import { prepareLocalCatalogRuntimeSnapshotBridge } from '@/features/localCatalog/services/localCatalogRuntimeSnapshotBridge.service';
import { LOCAL_CATALOG_CLASSIFICATION_VERSION } from '@/features/localCatalog/services/localPlaylistImport.service';
import { recordCatalogMetrics } from './catalogMetrics.service';
import type { NetworkMode } from '@/features/network/services/networkMode.service';
import type { CatalogBootMode } from './catalogRefreshPolicy.service';
import {
  endDiscoveryPerformanceSpan,
  incrementDiscoveryPerformanceCounter,
  markDiscoveryPerformance,
  startDiscoveryPerformanceSpan,
} from './discoveryPerformance.service';

export type CatalogBackgroundRefreshInput = {
  playlistSource: PlaylistSource;
  authorizationContext: PlaylistRuntimeAuthorizationContext | null;
  networkMode?: NetworkMode;
  bootMode?: CatalogBootMode;
  snapshotAgeMs?: number | null;
  signal?: AbortSignal;
};

export type CatalogBackgroundRefreshResult = {
  status: 'success' | 'failed' | 'canceled' | 'skipped';
  sourceId: string;
  bytesReceived: number;
  durationMs: number;
  parsedItems: number;
  promotedSnapshotId: string | null;
  errorCode?: string;
};

const inFlightBackgroundRefreshMap = new Map<
  string,
  Promise<CatalogBackgroundRefreshResult>
>();

export async function runCatalogBackgroundRefresh({
  playlistSource,
  authorizationContext,
  networkMode = 'unknown',
  bootMode = 'warm_start',
  snapshotAgeMs = null,
  signal,
}: CatalogBackgroundRefreshInput): Promise<CatalogBackgroundRefreshResult> {
  const sourceId = playlistSource.sourceId?.trim();
  const internalLicenseId = authorizationContext?.internalLicenseId?.trim();

  if (!sourceId || playlistSource.sourceType !== 'm3u' || !internalLicenseId) {
    recordCatalogMetrics({
      catalog_boot_mode: bootMode,
      snapshot_age_ms: snapshotAgeMs,
      refresh_duration_ms: 0,
      refresh_bytes: 0,
      refresh_result: 'skipped',
      network_mode: networkMode,
      failure_code: 'INVALID_SOURCE_OR_LICENSE',
    });

    return {
      status: 'skipped',
      sourceId: sourceId ?? 'unknown',
      bytesReceived: 0,
      durationMs: 0,
      parsedItems: 0,
      promotedSnapshotId: null,
      errorCode: 'INVALID_SOURCE_OR_LICENSE',
    };
  }

  if (inFlightBackgroundRefreshMap.has(sourceId)) {
    return await inFlightBackgroundRefreshMap.get(sourceId)!;
  }

  markDiscoveryPerformance(
    'catalog_background_refresh_start',
    { once: false },
  );
  startDiscoveryPerformanceSpan('catalog_background_refresh');
  incrementDiscoveryPerformanceCounter(
    'catalog_background_refresh_count',
  );

  const refreshPromise = (async (): Promise<CatalogBackgroundRefreshResult> => {
    const startTime = Date.now();
    let bytesReceived = 0;
    let snapshotBridge: Awaited<
      ReturnType<typeof prepareLocalCatalogRuntimeSnapshotBridge>
    > | null = null;

    try {
      if (signal?.aborted) {
        throw new DOMException('Background refresh aborted', 'AbortError');
      }

      snapshotBridge = await prepareLocalCatalogRuntimeSnapshotBridge({
        internalLicenseId,
        sourceId,
        sourceType: playlistSource.sourceType ?? 'm3u',
        signal,
        promotionEnabled: true,
        parserVersion: 1,
        classificationVersion: LOCAL_CATALOG_CLASSIFICATION_VERSION,
      });

      const loadedPlaylist = await loadDirectSourcePlaylist(playlistSource, {
        signal,
        collectChannels: false,
        onProgress: (progress) => {
          bytesReceived = progress.bytesReceived;
        },
        onChannelsBatch: async (channelBatch) => {
          if (signal?.aborted) {
            throw new DOMException('Background refresh aborted', 'AbortError');
          }
          if (snapshotBridge) {
            await snapshotBridge.writeBatch(channelBatch);
          }
        },
      });

      if (signal?.aborted) {
        await snapshotBridge.cancel().catch(() => undefined);
        const durationMs = Date.now() - startTime;

        recordCatalogMetrics({
          catalog_boot_mode: bootMode,
          snapshot_age_ms: snapshotAgeMs,
          refresh_duration_ms: durationMs,
          refresh_bytes: bytesReceived,
          refresh_result: 'canceled',
          network_mode: networkMode,
        });

        return {
          status: 'canceled',
          sourceId,
          bytesReceived,
          durationMs,
          parsedItems: loadedPlaylist.total,
          promotedSnapshotId: null,
        };
      }

      await snapshotBridge.complete({ parsedItems: loadedPlaylist.total });
      await snapshotBridge.promote();
      const promotedSnapshotId = snapshotBridge.getSnapshotId();
      const durationMs = Date.now() - startTime;

      recordCatalogMetrics({
        catalog_boot_mode: bootMode,
        snapshot_age_ms: snapshotAgeMs,
        refresh_duration_ms: durationMs,
        refresh_bytes: bytesReceived,
        refresh_result: 'success',
        network_mode: networkMode,
      });

      return {
        status: 'success',
        sourceId,
        bytesReceived,
        durationMs,
        parsedItems: loadedPlaylist.total,
        promotedSnapshotId,
      };
    } catch (error) {
      const isAbort =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        signal?.aborted;

      if (snapshotBridge) {
        await snapshotBridge
          .fail(isAbort ? 'ABORTED' : 'BACKGROUND_REFRESH_FAILED')
          .catch(() => undefined);
      }

      const durationMs = Date.now() - startTime;
      const status = isAbort ? 'canceled' : 'failed';
      const errorCode =
        error instanceof Error ? error.message : 'BACKGROUND_REFRESH_ERROR';

      recordCatalogMetrics({
        catalog_boot_mode: bootMode,
        snapshot_age_ms: snapshotAgeMs,
        refresh_duration_ms: durationMs,
        refresh_bytes: bytesReceived,
        refresh_result: status,
        network_mode: networkMode,
        failure_code: isAbort ? 'ABORTED' : 'BACKGROUND_REFRESH_FAILED',
      });

      return {
        status,
        sourceId,
        bytesReceived,
        durationMs,
        parsedItems: 0,
        promotedSnapshotId: null,
        errorCode,
      };
    } finally {
      inFlightBackgroundRefreshMap.delete(sourceId);
      markDiscoveryPerformance(
        'catalog_background_refresh_end',
        { once: false },
      );
      endDiscoveryPerformanceSpan('catalog_background_refresh');
    }
  })();

  inFlightBackgroundRefreshMap.set(sourceId, refreshPromise);
  return await refreshPromise;
}
