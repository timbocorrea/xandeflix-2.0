import {
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
} from './localCatalogDb.service';

export type LocalCatalogSnapshotPurgeResult = {
  snapshotId: string;
  deletedItems: number;
  deletedCategories: number;
  deletedSearchDocuments: number;
  deletedSearchTokens: number;
  deletedSeriesLookupRows: number;
  seriesLookupStateDeleted: boolean;
  checkpointDeleted: boolean;
  metricsDeleted: boolean;
};

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(new Error('LOCAL_CATALOG_SNAPSHOT_PURGE_FAILED'));
  });
}

function requestResult<T>(
  request: IDBRequest<T>,
  transaction: IDBTransaction,
) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      try {
        transaction.abort();
      } catch {
        // The transaction can already be aborting after the request error.
      }
      reject(new Error('LOCAL_CATALOG_SNAPSHOT_PURGE_FAILED'));
    };
  });
}

async function deleteDirectRecord(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
) {
  const transaction = db.transaction(storeName, 'readwrite');
  const done = waitForTransaction(transaction);
  const store = transaction.objectStore(storeName);
  const range = IDBKeyRange.only(key);
  const deleted = (await requestResult(
    store.count(range),
    transaction,
  )) > 0;

  if (deleted) {
    await requestResult(store.delete(range), transaction);
  }

  await done;
  return deleted;
}

async function deleteSnapshotRecords(
  db: IDBDatabase,
  storeName: string,
  snapshotId: string,
) {
  const transaction = db.transaction(storeName, 'readwrite');
  const done = waitForTransaction(transaction);
  const store = transaction.objectStore(storeName);
  const range = IDBKeyRange.bound([snapshotId], [snapshotId, []]);
  const deleted = await requestResult(store.count(range), transaction);

  if (deleted > 0) {
    await requestResult(store.delete(range), transaction);
  }

  await done;
  return deleted;
}

export async function purgeLocalCatalogSnapshotPartialData(input: {
  snapshotId: string;
}): Promise<LocalCatalogSnapshotPurgeResult> {
  const snapshotId = input.snapshotId.trim();

  if (!snapshotId) {
    throw new Error('LOCAL_CATALOG_SNAPSHOT_ID_INVALID');
  }

  const db = await openLocalCatalogDb();

  try {
    const checkpointDeleted = await deleteDirectRecord(
      db,
      LOCAL_CATALOG_V3_STORES.checkpoints,
      snapshotId,
    );
    const metricsDeleted = await deleteDirectRecord(
      db,
      LOCAL_CATALOG_V3_STORES.metrics,
      snapshotId,
    );
    const deletedItems = await deleteSnapshotRecords(
      db,
      LOCAL_CATALOG_V3_STORES.items,
      snapshotId,
    );
    const deletedCategories = await deleteSnapshotRecords(
      db,
      LOCAL_CATALOG_V3_STORES.categories,
      snapshotId,
    );
    const deletedSearchDocuments = await deleteSnapshotRecords(
      db,
      LOCAL_CATALOG_V3_STORES.searchDocuments,
      snapshotId,
    );
    const deletedSearchTokens = await deleteSnapshotRecords(
      db,
      LOCAL_CATALOG_V3_STORES.searchTokens,
      snapshotId,
    );
    const deletedSeriesLookupRows = await deleteSnapshotRecords(
      db,
      LOCAL_CATALOG_V3_STORES.seriesLookup,
      snapshotId,
    );
    const seriesLookupStateDeleted = await deleteDirectRecord(
      db,
      LOCAL_CATALOG_V3_STORES.seriesLookupState,
      snapshotId,
    );

    return {
      snapshotId,
      deletedItems,
      deletedCategories,
      deletedSearchDocuments,
      deletedSearchTokens,
      deletedSeriesLookupRows,
      seriesLookupStateDeleted,
      checkpointDeleted,
      metricsDeleted,
    };
  } catch {
    throw new Error('LOCAL_CATALOG_SNAPSHOT_PURGE_FAILED');
  } finally {
    db.close();
  }
}
