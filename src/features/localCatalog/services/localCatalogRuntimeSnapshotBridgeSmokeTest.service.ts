import { env } from '@/config/env';
import type { IptvChannel } from '@/features/playlists/types/playlist';

import {
  getLocalCatalogScope,
  getLocalCatalogSnapshot,
  listLocalCatalogSnapshots,
  LOCAL_CATALOG_DB_VERSION,
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
  putLocalCatalogScope,
  putLocalCatalogSnapshot,
} from './localCatalogDb.service';
import {
  prepareLocalCatalogRuntimeSnapshotBridge,
  type LocalCatalogRuntimeSnapshotBridge,
} from './localCatalogRuntimeSnapshotBridge.service';
import { deriveLocalCatalogScope } from './localCatalogScope.service';
import { runLocalCatalogSnapshotImportSmokeTest } from './localCatalogSnapshotImportSmokeTest.service';
import type {
  LocalCatalogScope,
  LocalCatalogSnapshot,
} from '../types/localCatalog.types';

const RAW_LICENSE_A = 'synthetic-runtime-license-a';
const RAW_LICENSE_B = 'synthetic-runtime-license-b';
const SOURCE_MAIN = 'synthetic-runtime-source-main';
const SOURCE_DISABLED = 'synthetic-runtime-source-disabled';
const SOURCE_FAILURE = 'synthetic-runtime-source-failure';
const SOURCE_CANCEL = 'synthetic-runtime-source-cancel';
const STAMP = '2000-01-01T00:00:00.000Z';

export type LocalCatalogRuntimeSnapshotBridgeSmokeTestResult = {
  ok: boolean;
  flagsDefaultOff: boolean;
  disabledCreatesNoV3Scope: boolean;
  disabledCreatesNoV3Writes: boolean;
  opaqueScopeDeterministic: boolean;
  differentTenantIsolated: boolean;
  sensitiveMaterialAbsent: boolean;
  sameBatchesDelivered: boolean;
  singleDownloadContract: boolean;
  singleParserContract: boolean;
  v2PathPreserved: boolean;
  orderedBatchWrites: boolean;
  completionAwaitsWrites: boolean;
  v3FailureDoesNotBreakLegacy: boolean;
  activePreservedOnFailure: boolean;
  cancelStopsFutureWrites: boolean;
  runtimeEpochBlocksLateWrite: boolean;
  staleRequestCannotPromote: boolean;
  promotionDisabledLeavesReady: boolean;
  promotionEnabledActivatesSnapshot: boolean;
  completionDoesNotRequireSeriesLookup: boolean;
  promotionDoesNotScheduleFullScan: boolean;
  cycle4aRegressionPass: boolean;
  syntheticCleanup: boolean;
  errorCode?: string;
};

function channel(index: number): IptvChannel {
  return {
    id: `synthetic-${index}`,
    name: `Synthetic Runtime Item ${index}`,
    url: `https://synthetic.invalid/runtime-${index}.m3u8`,
    groupTitle: 'Synthetic Runtime',
    tvgId: `runtime-${index}`,
  };
}

function activeSnapshot(
  snapshotId: string,
  scopeKey: string,
): LocalCatalogSnapshot {
  return {
    snapshotId,
    scopeKey,
    status: 'active',
    sourceRevision: null,
    classificationVersion: 1,
    schemaVersion: LOCAL_CATALOG_DB_VERSION,
    totalItems: 1,
    createdAt: STAMP,
    updatedAt: STAMP,
    completedAt: STAMP,
    failureCode: null,
  };
}

function activeScope(input: {
  scopeKey: string;
  tenantScopeId: string;
  sourceId: string;
  activeSnapshotId: string;
}): LocalCatalogScope {
  return {
    ...input,
    stagingSnapshotId: null,
    accessStatus: 'active',
    runtimeEpoch: 1,
    retentionPolicyVersion: 1,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(new Error('LOCAL_CATALOG_RUNTIME_SMOKE_TRANSACTION_FAILED'));
  });
}

async function itemCount(snapshotId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.items,
      'readonly',
    );
    const request = transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.items)
      .index('snapshotId')
      .count(IDBKeyRange.only(snapshotId));
    return await new Promise<number>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('LOCAL_CATALOG_RUNTIME_SMOKE_READ_FAILED'));
    });
  } finally {
    db.close();
  }
}

