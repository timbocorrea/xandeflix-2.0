import {
  ensureLocalCatalogObjectStores,
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
} from './localCatalogDb.service';
import {
  buildLocalCatalogSeriesLookup,
  getLocalCatalogSeriesLookupStatus,
  listLocalCatalogSeriesLookupItems,
  LOCAL_CATALOG_SERIES_LOOKUP_INTER_BATCH_DELAY_MS,
} from './localCatalogSeriesLookup.service';
import { purgeLocalCatalogSnapshotPartialData } from './localCatalogSnapshotPurge.service';
import { loadLocalCatalogSeriesDetailReadModel } from '../readModels/localCatalogSeriesDetailReadModel.service';
import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import type {
  LocalCatalogScope,
  LocalCatalogSeriesLookupState,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';

const SCOPE_KEY = 'series-lookup-smoke-scope';
const SNAPSHOT_A = 'series-lookup-smoke-a';
const SNAPSHOT_B = 'series-lookup-smoke-b';
const LOOKUP_KEY = 'silo';
const LARGE_IRRELEVANT_COUNT = 10_000;
const TARGET_COUNT = 20;

export type LocalCatalogSeriesLookupSmokeTestResult = {
  ok: boolean;
  SERIES_LOOKUP_SCHEMA_01_V3_TO_V4_PRESERVES_EXISTING_DATA: boolean;
  SERIES_LOOKUP_SCHEMA_02_UPGRADE_NO_SNAPSHOT_SCAN: boolean;
  SERIES_LOOKUP_BUILD_01_CANONICAL_IDENTITY: boolean;
  SERIES_LOOKUP_BUILD_02_LARGE_BOUNDED: boolean;
  SERIES_LOOKUP_BUILD_03_RESUME: boolean;
  SERIES_LOOKUP_BUILD_04_IDEMPOTENT: boolean;
  SERIES_LOOKUP_BUILD_05_READY_ONLY_AFTER_COMPLETE: boolean;
  SERIES_LOOKUP_READ_01_INDEXED_QUERY: boolean;
  SERIES_LOOKUP_READ_02_SNAPSHOT_ISOLATION: boolean;
  SERIES_LOOKUP_PURGE_01: boolean;
  SERIES_LOOKUP_WEBVIEW_01_STATUS_COMPLETION: boolean;
  SERIES_LOOKUP_WEBVIEW_02_MISSING_STATUS_COMPLETION: boolean;
  SERIES_LOOKUP_WEBVIEW_03_BATCH_TRANSACTION_COMPLETION: boolean;
  SERIES_LOOKUP_WEBVIEW_04_BUILD_TO_READY: boolean;
  SERIES_LOOKUP_WEBVIEW_05_CONCURRENT_STATUS_READ: boolean;

  SERIES_LOOKUP_SCHEDULER_01_SAME_SNAPSHOT_DEDUPED: boolean;
  SERIES_LOOKUP_SCHEDULER_02_DIFFERENT_SNAPSHOTS_SERIALIZED: boolean;
  SERIES_LOOKUP_SCHEDULER_03_MAX_CONCURRENT_BUILDERS_ONE: boolean;
  SERIES_LOOKUP_SCHEDULER_04_FIFO_PROGRESS: boolean;
  SERIES_LOOKUP_SCHEDULER_05_FAILURE_RELEASES_NEXT_JOB: boolean;
  SERIES_LOOKUP_SCHEDULER_06_INTER_BATCH_COOPERATIVE_DELAY: boolean;
  SERIES_LOOKUP_SCHEDULER_07_RESUME_CHECKPOINT_PRESERVED: boolean;
  SERIES_LOOKUP_SCHEDULER_08_DETAIL_TRIGGER_REUSES_EXISTING_JOB: boolean;
  SERIES_LOOKUP_SCHEDULER_09_SUPERSEDED_ABANDONED: boolean;

  TOTAL_SCANNED: number;
  TOTAL_INDEXED: number;
  BATCH_COUNT: number;
  MAX_BATCH_SIZE: number;
  SERIES_LOOKUP_REMOTE_NETWORK_CALLS: number;
  BACKEND_CATALOG_QUERY: number;
  errorCode?: string;
};

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(new Error('SERIES_LOOKUP_SMOKE_TRANSACTION_FAILED'));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('SERIES_LOOKUP_SMOKE_REQUEST_FAILED'));
  });
}

