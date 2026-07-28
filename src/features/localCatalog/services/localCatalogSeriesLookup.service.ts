import {
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
} from './localCatalogDb.service';
import { getSeriesCollectionKey } from './localCatalogSeriesIdentity.service';
import type {
  LocalCatalogSeriesLookupRecord,
  LocalCatalogSeriesLookupState,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';

export const LOCAL_CATALOG_SERIES_LOOKUP_VERSION = 1;
export const LOCAL_CATALOG_SERIES_LOOKUP_BATCH_SIZE = 500;
export const LOCAL_CATALOG_SERIES_LOOKUP_INTER_BATCH_DELAY_MS = 25;

const pendingBuilds = new Map<string, Promise<LocalCatalogSeriesLookupBuildResult>>();

let globalBuildTail: Promise<void> = Promise.resolve();

type LookupStatus = 'not_ready' | 'ready' | 'snapshot_unavailable';

export type LocalCatalogSeriesLookupBuildResult = {
  snapshotId: string;
  status: 'ready' | 'building' | 'snapshot_unavailable';
  processedCount: number;
  indexedCount: number;
  batchCount: number;
  maxBatchSize: number;
};

export type LocalCatalogSeriesLookupReadResult = {
  status: LookupStatus;
  items: LocalCatalogSnapshotItem[];
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('LOCAL_CATALOG_SERIES_LOOKUP_REQUEST_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error('LOCAL_CATALOG_SERIES_LOOKUP_TRANSACTION_FAILED'));
  });
}

function now() { return new Date().toISOString(); }

function validSnapshot(snapshot: LocalCatalogSnapshot | undefined) {
  return snapshot?.status === 'active' || snapshot?.status === 'ready';
}

export function createLocalCatalogSeriesLookupRecord(item: LocalCatalogSnapshotItem) {
  if (item.contentKind !== 'series' && item.contentKind !== 'series_episode') {
    return null;
  }

  const seriesKey = getSeriesCollectionKey({
    id: item.itemId,
    name: item.rawName,
    rawName: item.rawName,
    groupTitle: item.rawGroupTitle,
  }).trim();

  if (!seriesKey) return null;

  return {
    snapshotId: item.snapshotId,
    seriesKey,
    itemId: item.itemId,
    contentKind: item.contentKind,
  } satisfies LocalCatalogSeriesLookupRecord;
}

async function readSnapshotBatch(
  db: IDBDatabase,
  snapshotId: string,
  checkpoint: string | null,
  limit: number,
) {
  const transaction = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readonly');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
  const range = checkpoint
    ? IDBKeyRange.bound([snapshotId, checkpoint], [snapshotId, []], true, false)
    : IDBKeyRange.bound([snapshotId], [snapshotId, []]);
  const items = await new Promise<LocalCatalogSnapshotItem[]>((resolve, reject) => {
    const batch: LocalCatalogSnapshotItem[] = [];
    const request = store.openCursor(range);
    request.onerror = () => reject(new Error('LOCAL_CATALOG_SERIES_LOOKUP_READ_FAILED'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || batch.length >= limit) {
        resolve(batch);
        return;
      }
      batch.push(cursor.value as LocalCatalogSnapshotItem);
      cursor.continue();
    };
  });
  await done;
  return items;
}

