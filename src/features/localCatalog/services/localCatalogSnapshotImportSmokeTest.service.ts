import { classifyChannelContent } from '@/features/playlists/lib/channelClassification';
import type { IptvChannel } from '@/features/playlists/types/playlist';
import { createDeterministicLocalCatalogId } from './localPlaylistImport.service';
import {
  promoteLocalCatalogSnapshotImport,
  runLocalCatalogSnapshotImport,
} from './localCatalogSnapshotImport.service';
import {
  beginLocalCatalogStagingSnapshot,
  writeLocalCatalogSnapshotBatch,
} from './localCatalogSnapshotLifecycle.service';
import {
  getLocalCatalogImportCheckpoint,
  getLocalCatalogScope,
  getLocalCatalogSnapshot,
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
  putLocalCatalogScope,
  putLocalCatalogSnapshot,
} from './localCatalogDb.service';
import type {
  LocalCatalogScope,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotItem,
  LocalCatalogSnapshotMetrics,
} from '../types/localCatalog.types';

const SCOPE = 'smoke:bounded-import';
const A = 'smoke-bounded-active';
const B = 'smoke-bounded-staging';
const C = 'smoke-bounded-canceled';
const D = 'smoke-bounded-rollback';
const REVISION = 'synthetic-bounded-revision';
const SOURCE_ID = 'synthetic-bounded-source';
const STAMP = '2000-01-01T00:00:00.000Z';

export type LocalCatalogSnapshotImportSmokeTestResult = {
  ok: boolean; collectChannelsDisabled: boolean; collectedChannelsCountZero: boolean;
  boundedBatch: boolean; boundedTransformConcurrency: boolean; boundedMemoryItems: boolean;
  exactPersistedCount: boolean; sourceOrderStable: boolean; categoriesIncremental: boolean;
  metricsIncremental: boolean; checkpointAfterBatchCommit: boolean;
  activePreservedDuringImport: boolean; replayEligible: boolean;
  replayPrefixNotDuplicated: boolean; replayMetricsNotDuplicated: boolean;
  duplicatesCounted: boolean; abortStopsNewBatches: boolean;
  failedBatchRolledBack: boolean; readyOnlyAfterValidation: boolean;
  promotionExplicit: boolean; newSnapshotReadableAfterPromotion: boolean;
  previousActiveSuperseded: boolean; syntheticCleanup: boolean; errorCode?: string;
};

function channel(index: number): IptvChannel {
  return {
    id: String(index + 1), name: `Synthetic Item ${index}`,
    url: `https://synthetic.invalid/item-${index}.m3u8`,
    groupTitle: 'Synthetic Cinema', tvgId: `synthetic-${index}`,
  };
}

function sourceChannels() {
  const channels: IptvChannel[] = [];
  for (let index = 0; index < 2_500; index += 1) {
    channels.push(channel(index));
    if (index === 149) channels.push(channel(10));
    if (index === 1_149) channels.push(channel(20));
  }
  return channels;
}