function item(snapshotId: string, itemId: string, title: string, sourceOrder: number): LocalCatalogSnapshotItem {
  return {
    snapshotId, itemId, scopeKey: SCOPE_KEY,
    logicalIdentity: { version: 1, strategy: 'url_fallback', value: itemId },
    sourceItemId: itemId, contentKind: 'series', rawName: title,
    normalizedName: title.toLowerCase(), rawGroupTitle: 'Séries', normalizedGroup: 'series',
    streamUrl: `https://media.invalid/${itemId}`, artworkUrl: null, sourceOrder,
    classificationVersion: 1, createdAt: '2026-07-27T12:00:00.000Z', updatedAt: '2026-07-27T12:00:00.000Z',
  };
}

async function installFixture() {
  const timestamp = '2026-07-27T12:00:00.000Z';
  const scope: LocalCatalogScope = {
    scopeKey: SCOPE_KEY, tenantScopeId: 'series-lookup-smoke-tenant', sourceId: 'series-lookup-smoke-source',
    activeSnapshotId: SNAPSHOT_A, stagingSnapshotId: null, accessStatus: 'active', runtimeEpoch: 1,
    retentionPolicyVersion: 1, createdAt: timestamp, updatedAt: timestamp,
  };
  const snapshot = (snapshotId: string, status: LocalCatalogSnapshot['status'], totalItems: number): LocalCatalogSnapshot => ({
    snapshotId, scopeKey: SCOPE_KEY, status, sourceRevision: null, classificationVersion: 1,
    schemaVersion: 4, totalItems, createdAt: timestamp, updatedAt: timestamp, completedAt: timestamp, failureCode: null,
  });
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction([
      LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
      LOCAL_CATALOG_V3_STORES.items,
    ], 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).put(scope);
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).put(snapshot(SNAPSHOT_A, 'active', LARGE_IRRELEVANT_COUNT + TARGET_COUNT));
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).put(snapshot(SNAPSHOT_B, 'ready', 2));
    const store = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
    for (let index = 0; index < LARGE_IRRELEVANT_COUNT; index += 1) {
      store.put(item(SNAPSHOT_A, `other-${index}`, `Outra Série ${String(index).padStart(5, '0')} S01E01`, index));
    }
    for (let index = 0; index < TARGET_COUNT; index += 1) {
      store.put(item(SNAPSHOT_A, `silo-${index}`, `Silo S01E${String(index + 1).padStart(2, '0')}`, LARGE_IRRELEVANT_COUNT + index));
    }
    store.put(item(SNAPSHOT_B, 'silo-b-1', 'Silo S02E01', 0));
    store.put(item(SNAPSHOT_B, 'silo-b-2', 'Silo S02E02', 1));
    await done;
  } finally { db.close(); }
}

async function cleanupFixture() {
  await Promise.all([SNAPSHOT_A, SNAPSHOT_B].map((snapshotId) =>
    purgeLocalCatalogSnapshotPartialData({ snapshotId }).catch(() => undefined),
  ));
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction([
      LOCAL_CATALOG_V3_STORES.scopes,
      LOCAL_CATALOG_V3_STORES.snapshots,
    ], 'readwrite');
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).delete(SCOPE_KEY);
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).delete(SNAPSHOT_A);
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).delete(SNAPSHOT_B);
    await transactionDone(transaction);
  } finally { db.close(); }
}

async function countLookupRows(snapshotId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(LOCAL_CATALOG_V3_STORES.seriesLookup, 'readonly');
    const count = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.seriesLookup)
      .index('snapshotId').count(IDBKeyRange.only(snapshotId)));
    await transactionDone(transaction);
    return count;
  } finally { db.close(); }
}

function withCompletionTimeout<T>(promise: Promise<T>, milliseconds = 2_000) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => setTimeout(
      () => reject(new Error('SERIES_LOOKUP_SMOKE_COMPLETION_TIMEOUT')),
      milliseconds,
    )),
  ]);
}

async function putLookupState(state: LocalCatalogSeriesLookupState) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(LOCAL_CATALOG_V3_STORES.seriesLookupState, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.seriesLookupState).put(state);
    await done;
  } finally { db.close(); }
}