async function getOrStartState(db: IDBDatabase, snapshotId: string) {
  const transaction = db.transaction([
    LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.seriesLookupState,
    LOCAL_CATALOG_V3_STORES.seriesLookup,
  ], 'readwrite');
  const done = transactionDone(transaction);
  const snapshot = await requestResult(
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).get(snapshotId),
  ) as LocalCatalogSnapshot | undefined;
  if (!validSnapshot(snapshot)) {
    transaction.abort();
    await done.catch(() => undefined);
    return null;
  }
  const stateStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.seriesLookupState);
  const existing = await requestResult(stateStore.get(snapshotId)) as
    LocalCatalogSeriesLookupState | undefined;
  if (existing?.status === 'ready' && existing.lookupVersion === LOCAL_CATALOG_SERIES_LOOKUP_VERSION) {
    await done;
    return existing;
  }
  const timestamp = now();
  if (existing && existing.lookupVersion !== LOCAL_CATALOG_SERIES_LOOKUP_VERSION) {
    const lookupStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.seriesLookup);
    const request = lookupStore.index('snapshotId').openKeyCursor(IDBKeyRange.only(snapshotId));
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(new Error('LOCAL_CATALOG_SERIES_LOOKUP_RESET_FAILED'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        lookupStore.delete(cursor.primaryKey);
        cursor.continue();
      };
    });
  }
  const state: LocalCatalogSeriesLookupState = existing?.lookupVersion === LOCAL_CATALOG_SERIES_LOOKUP_VERSION
    ? { ...existing, status: 'building', updatedAt: timestamp }
    : {
        snapshotId,
        status: 'building',
        lookupVersion: LOCAL_CATALOG_SERIES_LOOKUP_VERSION,
        processedCount: 0,
        indexedCount: 0,
        checkpoint: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
  stateStore.put(state);
  await done;
  return state;
}

async function commitBatch(
  db: IDBDatabase,
  snapshotId: string,
  previous: LocalCatalogSeriesLookupState,
  batch: LocalCatalogSnapshotItem[],
  records: LocalCatalogSeriesLookupRecord[],
) {
  const transaction = db.transaction([
    LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.seriesLookup,
    LOCAL_CATALOG_V3_STORES.seriesLookupState,
  ], 'readwrite');
  const done = transactionDone(transaction);
  const snapshot = await requestResult(
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).get(snapshotId),
  ) as LocalCatalogSnapshot | undefined;
  if (!validSnapshot(snapshot)) throw new Error('LOCAL_CATALOG_SERIES_LOOKUP_SNAPSHOT_UNAVAILABLE');
  const lookupStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.seriesLookup);
  records.forEach((record) => lookupStore.put(record));
  const next: LocalCatalogSeriesLookupState = {
    ...previous,
    status: 'building',
    processedCount: previous.processedCount + batch.length,
    indexedCount: previous.indexedCount + records.length,
    checkpoint: batch[batch.length - 1]?.itemId ?? previous.checkpoint,
    updatedAt: now(),
  };
  transaction.objectStore(LOCAL_CATALOG_V3_STORES.seriesLookupState).put(next);
  await done;
  return next;
}

async function markReady(
  db: IDBDatabase,
  snapshotId: string,
  state: LocalCatalogSeriesLookupState,
) {
  const transaction = db.transaction([
    LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.seriesLookupState,
  ], 'readwrite');
  const done = transactionDone(transaction);
  const snapshot = await requestResult(
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).get(snapshotId),
  ) as LocalCatalogSnapshot | undefined;
  if (!validSnapshot(snapshot)) throw new Error('LOCAL_CATALOG_SERIES_LOOKUP_SNAPSHOT_UNAVAILABLE');
  const ready = { ...state, status: 'ready' as const, checkpoint: null, updatedAt: now() };
  transaction.objectStore(LOCAL_CATALOG_V3_STORES.seriesLookupState).put(ready);
  await done;
  return ready;
}

function enqueueSeriesLookupBuild<T>(
  task: () => Promise<T>,
): Promise<T> {
  const run = globalBuildTail.then(task);

  globalBuildTail = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

function yieldSeriesLookupBuild() {
  return new Promise<void>((resolve) =>
    setTimeout(
      resolve,
      LOCAL_CATALOG_SERIES_LOOKUP_INTER_BATCH_DELAY_MS,
    ),
  );
}

export async function getLocalCatalogSeriesLookupStatus(snapshotId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(LOCAL_CATALOG_V3_STORES.seriesLookupState, 'readonly');
    const done = transactionDone(transaction);
    const value = await requestResult(
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.seriesLookupState).get(snapshotId),
    ) as LocalCatalogSeriesLookupState | undefined;
    await done;
    return value ?? null;
  } finally { db.close(); }
}