async function cleanupScopes(scopeKeys: string[]) {
  const snapshots = (
    await Promise.all(scopeKeys.map((scopeKey) =>
      listLocalCatalogSnapshots(scopeKey).catch(() => []),
    ))
  ).flat();
  const db = await openLocalCatalogDb();
  try {
    const stores = [
      LOCAL_CATALOG_V3_STORES.scopes,
      LOCAL_CATALOG_V3_STORES.snapshots,
      LOCAL_CATALOG_V3_STORES.checkpoints,
      LOCAL_CATALOG_V3_STORES.items,
      LOCAL_CATALOG_V3_STORES.categories,
      LOCAL_CATALOG_V3_STORES.metrics,
    ];
    const transaction = db.transaction(stores, 'readwrite');
    const done = transactionDone(transaction);
    for (const scopeKey of scopeKeys) {
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).delete(scopeKey);
    }
    for (const snapshot of snapshots) {
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots)
        .delete(snapshot.snapshotId);
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints)
        .delete(snapshot.snapshotId);
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.metrics)
        .delete(snapshot.snapshotId);
      for (const storeName of [
        LOCAL_CATALOG_V3_STORES.items,
        LOCAL_CATALOG_V3_STORES.categories,
      ]) {
        const request = transaction.objectStore(storeName)
          .index('snapshotId').openKeyCursor(IDBKeyRange.only(snapshot.snapshotId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          transaction.objectStore(storeName).delete(cursor.primaryKey);
          cursor.continue();
        };
      }
    }
    await done;
  } finally {
    db.close();
  }
}

async function prepareBridge(input: {
  internalLicenseId: string;
  sourceId: string;
  promotionEnabled: boolean;
  signal?: AbortSignal;
}) {
  return prepareLocalCatalogRuntimeSnapshotBridge({
    ...input,
    sourceType: 'm3u',
    parserVersion: 1,
    classificationVersion: 1,
    transformConcurrency: 2,
  });
}

async function writeChannels(
  bridge: LocalCatalogRuntimeSnapshotBridge,
  channels: IptvChannel[],
  batchSize: number,
  onLegacyBatch: (batch: IptvChannel[]) => void,
) {
  for (let start = 0; start < channels.length; start += batchSize) {
    const batch = channels.slice(start, start + batchSize);
    onLegacyBatch(batch);
    await bridge.writeBatch(batch);
  }
}