async function schemaUpgradeSmoke() {
  const name = `xandeflix-series-lookup-upgrade-${Date.now()}`;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(LOCAL_CATALOG_V3_STORES.items, { keyPath: ['snapshotId', 'itemId'] })
        .createIndex('snapshotId', 'snapshotId', { unique: false });
      db.createObjectStore(LOCAL_CATALOG_V3_STORES.snapshots, { keyPath: 'snapshotId' });
      db.createObjectStore(LOCAL_CATALOG_V3_STORES.searchDocuments, { keyPath: ['snapshotId', 'documentId'] });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  const legacyItem = item('legacy-v3-snapshot', 'legacy-item', 'Silo S01E01', 0);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 3);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction([LOCAL_CATALOG_V3_STORES.items, LOCAL_CATALOG_V3_STORES.snapshots, LOCAL_CATALOG_V3_STORES.searchDocuments], 'readwrite');
      tx.objectStore(LOCAL_CATALOG_V3_STORES.items).put(legacyItem);
      tx.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).put({ snapshotId: 'legacy-v3-snapshot' });
      tx.objectStore(LOCAL_CATALOG_V3_STORES.searchDocuments).put({ snapshotId: 'legacy-v3-snapshot', documentId: 'legacy-item' });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    }; request.onerror = () => reject(request.error);
  });
  let cursorCalls = 0;
  const originalOpenCursor = IDBObjectStore.prototype.openCursor;
  try {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 4);
      request.onupgradeneeded = () => {
        IDBObjectStore.prototype.openCursor = function (...args: Parameters<IDBObjectStore['openCursor']>) {
          cursorCalls += 1;
          return originalOpenCursor.apply(this, args);
        };
        ensureLocalCatalogObjectStores(request.result, request.transaction);
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction([LOCAL_CATALOG_V3_STORES.items, LOCAL_CATALOG_V3_STORES.snapshots], 'readonly');
        const itemRequest = tx.objectStore(LOCAL_CATALOG_V3_STORES.items).get(['legacy-v3-snapshot', 'legacy-item']);
        const snapshotRequest = tx.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).get('legacy-v3-snapshot');
        tx.oncomplete = () => {
          const preserved = Boolean(itemRequest.result) && Boolean(snapshotRequest.result) &&
            db.objectStoreNames.contains(LOCAL_CATALOG_V3_STORES.seriesLookup) &&
            db.objectStoreNames.contains(LOCAL_CATALOG_V3_STORES.seriesLookupState);
          db.close();
          preserved ? resolve() : reject(new Error('SERIES_LOOKUP_SCHEMA_DATA_LOST'));
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    return cursorCalls === 0;
  } finally {
    IDBObjectStore.prototype.openCursor = originalOpenCursor;
    await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = request.onerror = () => resolve(); });
  }
}

function emptyResult(): LocalCatalogSeriesLookupSmokeTestResult {
  return {
    ok: false, SERIES_LOOKUP_SCHEMA_01_V3_TO_V4_PRESERVES_EXISTING_DATA: false,
    SERIES_LOOKUP_SCHEMA_02_UPGRADE_NO_SNAPSHOT_SCAN: false,
    SERIES_LOOKUP_BUILD_01_CANONICAL_IDENTITY: false, SERIES_LOOKUP_BUILD_02_LARGE_BOUNDED: false,
    SERIES_LOOKUP_BUILD_03_RESUME: false, SERIES_LOOKUP_BUILD_04_IDEMPOTENT: false,
    SERIES_LOOKUP_BUILD_05_READY_ONLY_AFTER_COMPLETE: false, SERIES_LOOKUP_READ_01_INDEXED_QUERY: false,
    SERIES_LOOKUP_READ_02_SNAPSHOT_ISOLATION: false, SERIES_LOOKUP_PURGE_01: false,
    SERIES_LOOKUP_WEBVIEW_01_STATUS_COMPLETION: false,
    SERIES_LOOKUP_WEBVIEW_02_MISSING_STATUS_COMPLETION: false,
    SERIES_LOOKUP_WEBVIEW_03_BATCH_TRANSACTION_COMPLETION: false,
    SERIES_LOOKUP_WEBVIEW_04_BUILD_TO_READY: false,
    SERIES_LOOKUP_WEBVIEW_05_CONCURRENT_STATUS_READ: false,

    SERIES_LOOKUP_SCHEDULER_01_SAME_SNAPSHOT_DEDUPED: false,
    SERIES_LOOKUP_SCHEDULER_02_DIFFERENT_SNAPSHOTS_SERIALIZED: false,
    SERIES_LOOKUP_SCHEDULER_03_MAX_CONCURRENT_BUILDERS_ONE: false,
    SERIES_LOOKUP_SCHEDULER_04_FIFO_PROGRESS: false,
    SERIES_LOOKUP_SCHEDULER_05_FAILURE_RELEASES_NEXT_JOB: false,
    SERIES_LOOKUP_SCHEDULER_06_INTER_BATCH_COOPERATIVE_DELAY: false,
    SERIES_LOOKUP_SCHEDULER_07_RESUME_CHECKPOINT_PRESERVED: false,
    SERIES_LOOKUP_SCHEDULER_08_DETAIL_TRIGGER_REUSES_EXISTING_JOB: false,
    SERIES_LOOKUP_SCHEDULER_09_SUPERSEDED_ABANDONED: false,

    TOTAL_SCANNED: 0, TOTAL_INDEXED: 0, BATCH_COUNT: 0, MAX_BATCH_SIZE: 0,
    SERIES_LOOKUP_REMOTE_NETWORK_CALLS: 0, BACKEND_CATALOG_QUERY: 0,
  };
}


