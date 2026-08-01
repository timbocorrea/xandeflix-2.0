import type { IptvChannel } from '@/features/playlists/types/playlist';

import { deriveLocalCatalogScope } from './localCatalogScope.service';
import {
  createLocalCatalogSnapshotImportSession,
  type LocalCatalogSnapshotImportSession,
} from './localCatalogSnapshotImport.service';
import {
  getLocalCatalogScope,
  getLocalCatalogSnapshot,
} from './localCatalogDb.service';
import { purgeLocalCatalogSnapshotPartialData } from './localCatalogSnapshotPurge.service';
import { prepareLocalCatalogRuntimeScope } from './localCatalogSnapshotLifecycle.service';

export type LocalCatalogRuntimeSnapshotBridgeMetrics = {
  enabled: true;
  prepared: boolean;
  status: 'prepared' | 'building' | 'ready' | 'active' | 'failed' | 'canceled';
  batchesCommitted: number;
  itemsProcessed: number;
  duplicatesIgnored: number;
  failureCode: string | null;
  durationBucket: 'under_1s' | 'under_5s' | 'under_30s' | 'over_30s';
};

export type LocalCatalogRuntimeSnapshotBridge = {
  writeBatch(channels: IptvChannel[]): Promise<void>;
  complete(finalStats?: { parsedItems?: number }): Promise<void>;
  promote(): Promise<void>;
  cancel(): Promise<void>;
  fail(failureCode?: string): Promise<void>;
  getSnapshotId(): string;
  getSanitizedMetrics(): LocalCatalogRuntimeSnapshotBridgeMetrics;
};

export type PrepareLocalCatalogRuntimeSnapshotBridgeInput = {
  internalLicenseId: string;
  sourceId: string;
  sourceType: 'm3u' | 'xtream' | 'manual' | 'unknown';
  signal?: AbortSignal;
  promotionEnabled: boolean;
  parserVersion: number;
  classificationVersion: number;
  transformConcurrency?: number;
};

function createSnapshotId() {
  if (!globalThis.crypto?.randomUUID)
    throw new Error('LOCAL_CATALOG_SNAPSHOT_ID_UNAVAILABLE');
  return `snapshot_${globalThis.crypto.randomUUID()}`;
}

function sanitizeFailureCode(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError')
    return 'LOCAL_CATALOG_IMPORT_CANCELED';
  if (error instanceof Error && /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(error.message))
    return error.message;
  if (typeof error === 'string' && /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(error))
    return error;
  return 'LOCAL_CATALOG_SIDECAR_FAILED';
}

function durationBucket(startedAt: number) {
  const duration = Date.now() - startedAt;
  if (duration < 1_000) return 'under_1s' as const;
  if (duration < 5_000) return 'under_5s' as const;
  if (duration < 30_000) return 'under_30s' as const;
  return 'over_30s' as const;
}

export async function prepareLocalCatalogRuntimeSnapshotBridge(
  input: PrepareLocalCatalogRuntimeSnapshotBridgeInput,
): Promise<LocalCatalogRuntimeSnapshotBridge> {
  if (input.sourceType !== 'm3u')
    throw new Error('LOCAL_CATALOG_SOURCE_TYPE_UNSUPPORTED');
  if (input.signal?.aborted)
    throw Object.assign(new Error('LOCAL_CATALOG_IMPORT_CANCELED'), {
      name: 'AbortError',
    });

  const startedAt = Date.now();
  const promotionEnabled = input.promotionEnabled;
  const derivedScope = await deriveLocalCatalogScope({
    internalLicenseId: input.internalLicenseId,
    sourceId: input.sourceId,
  });
  const previousScope = await getLocalCatalogScope(derivedScope.scopeKey);
  const previousStagingSnapshot = previousScope?.stagingSnapshotId
    ? await getLocalCatalogSnapshot(previousScope.stagingSnapshotId)
    : null;

  if (
    previousStagingSnapshot &&
    previousStagingSnapshot.status !== 'ready' &&
    previousStagingSnapshot.status !== 'active'
  ) {
    await purgeLocalCatalogSnapshotPartialData({
      snapshotId: previousStagingSnapshot.snapshotId,
    });
  }

  const preparedScope = await prepareLocalCatalogRuntimeScope({
    ...derivedScope,
    timestamp: new Date().toISOString(),
  });
  const snapshotId = createSnapshotId();
  const session: LocalCatalogSnapshotImportSession =
    await createLocalCatalogSnapshotImportSession({
      scopeKey: derivedScope.scopeKey,
      sourceId: derivedScope.sourceId,
      snapshotId,
      expectedRuntimeEpoch: preparedScope.runtimeEpoch,
      sourceRevision: null,
      sourceEtag: null,
      sourceLastModified: null,
      parserVersion: input.parserVersion,
      classificationVersion: input.classificationVersion,
      batchSize: 500,
      transformConcurrency: input.transformConcurrency ?? 2,
      signal: input.signal,
    });
  let bridgeStatus: LocalCatalogRuntimeSnapshotBridgeMetrics['status'] =
    'prepared';
  let failureCode: string | null = null;

  async function failSidecar(error: unknown) {
    failureCode = sanitizeFailureCode(error);
    bridgeStatus = failureCode === 'LOCAL_CATALOG_IMPORT_CANCELED'
      ? 'canceled'
      : 'failed';
    if (bridgeStatus === 'canceled') {
      await session.cancel();
    } else {
      await session.fail(failureCode).catch(() => undefined);
    }
    return failureCode;
  }

  return {
    async writeBatch(channels) {
      if (bridgeStatus === 'failed' || bridgeStatus === 'canceled')
        throw new Error(failureCode ?? 'LOCAL_CATALOG_SIDECAR_FAILED');
      bridgeStatus = 'building';
      try {
        await session.writeBatch(channels);
      } catch (error) {
        // Raw causes are intentionally discarded at the fail-open boundary.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(await failSidecar(error));
      }
    },
    async complete(finalStats) {
      try {
        await session.complete(finalStats);
        bridgeStatus = 'ready';
      } catch (error) {
        // Raw causes are intentionally discarded at the fail-open boundary.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(await failSidecar(error));
      }
    },
    async promote() {
      if (!promotionEnabled)
        throw new Error('LOCAL_CATALOG_PROMOTION_DISABLED');
      try {
        await session.promote();
        bridgeStatus = 'active';
      } catch (error) {
        // Raw causes are intentionally discarded at the fail-open boundary.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(await failSidecar(error));
      }
    },
    async cancel() {
      await failSidecar('LOCAL_CATALOG_IMPORT_CANCELED');
    },
    async fail(nextFailureCode = 'LOCAL_CATALOG_SIDECAR_FAILED') {
      await failSidecar(nextFailureCode);
    },
    getSnapshotId() {
      return snapshotId;
    },
    getSanitizedMetrics() {
      const sessionMetrics = session.getMetrics();
      return {
        enabled: true,
        prepared: true,
        status: bridgeStatus,
        batchesCommitted: sessionMetrics.batchesCommitted,
        itemsProcessed: sessionMetrics.parsedItems,
        duplicatesIgnored: sessionMetrics.duplicatesIgnored,
        failureCode,
        durationBucket: durationBucket(startedAt),
      };
    },
  };
}