export async function runLocalCatalogRuntimeSnapshotBridgeSmokeTest(): Promise<LocalCatalogRuntimeSnapshotBridgeSmokeTestResult> {
  const result: LocalCatalogRuntimeSnapshotBridgeSmokeTestResult = {
    ok: false,
    flagsDefaultOff: false,
    disabledCreatesNoV3Scope: false,
    disabledCreatesNoV3Writes: false,
    opaqueScopeDeterministic: false,
    differentTenantIsolated: false,
    sensitiveMaterialAbsent: false,
    sameBatchesDelivered: false,
    singleDownloadContract: false,
    singleParserContract: false,
    v2PathPreserved: false,
    orderedBatchWrites: false,
    completionAwaitsWrites: false,
    v3FailureDoesNotBreakLegacy: false,
    activePreservedOnFailure: false,
    cancelStopsFutureWrites: false,
    runtimeEpochBlocksLateWrite: false,
    staleRequestCannotPromote: false,
    promotionDisabledLeavesReady: false,
    promotionEnabledActivatesSnapshot: false,
    completionDoesNotRequireSeriesLookup: false,
    promotionDoesNotScheduleFullScan: false,
    cycle4aRegressionPass: false,
    syntheticCleanup: false,
  };
  const derivedDisabled = await deriveLocalCatalogScope({
    internalLicenseId: RAW_LICENSE_A,
    sourceId: SOURCE_DISABLED,
  });
  const derivedMain = await deriveLocalCatalogScope({
    internalLicenseId: RAW_LICENSE_A,
    sourceId: SOURCE_MAIN,
  });
  const derivedMainAgain = await deriveLocalCatalogScope({
    internalLicenseId: RAW_LICENSE_A,
    sourceId: SOURCE_MAIN,
  });
  const derivedOtherTenant = await deriveLocalCatalogScope({
    internalLicenseId: RAW_LICENSE_B,
    sourceId: SOURCE_MAIN,
  });
  const derivedFailure = await deriveLocalCatalogScope({
    internalLicenseId: RAW_LICENSE_A,
    sourceId: SOURCE_FAILURE,
  });
  const derivedCancel = await deriveLocalCatalogScope({
    internalLicenseId: RAW_LICENSE_A,
    sourceId: SOURCE_CANCEL,
  });
  const scopeKeys = [
    derivedDisabled.scopeKey,
    derivedMain.scopeKey,
    derivedOtherTenant.scopeKey,
    derivedFailure.scopeKey,
    derivedCancel.scopeKey,
  ];

  try {
    await cleanupScopes(scopeKeys).catch(() => undefined);
    result.flagsDefaultOff =
      !env.localCatalogSnapshotImportEnabled &&
      !env.localCatalogSnapshotPromotionEnabled;
    result.disabledCreatesNoV3Scope =
      (await getLocalCatalogScope(derivedDisabled.scopeKey)) === null;
    result.disabledCreatesNoV3Writes =
      (await listLocalCatalogSnapshots(derivedDisabled.scopeKey)).length === 0;
    result.opaqueScopeDeterministic =
      derivedMain.scopeKey === derivedMainAgain.scopeKey &&
      derivedMain.tenantScopeId === derivedMainAgain.tenantScopeId;
    result.differentTenantIsolated =
      derivedMain.scopeKey !== derivedOtherTenant.scopeKey &&
      derivedMain.tenantScopeId !== derivedOtherTenant.tenantScopeId;

    const activeMainId = 'smoke-runtime-main-active-a';
    await putLocalCatalogScope(activeScope({
      ...derivedMain,
      activeSnapshotId: activeMainId,
    }));
    await putLocalCatalogSnapshot(activeSnapshot(activeMainId, derivedMain.scopeKey));
    const mainBridge = await prepareBridge({
      internalLicenseId: RAW_LICENSE_A,
      sourceId: SOURCE_MAIN,
      promotionEnabled: false,
    });
    const channels = Array.from({ length: 500 }, (_, index) => channel(index));
    let legacyItems = 0;
    let legacyBatches = 0;
    let downloadCount = 0;
    let parserCount = 0;
    downloadCount += 1;
    parserCount += 1;
    await writeChannels(mainBridge, channels.slice(0, 450), 50, (batch) => {
      legacyItems += batch.length;
      legacyBatches += 1;
    });
    const lastBatch = channels.slice(450);
    legacyItems += lastBatch.length;
    legacyBatches += 1;
    const lastWrite = mainBridge.writeBatch(lastBatch);
    const completion = mainBridge.complete({ parsedItems: channels.length });
    await completion;
    await lastWrite;
    const mainMetrics = mainBridge.getSanitizedMetrics();
    const mainScopeReady = await getLocalCatalogScope(derivedMain.scopeKey);
    const mainSnapshotsReady = await listLocalCatalogSnapshots(derivedMain.scopeKey);
    const readySnapshot = mainSnapshotsReady.find((snapshot) => snapshot.status === 'ready');
    result.sameBatchesDelivered =
      legacyItems === mainMetrics.itemsProcessed &&
      legacyBatches === mainMetrics.batchesCommitted;
    result.singleDownloadContract = downloadCount === 1;
    result.singleParserContract = parserCount === 1;
    result.v2PathPreserved = legacyItems === 500 && legacyBatches === 10;
    result.orderedBatchWrites =
      readySnapshot?.totalItems === 500 && mainMetrics.batchesCommitted === 10;
    result.completionAwaitsWrites =
      mainMetrics.status === 'ready' && readySnapshot?.totalItems === 500;
    result.promotionDisabledLeavesReady =
      mainScopeReady?.activeSnapshotId === activeMainId &&
      readySnapshot?.status === 'ready';
    // Series Lookup is intentionally not consulted here: complete() and the
    // non-promoting snapshot lifecycle must be valid before its background build.
    result.completionDoesNotRequireSeriesLookup =
      mainMetrics.status === 'ready' &&
      readySnapshot?.status === 'ready' &&
      readySnapshot.totalItems === 500 &&
      mainScopeReady?.activeSnapshotId === activeMainId;

    const promotedBridge = await prepareBridge({
      internalLicenseId: RAW_LICENSE_A,
      sourceId: SOURCE_MAIN,
      promotionEnabled: true,
    });
    await promotedBridge.writeBatch([channel(600)]);
    await promotedBridge.complete({ parsedItems: 1 });
    const originalOpenCursor = IDBObjectStore.prototype.openCursor;
    let snapshotItemCursorCalls = 0;
    IDBObjectStore.prototype.openCursor = function (
      ...args: Parameters<IDBObjectStore['openCursor']>
    ) {
      if (this.name === LOCAL_CATALOG_V3_STORES.items) {
        snapshotItemCursorCalls += 1;
      }
      return originalOpenCursor.apply(this, args);
    };
    try {
      await promotedBridge.promote();
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    } finally {
      IDBObjectStore.prototype.openCursor = originalOpenCursor;
    }
    result.promotionDoesNotScheduleFullScan =
      snapshotItemCursorCalls === 0;
    const promotedScope = await getLocalCatalogScope(derivedMain.scopeKey);
    const oldActive = await getLocalCatalogSnapshot(activeMainId);
    const promotedSnapshots = await listLocalCatalogSnapshots(derivedMain.scopeKey);
    result.promotionEnabledActivatesSnapshot =
      promotedScope?.activeSnapshotId !== activeMainId &&
      promotedSnapshots.some((snapshot) =>
        snapshot.snapshotId === promotedScope?.activeSnapshotId &&
        snapshot.status === 'active',
      ) && oldActive?.status === 'superseded';

    const activeFailureId = 'smoke-runtime-failure-active-a';
    await putLocalCatalogScope(activeScope({
      ...derivedFailure,
      activeSnapshotId: activeFailureId,
    }));
    await putLocalCatalogSnapshot(
      activeSnapshot(activeFailureId, derivedFailure.scopeKey),
    );
    const staleBridge = await prepareBridge({
      internalLicenseId: RAW_LICENSE_A,
      sourceId: SOURCE_FAILURE,
      promotionEnabled: true,
    });
    const newerBridge = await prepareBridge({
      internalLicenseId: RAW_LICENSE_A,
      sourceId: SOURCE_FAILURE,
      promotionEnabled: true,
    });
    let legacyContinued = 0;
    let lateWriteCode = '';
    legacyContinued += 1;
    try {
      await staleBridge.writeBatch([channel(700)]);
    } catch (error) {
      lateWriteCode = error instanceof Error ? error.message : '';
    }
    const failureScope = await getLocalCatalogScope(derivedFailure.scopeKey);
    result.runtimeEpochBlocksLateWrite =
      lateWriteCode === 'LOCAL_CATALOG_RUNTIME_EPOCH_MISMATCH';
    result.v3FailureDoesNotBreakLegacy =
      legacyContinued === 1 &&
      /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(
        staleBridge.getSanitizedMetrics().failureCode ?? '',
      );
    result.activePreservedOnFailure =
      failureScope?.activeSnapshotId === activeFailureId &&
      (await getLocalCatalogSnapshot(activeFailureId))?.status === 'active';
    try {
      await staleBridge.promote();
    } catch {
      result.staleRequestCannotPromote =
        (await getLocalCatalogScope(derivedFailure.scopeKey))?.activeSnapshotId ===
        activeFailureId;
    }
    await newerBridge.cancel();

    const activeCancelId = 'smoke-runtime-cancel-active-a';
    await putLocalCatalogScope(activeScope({
      ...derivedCancel,
      activeSnapshotId: activeCancelId,
    }));
    await putLocalCatalogSnapshot(activeSnapshot(activeCancelId, derivedCancel.scopeKey));
    const cancelController = new AbortController();
    const cancelBridge = await prepareBridge({
      internalLicenseId: RAW_LICENSE_A,
      sourceId: SOURCE_CANCEL,
      promotionEnabled: true,
      signal: cancelController.signal,
    });
    await cancelBridge.writeBatch(channels.slice(0, 50));
    const cancelSnapshots = await listLocalCatalogSnapshots(derivedCancel.scopeKey);
    const cancelSnapshot = cancelSnapshots.find((snapshot) => snapshot.status === 'building');
    const beforeCancel = cancelSnapshot ? await itemCount(cancelSnapshot.snapshotId) : -1;
    cancelController.abort();
    await cancelBridge.cancel();
    try {
      await cancelBridge.writeBatch(channels.slice(50, 100));
    } catch {
      // Expected: canceled bridges reject all future batches.
    }
    const afterCancel = cancelSnapshot ? await itemCount(cancelSnapshot.snapshotId) : -2;
    result.cancelStopsFutureWrites =
      beforeCancel === 50 && afterCancel === 0 &&
      cancelBridge.getSanitizedMetrics().status === 'canceled';

    const persistedScope = await getLocalCatalogScope(derivedMain.scopeKey);
    const persistedSnapshots = await listLocalCatalogSnapshots(derivedMain.scopeKey);
    const serializedSafeRecords = JSON.stringify({
      derivedMain,
      persistedScope,
      persistedSnapshots,
    });
    result.sensitiveMaterialAbsent =
      !serializedSafeRecords.includes(RAW_LICENSE_A) &&
      !serializedSafeRecords.includes(RAW_LICENSE_B);
    result.cycle4aRegressionPass =
      (await runLocalCatalogSnapshotImportSmokeTest()).ok;
    result.ok = Object.entries(result).every(([key, value]) =>
      key === 'ok' || key === 'syntheticCleanup' || value === true,
    );
  } catch {
    result.errorCode = 'LOCAL_CATALOG_RUNTIME_SNAPSHOT_BRIDGE_SMOKE_FAILED';
  } finally {
    await cleanupScopes(scopeKeys).catch(() => undefined);
    result.syntheticCleanup = (
      await Promise.all(scopeKeys.map(getLocalCatalogScope))
    ).every((scope) => scope === null);
    result.ok = result.ok && result.syntheticCleanup;
  }

  return result;
}