async function runSeriesLookupSchedulerSmoke() {
  await cleanupFixture();
  await installFixture();

  try {
    /*
     * 01 — duas solicitações do mesmo snapshot devem receber
     * exatamente a mesma Promise enquanto o job está pendente.
     *
     * 06 — dois batches devem observar a pausa cooperativa real.
     */
    const sameStartedAt = performance.now();

    const sameSnapshotBuildA =
      buildLocalCatalogSeriesLookup({
        snapshotId: SNAPSHOT_A,
        batchSize: 500,
        maxBatches: 2,
      });

    const sameSnapshotBuildB =
      buildLocalCatalogSeriesLookup({
        snapshotId: SNAPSHOT_A,
        batchSize: 500,
        maxBatches: 2,
      });

    const sameSnapshotDeduped =
      sameSnapshotBuildA === sameSnapshotBuildB;

    const firstPartial =
      await sameSnapshotBuildA;

    const sameElapsedMs =
      performance.now() - sameStartedAt;

    const cooperativeDelay =
      firstPartial.batchCount === 2 &&
      LOCAL_CATALOG_SERIES_LOOKUP_INTER_BATCH_DELAY_MS === 25 &&
      sameElapsedMs >=
        LOCAL_CATALOG_SERIES_LOOKUP_INTER_BATCH_DELAY_MS * 1.5;

    /*
     * 02/03/04 — A é deliberadamente mais longo que B.
     *
     * Com fila global:
     * A começa;
     * B ainda não possui state enquanto A executa;
     * A resolve antes de B.
     *
     * Sem serialização global, B poderia iniciar imediatamente.
     */
    const completionOrder: string[] = [];

    const buildA =
      buildLocalCatalogSeriesLookup({
        snapshotId: SNAPSHOT_A,
        batchSize: 500,
        maxBatches: 3,
      }).then((value) => {
        completionOrder.push('A');
        return value;
      });

    const buildB =
      buildLocalCatalogSeriesLookup({
        snapshotId: SNAPSHOT_B,
        batchSize: 1,
        maxBatches: 1,
      }).then((value) => {
        completionOrder.push('B');
        return value;
      });

    await new Promise<void>((resolve) =>
      setTimeout(resolve, 5),
    );

    const snapshotBDuringA =
      await withCompletionTimeout(
        getLocalCatalogSeriesLookupStatus(SNAPSHOT_B),
        1_000,
      );

    const [serializedA, serializedB] =
      await Promise.all([buildA, buildB]);

    const differentSnapshotsSerialized =
      snapshotBDuringA === null &&
      completionOrder.join(',') === 'A,B';

    const maxConcurrentBuildersOne =
      differentSnapshotsSerialized;

    const fifoProgress =
      completionOrder.join(',') === 'A,B' &&
      serializedA.status === 'building' &&
      serializedB.status === 'building';

    /*
     * 07 — A já havia processado 1.000 registros.
     * O job seguinte deve retomar do checkpoint e chegar a 2.500,
     * não reiniciar em zero.
     */
    const resumeCheckpointPreserved =
      firstPartial.processedCount === 1_000 &&
      serializedA.processedCount === 2_500;

    /*
     * 08 — simula exatamente o caminho de Detail:
     * um build de A já existe e o read model recebe not_ready.
     * O trigger ensureIndexedLookup deve reutilizar a mesma Promise.
     */
    const detailBasePromise =
      buildLocalCatalogSeriesLookup({
        snapshotId: SNAPSHOT_A,
        batchSize: 500,
        maxBatches: 10,
      });

    let detailTriggeredPromise:
      ReturnType<typeof buildLocalCatalogSeriesLookup> | null = null;

    const detailModel =
      await loadLocalCatalogSeriesDetailReadModel(
        {
          sourceId: 'series-lookup-smoke-source',
          scopeKey: SCOPE_KEY,
          seriesKey: LOOKUP_KEY,
        },
        localCatalogRepository,
        {
          ensureIndexedLookup: (input) => {
            detailTriggeredPromise =
              buildLocalCatalogSeriesLookup(input);

            return detailTriggeredPromise;
          },
        },
      );

    const detailTriggerReusesExistingJob =
      detailModel?.status === 'index_building' &&
      detailTriggeredPromise === detailBasePromise;

    await detailBasePromise;

    /*
     * 05 — provocar falha real no primeiro job da fila.
     *
     * A falha ocorre somente na primeira abertura de cursor do
     * catalogSnapshotItems. A chamada seguinte usa a implementação
     * original, permitindo verificar que B é liberado após a rejeição.
     */
    const originalOpenCursor =
      IDBObjectStore.prototype.openCursor;

    let failureInjected = false;
    let firstJobRejected = false;
    let nextJobRecovered = false;

    IDBObjectStore.prototype.openCursor =
      function (
        ...args: Parameters<IDBObjectStore['openCursor']>
      ) {
        if (
          !failureInjected &&
          this.name === LOCAL_CATALOG_V3_STORES.items
        ) {
          failureInjected = true;

          throw new Error(
            'SERIES_LOOKUP_SCHEDULER_INJECTED_FAILURE',
          );
        }

        return originalOpenCursor.apply(this, args);
      };

    try {
      const failingA =
        buildLocalCatalogSeriesLookup({
          snapshotId: SNAPSHOT_A,
          batchSize: 500,
          maxBatches: 1,
        });

      const queuedB =
        buildLocalCatalogSeriesLookup({
          snapshotId: SNAPSHOT_B,
        });

      try {
        await failingA;
      } catch {
        firstJobRejected = true;
      }

      const recoveredB =
        await withCompletionTimeout(
          queuedB,
          2_000,
        );

      nextJobRecovered =
        recoveredB.status === 'ready';
    } finally {
      IDBObjectStore.prototype.openCursor =
        originalOpenCursor;
    }

    const failureReleasesNextJob =
      failureInjected &&
      firstJobRejected &&
      nextJobRecovered;

    const db = await openLocalCatalogDb();
    try {
      const transaction = db.transaction(
        LOCAL_CATALOG_V3_STORES.snapshots,
        'readwrite',
      );
      const store = transaction.objectStore(
        LOCAL_CATALOG_V3_STORES.snapshots,
      );
      const snapshotB = await requestResult(
        store.get(SNAPSHOT_B),
      ) as LocalCatalogSnapshot;
      store.put({ ...snapshotB, status: 'superseded' });
      await transactionDone(transaction);
    } finally {
      db.close();
    }

    let supersededCursorCalls = 0;
    const originalSupersededOpenCursor =
      IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.openCursor =
      function (
        ...args: Parameters<IDBObjectStore['openCursor']>
      ) {
        if (this.name === LOCAL_CATALOG_V3_STORES.items) {
          supersededCursorCalls += 1;
        }
        return originalSupersededOpenCursor.apply(this, args);
      };
    let supersededResult:
      Awaited<ReturnType<typeof buildLocalCatalogSeriesLookup>> | null =
      null;
    try {
      supersededResult = await buildLocalCatalogSeriesLookup({
        snapshotId: SNAPSHOT_B,
      });
    } finally {
      IDBObjectStore.prototype.openCursor =
        originalSupersededOpenCursor;
    }
    const supersededAbandoned =
      supersededResult?.status === 'snapshot_unavailable' &&
      supersededCursorCalls === 0;

    return {
      SERIES_LOOKUP_SCHEDULER_01_SAME_SNAPSHOT_DEDUPED:
        sameSnapshotDeduped,

      SERIES_LOOKUP_SCHEDULER_02_DIFFERENT_SNAPSHOTS_SERIALIZED:
        differentSnapshotsSerialized,

      SERIES_LOOKUP_SCHEDULER_03_MAX_CONCURRENT_BUILDERS_ONE:
        maxConcurrentBuildersOne,

      SERIES_LOOKUP_SCHEDULER_04_FIFO_PROGRESS:
        fifoProgress,

      SERIES_LOOKUP_SCHEDULER_05_FAILURE_RELEASES_NEXT_JOB:
        failureReleasesNextJob,

      SERIES_LOOKUP_SCHEDULER_06_INTER_BATCH_COOPERATIVE_DELAY:
        cooperativeDelay,

      SERIES_LOOKUP_SCHEDULER_07_RESUME_CHECKPOINT_PRESERVED:
        resumeCheckpointPreserved,

      SERIES_LOOKUP_SCHEDULER_08_DETAIL_TRIGGER_REUSES_EXISTING_JOB:
        detailTriggerReusesExistingJob,

      SERIES_LOOKUP_SCHEDULER_09_SUPERSEDED_ABANDONED:
        supersededAbandoned,
    };
  } finally {
    await cleanupFixture().catch(() => undefined);
  }
}