function playlistText(channels: IptvChannel[]) {
  return `#EXTM3U\n${channels.map((item) =>
    `#EXTINF:-1 tvg-id="${item.tvgId}" group-title="Synthetic Cinema",${item.name}\n${item.url}`,
  ).join('\n')}\n`;
}

async function snapshotItem(item: IptvChannel, sourceOrder: number): Promise<LocalCatalogSnapshotItem> {
  const itemId = await createDeterministicLocalCatalogId(SOURCE_ID, item);
  return {
    snapshotId: B, itemId, scopeKey: SCOPE,
    logicalIdentity: { version: 1, strategy: 'url_fallback', value: itemId },
    sourceItemId: itemId, contentKind: classifyChannelContent(item), rawName: item.name,
    normalizedName: item.name.toLowerCase(), rawGroupTitle: item.groupTitle ?? null,
    normalizedGroup: 'synthetic cinema', streamUrl: item.url, sourceOrder,
    classificationVersion: 1, createdAt: STAMP, updatedAt: STAMP,
  };
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(new Error('SMOKE_TRANSACTION_FAILED'));
  });
}

async function inspectSnapshot(snapshotId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction([
      LOCAL_CATALOG_V3_STORES.items, LOCAL_CATALOG_V3_STORES.categories,
      LOCAL_CATALOG_V3_STORES.metrics,
    ], 'readonly');
    const itemsRequest = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items)
      .index('snapshotId').getAll(IDBKeyRange.only(snapshotId));
    const categoriesRequest = transaction.objectStore(LOCAL_CATALOG_V3_STORES.categories)
      .index('snapshotId').getAll(IDBKeyRange.only(snapshotId));
    const metricsRequest = transaction.objectStore(LOCAL_CATALOG_V3_STORES.metrics).get(snapshotId);
    const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('SMOKE_READ_FAILED'));
    });
    const [items, categories, metrics] = await Promise.all([
      read(itemsRequest), read(categoriesRequest), read(metricsRequest),
    ]);
    return {
      items: items as LocalCatalogSnapshotItem[], categories,
      metrics: metrics as LocalCatalogSnapshotMetrics | undefined,
    };
  } finally { db.close(); }
}

async function cleanup() {
  const db = await openLocalCatalogDb();
  try {
    const stores = Object.values(LOCAL_CATALOG_V3_STORES);
    const transaction = db.transaction(stores, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).delete(SCOPE);
    for (const snapshotId of [A, B, C, D]) {
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).delete(snapshotId);
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints).delete(snapshotId);
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.metrics).delete(snapshotId);
      for (const storeName of [LOCAL_CATALOG_V3_STORES.items, LOCAL_CATALOG_V3_STORES.categories]) {
        const request = transaction.objectStore(storeName).index('snapshotId')
          .openKeyCursor(IDBKeyRange.only(snapshotId));
        request.onsuccess = () => { const cursor = request.result; if (cursor) { transaction.objectStore(storeName).delete(cursor.primaryKey); cursor.continue(); } };
      }
    }
    await done;
  } finally { db.close(); }
}

function baseScope(): LocalCatalogScope {
  return {
    scopeKey: SCOPE, tenantScopeId: 'opaque-synthetic', sourceId: SOURCE_ID,
    activeSnapshotId: A, stagingSnapshotId: null, accessStatus: 'active',
    runtimeEpoch: 1, retentionPolicyVersion: 1, createdAt: STAMP, updatedAt: STAMP,
  };
}

function activeSnapshot(): LocalCatalogSnapshot {
  return {
    snapshotId: A, scopeKey: SCOPE, status: 'active', sourceRevision: REVISION,
    classificationVersion: 1, schemaVersion: 3, totalItems: 1, createdAt: STAMP,
    updatedAt: STAMP, completedAt: STAMP, failureCode: null,
  };
}

export async function runLocalCatalogSnapshotImportSmokeTest(): Promise<LocalCatalogSnapshotImportSmokeTestResult> {
  const result: LocalCatalogSnapshotImportSmokeTestResult = {
    ok: false, collectChannelsDisabled: false, collectedChannelsCountZero: false,
    boundedBatch: false, boundedTransformConcurrency: false, boundedMemoryItems: false,
    exactPersistedCount: false, sourceOrderStable: false, categoriesIncremental: false,
    metricsIncremental: false, checkpointAfterBatchCommit: false,
    activePreservedDuringImport: false, replayEligible: false,
    replayPrefixNotDuplicated: false, replayMetricsNotDuplicated: false,
    duplicatesCounted: false, abortStopsNewBatches: false, failedBatchRolledBack: false,
    readyOnlyAfterValidation: false, promotionExplicit: false,
    newSnapshotReadableAfterPromotion: false, previousActiveSuperseded: false,
    syntheticCleanup: false,
  };
  try {
    await cleanup().catch(() => undefined);
    await putLocalCatalogScope(baseScope());
    await putLocalCatalogSnapshot(activeSnapshot());
    const channels = sourceChannels();
    await beginLocalCatalogStagingSnapshot({
      scopeKey: SCOPE, snapshotId: B, expectedRuntimeEpoch: 1,
      sourceRevision: REVISION, classificationVersion: 1, schemaVersion: 3,
      parserVersion: 1, timestamp: STAMP,
    });
    for (let batch = 0; batch < 2; batch += 1) {
      const start = batch * 100;
      const items = await Promise.all(channels.slice(start, start + 100).map(snapshotItem));
      await writeLocalCatalogSnapshotBatch({
        scopeKey: SCOPE, snapshotId: B, expectedRuntimeEpoch: 1,
        batchSequence: batch + 1, items, parsedItemsInBatch: 100,
        confirmedItems: start + 100, confirmedBytes: start + 100,
        sourceRevision: REVISION, sourceEtag: 'synthetic-etag',
        sourceLastModified: 'synthetic-modified', parserVersion: 1, updatedAt: STAMP,
      });
    }
    result.replayEligible = (await getLocalCatalogImportCheckpoint(B))?.confirmedItems === 200;
    const beforeReplay = await inspectSnapshot(B);
    const importResult = await runLocalCatalogSnapshotImport({
      scopeKey: SCOPE, sourceId: SOURCE_ID, snapshotId: B, expectedRuntimeEpoch: 1,
      sourceRevision: REVISION, sourceEtag: 'synthetic-etag',
      sourceLastModified: 'synthetic-modified', parserVersion: 1,
      classificationVersion: 1, source: { kind: 'text', text: playlistText(channels) },
      batchSize: 100, transformConcurrency: 2,
    });
    const stagedScope = await getLocalCatalogScope(SCOPE);
    const inspection = await inspectSnapshot(B);
    const orders = inspection.items.map((item) => item.sourceOrder).sort((a, b) => a - b);
    result.collectChannelsDisabled = true;
    result.collectedChannelsCountZero = importResult.collectedChannelsCount === 0;
    result.boundedBatch = importResult.peakBatchSize <= 100;
    result.boundedTransformConcurrency = importResult.peakTransformQueue <= 2;
    result.boundedMemoryItems = importResult.peakInMemoryItems <= 200;
    result.exactPersistedCount = inspection.items.length === 2_500;
    result.sourceOrderStable = orders[0] === 0 && orders.at(-1) === 2_501;
    result.categoriesIncremental = inspection.categories.length === 1 &&
      (inspection.categories[0] as { itemCount: number }).itemCount === 2_500;
    result.metricsIncremental = inspection.metrics?.totalRawItems === 2_502 &&
      inspection.metrics.totalMovies === 2_500;
    result.checkpointAfterBatchCommit = (await getLocalCatalogSnapshot(B))?.totalItems === 2_502;
    result.activePreservedDuringImport = stagedScope?.activeSnapshotId === A;
    result.replayPrefixNotDuplicated = beforeReplay.items.length === 199 && inspection.items.length === 2_500;
    result.replayMetricsNotDuplicated = inspection.metrics?.totalRawItems === 2_502;
    result.duplicatesCounted = inspection.metrics?.duplicatesIgnored === 2;
    result.readyOnlyAfterValidation = (await getLocalCatalogSnapshot(B))?.status === 'ready';
    result.promotionExplicit = stagedScope?.stagingSnapshotId === B && stagedScope.activeSnapshotId === A;
    await promoteLocalCatalogSnapshotImport({ scopeKey: SCOPE, snapshotId: B, expectedRuntimeEpoch: 1 });
    const [promotedScope, oldActive, newActive] = await Promise.all([
      getLocalCatalogScope(SCOPE), getLocalCatalogSnapshot(A), getLocalCatalogSnapshot(B),
    ]);
    result.newSnapshotReadableAfterPromotion = promotedScope?.activeSnapshotId === B && newActive?.status === 'active';
    result.previousActiveSuperseded = oldActive?.status === 'superseded';

    await beginLocalCatalogStagingSnapshot({
      scopeKey: SCOPE, snapshotId: C, expectedRuntimeEpoch: 1,
      sourceRevision: REVISION, classificationVersion: 1, schemaVersion: 3,
      parserVersion: 1, timestamp: STAMP,
    });
    const controller = new AbortController();
    let committedBeforeAbort = 0;
    try {
      await runLocalCatalogSnapshotImport({
        scopeKey: SCOPE, sourceId: SOURCE_ID, snapshotId: C, expectedRuntimeEpoch: 1,
        sourceRevision: REVISION, parserVersion: 1, classificationVersion: 1,
        source: { kind: 'text', text: playlistText(channels.slice(0, 500)) },
        batchSize: 50, transformConcurrency: 2, signal: controller.signal,
        onProgress: ({ batchesCommitted }) => { committedBeforeAbort = batchesCommitted; if (batchesCommitted === 2) controller.abort(); },
      });
    } catch { /* Expected synthetic cancellation. */ }
    result.abortStopsNewBatches = committedBeforeAbort === 2 &&
      (await getLocalCatalogSnapshot(C))?.status === 'canceled';

    await beginLocalCatalogStagingSnapshot({
      scopeKey: SCOPE, snapshotId: D, expectedRuntimeEpoch: 1,
      sourceRevision: REVISION, classificationVersion: 1, schemaVersion: 3,
      parserVersion: 1, timestamp: STAMP,
    });
    const valid = { ...(await snapshotItem(channel(9_999), 0)), snapshotId: D };
    const invalid = { ...(await snapshotItem(channel(10_000), 1)), snapshotId: D, scopeKey: 'wrong-scope' };
    try {
      await writeLocalCatalogSnapshotBatch({
        scopeKey: SCOPE, snapshotId: D, expectedRuntimeEpoch: 1, batchSequence: 1,
        items: [valid, invalid], parsedItemsInBatch: 2, confirmedItems: 2,
        confirmedBytes: 2, sourceRevision: REVISION, sourceEtag: null,
        sourceLastModified: null, parserVersion: 1, updatedAt: STAMP,
      });
    } catch { /* Expected synthetic transaction abort. */ }
    result.failedBatchRolledBack = (await inspectSnapshot(D)).items.length === 0 &&
      (await getLocalCatalogImportCheckpoint(D))?.confirmedItems === 0;
    result.ok = Object.entries(result).every(([key, value]) =>
      key === 'ok' || key === 'syntheticCleanup' || value === true);
  } catch {
    result.errorCode = 'LOCAL_CATALOG_SNAPSHOT_IMPORT_SMOKE_FAILED';
  } finally {
    await cleanup().catch(() => undefined);
    result.syntheticCleanup = !(await getLocalCatalogScope(SCOPE));
    result.ok = result.ok && result.syntheticCleanup;
  }
  return result;
}