async function buildLocalCatalogSeriesLookupInternal(input: {
  snapshotId: string;
  batchSize?: number;
  maxBatches?: number;
}): Promise<LocalCatalogSeriesLookupBuildResult> {
  const snapshotId = input.snapshotId.trim();
  const batchSize = Math.max(1, Math.min(input.batchSize ?? LOCAL_CATALOG_SERIES_LOOKUP_BATCH_SIZE, 500));
  const db = await openLocalCatalogDb();
  try {
    const initial = await getOrStartState(db, snapshotId);
    if (!initial) return { snapshotId, status: 'snapshot_unavailable', processedCount: 0, indexedCount: 0, batchCount: 0, maxBatchSize: 0 };
    if (initial.status === 'ready') return { snapshotId, status: 'ready', processedCount: initial.processedCount, indexedCount: initial.indexedCount, batchCount: 0, maxBatchSize: 0 };

    let state = initial;
    let batchCount = 0;
    let maxBatchSize = 0;
    for (;;) {
      if (input.maxBatches !== undefined && batchCount >= input.maxBatches) {
        return { snapshotId, status: 'building', processedCount: state.processedCount, indexedCount: state.indexedCount, batchCount, maxBatchSize };
      }
      const batch = await readSnapshotBatch(db, snapshotId, state.checkpoint, batchSize);
      if (batch.length === 0) {
        state = await markReady(db, snapshotId, state);
        console.info('[XANDEFLIX_SERIES_LOOKUP_BUILD]', { status: 'ready', processedCount: state.processedCount, indexedCount: state.indexedCount, batchCount });
        return { snapshotId, status: 'ready', processedCount: state.processedCount, indexedCount: state.indexedCount, batchCount, maxBatchSize };
      }
      const records = batch.map(createLocalCatalogSeriesLookupRecord).filter((record): record is LocalCatalogSeriesLookupRecord => record !== null);
      state = await commitBatch(db, snapshotId, state, batch, records);
      batchCount += 1;
      maxBatchSize = Math.max(maxBatchSize, batch.length);
      await yieldSeriesLookupBuild();
    }
  } finally {
    db.close();
  }
}

export function buildLocalCatalogSeriesLookup(input: {
  snapshotId: string;
  batchSize?: number;
  maxBatches?: number;
}): Promise<LocalCatalogSeriesLookupBuildResult> {
  const snapshotId = input.snapshotId.trim();
  const existing = pendingBuilds.get(snapshotId);
  if (existing) return existing;
  const next = enqueueSeriesLookupBuild(() =>
    buildLocalCatalogSeriesLookupInternal({
      ...input,
      snapshotId,
    }),
  ).finally(() => {
      if (pendingBuilds.get(snapshotId) === next) pendingBuilds.delete(snapshotId);
    });
  pendingBuilds.set(snapshotId, next);
  return next;
}

export async function listLocalCatalogSeriesLookupItems(input: {
  snapshotId: string;
  seriesKey: string;
}): Promise<LocalCatalogSeriesLookupReadResult> {
  const snapshotId = input.snapshotId.trim();
  const seriesKey = input.seriesKey.trim().toLowerCase();
  const state = await getLocalCatalogSeriesLookupStatus(snapshotId);
  if (!state || state.status !== 'ready' || state.lookupVersion !== LOCAL_CATALOG_SERIES_LOOKUP_VERSION) {
    return { status: 'not_ready', items: [] };
  }
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction([
      LOCAL_CATALOG_V3_STORES.seriesLookup,
      LOCAL_CATALOG_V3_STORES.items,
    ], 'readonly');
    const done = transactionDone(transaction);
    const lookupStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.seriesLookup);
    const records = await requestResult(
      lookupStore.index('snapshotIdSeriesKey').getAll(IDBKeyRange.only([snapshotId, seriesKey])),
    ) as LocalCatalogSeriesLookupRecord[];
    const itemStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
    const items = (await Promise.all(records.map((record) => requestResult(
      itemStore.get([snapshotId, record.itemId]),
    ) as Promise<LocalCatalogSnapshotItem | undefined>))).filter(
      (item): item is LocalCatalogSnapshotItem => Boolean(item),
    );
    await done;
    return { status: 'ready', items };
  } finally { db.close(); }
}