export async function runLocalCatalogSeriesLookupSmokeTest(): Promise<LocalCatalogSeriesLookupSmokeTestResult> {
  const result = emptyResult();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  try {
    const scheduler =
      await runSeriesLookupSchedulerSmoke();

    Object.assign(result, scheduler);

    const noUpgradeScan = await schemaUpgradeSmoke();
    result.SERIES_LOOKUP_SCHEMA_01_V3_TO_V4_PRESERVES_EXISTING_DATA = noUpgradeScan;
    result.SERIES_LOOKUP_SCHEMA_02_UPGRADE_NO_SNAPSHOT_SCAN = noUpgradeScan;
    await cleanupFixture();
    await installFixture();
    const timestamp = '2026-07-27T12:00:00.000Z';
    result.SERIES_LOOKUP_WEBVIEW_02_MISSING_STATUS_COMPLETION =
      (await withCompletionTimeout(getLocalCatalogSeriesLookupStatus(SNAPSHOT_A))) === null;
    await putLookupState({
      snapshotId: SNAPSHOT_A, status: 'building', lookupVersion: 1,
      processedCount: 0, indexedCount: 0, checkpoint: null,
      createdAt: timestamp, updatedAt: timestamp,
    });
    const buildingStatus = await withCompletionTimeout(
      getLocalCatalogSeriesLookupStatus(SNAPSHOT_A),
    );
    result.SERIES_LOOKUP_WEBVIEW_01_STATUS_COMPLETION =
      buildingStatus?.status === 'building';
    globalThis.fetch = (() => { fetchCalls += 1; return Promise.reject(new Error('SERIES_LOOKUP_NETWORK_BLOCKED')); }) as typeof fetch;
    const interrupted = await buildLocalCatalogSeriesLookup({ snapshotId: SNAPSHOT_A, maxBatches: 3 });
    const partial = await listLocalCatalogSeriesLookupItems({ snapshotId: SNAPSHOT_A, seriesKey: LOOKUP_KEY });
    result.SERIES_LOOKUP_BUILD_05_READY_ONLY_AFTER_COMPLETE =
      interrupted.status === 'building' && partial.status === 'not_ready';
    const completed = await buildLocalCatalogSeriesLookup({ snapshotId: SNAPSHOT_A });
    result.TOTAL_SCANNED = completed.processedCount;
    result.TOTAL_INDEXED = completed.indexedCount;
    result.BATCH_COUNT = completed.batchCount + interrupted.batchCount;
    result.MAX_BATCH_SIZE = Math.max(completed.maxBatchSize, interrupted.maxBatchSize);
    const lookupA = await listLocalCatalogSeriesLookupItems({ snapshotId: SNAPSHOT_A, seriesKey: LOOKUP_KEY });
    result.SERIES_LOOKUP_BUILD_01_CANONICAL_IDENTITY = lookupA.status === 'ready' && lookupA.items.length === TARGET_COUNT && lookupA.items.every((next) => next.itemId.startsWith('silo-'));
    result.SERIES_LOOKUP_BUILD_02_LARGE_BOUNDED = completed.processedCount === LARGE_IRRELEVANT_COUNT + TARGET_COUNT && completed.maxBatchSize <= 500;
    result.SERIES_LOOKUP_BUILD_03_RESUME = interrupted.processedCount === 1_500 && completed.status === 'ready' && lookupA.items.length === TARGET_COUNT;
    result.SERIES_LOOKUP_WEBVIEW_03_BATCH_TRANSACTION_COMPLETION =
      completed.status === 'ready' && completed.batchCount > 1;
    result.SERIES_LOOKUP_WEBVIEW_04_BUILD_TO_READY =
      completed.processedCount > 0 && completed.indexedCount > 0 &&
      (await withCompletionTimeout(getLocalCatalogSeriesLookupStatus(SNAPSHOT_A)))?.status === 'ready';
    const rowsBeforeIdempotent = await countLookupRows(SNAPSHOT_A);
    const idempotent = await buildLocalCatalogSeriesLookup({ snapshotId: SNAPSHOT_A });
    result.SERIES_LOOKUP_BUILD_04_IDEMPOTENT = idempotent.batchCount === 0 && rowsBeforeIdempotent === await countLookupRows(SNAPSHOT_A);
    const buildBPromise = buildLocalCatalogSeriesLookup({ snapshotId: SNAPSHOT_B });
    const concurrentStatuses = await withCompletionTimeout(Promise.all(
      Array.from({ length: 5 }, () => getLocalCatalogSeriesLookupStatus(SNAPSHOT_B)),
    ));
    const buildB = await buildBPromise;
    result.SERIES_LOOKUP_WEBVIEW_05_CONCURRENT_STATUS_READ =
      concurrentStatuses.every((state) => state === null || state.status === 'building' || state.status === 'ready');
    const lookupB = await listLocalCatalogSeriesLookupItems({ snapshotId: SNAPSHOT_B, seriesKey: LOOKUP_KEY });
    result.SERIES_LOOKUP_READ_02_SNAPSHOT_ISOLATION = buildB.status === 'ready' && lookupA.items.length === TARGET_COUNT && lookupB.items.length === 2 && lookupB.items.every((next) => next.snapshotId === SNAPSHOT_B);
    let itemStoreCursorCalls = 0;
    const originalOpenCursor = IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.openCursor = function (...args: Parameters<IDBObjectStore['openCursor']>) {
      if (this.name === LOCAL_CATALOG_V3_STORES.items) itemStoreCursorCalls += 1;
      return originalOpenCursor.apply(this, args);
    };
    try { await listLocalCatalogSeriesLookupItems({ snapshotId: SNAPSHOT_A, seriesKey: LOOKUP_KEY }); }
    finally { IDBObjectStore.prototype.openCursor = originalOpenCursor; }
    result.SERIES_LOOKUP_READ_01_INDEXED_QUERY = itemStoreCursorCalls === 0;
    await purgeLocalCatalogSnapshotPartialData({ snapshotId: SNAPSHOT_B });
    result.SERIES_LOOKUP_PURGE_01 =
      await countLookupRows(SNAPSHOT_B) === 0 &&
      await getLocalCatalogSeriesLookupStatus(SNAPSHOT_B) === null;
    result.SERIES_LOOKUP_REMOTE_NETWORK_CALLS = fetchCalls;
    result.ok = Object.entries(result).filter(([key]) => ![
      'ok', 'TOTAL_SCANNED', 'TOTAL_INDEXED', 'BATCH_COUNT', 'MAX_BATCH_SIZE',
      'SERIES_LOOKUP_REMOTE_NETWORK_CALLS', 'BACKEND_CATALOG_QUERY',
    ].includes(key)).every(([, value]) => value === true) && fetchCalls === 0;
  } catch {
    result.errorCode = 'SERIES_LOOKUP_SMOKE_FAILED';
  } finally {
    globalThis.fetch = originalFetch;
    await cleanupFixture().catch(() => undefined);
  }
  return result;
}
