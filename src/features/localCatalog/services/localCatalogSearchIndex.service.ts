import { createLocalCatalogSearchRecords } from '../lib/localCatalogSearchIndex';
import type {
  LocalCatalogSnapshotItem,
  LocalCatalogSnapshotMetrics,
} from '../types/localCatalog.types';
import {
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
} from './localCatalogDb.service';

const INDEX_BATCH_SIZE = 500;
const pendingIndexes = new Map<string, Promise<void>>();

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error('LOCAL_CATALOG_SEARCH_INDEX_REQUEST_FAILED'),
      );
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error('LOCAL_CATALOG_SEARCH_INDEX_TRANSACTION_FAILED'),
      );
  });
}

async function countSearchDocuments(snapshotId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.searchDocuments,
      'readonly',
    );
    return await requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.searchDocuments)
        .index('snapshotId')
        .count(IDBKeyRange.only(snapshotId)),
    );
  } finally {
    db.close();
  }
}

async function countSnapshotItems(snapshotId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.items,
      'readonly',
    );
    return await requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.items)
        .index('snapshotId')
        .count(IDBKeyRange.only(snapshotId)),
    );
  } finally {
    db.close();
  }
}

async function readItemBatch(
  snapshotId: string,
  afterItemId: string | null,
) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.items,
      'readonly',
    );
    const store = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
    const range = afterItemId
      ? IDBKeyRange.bound(
          [snapshotId, afterItemId],
          [snapshotId, []],
          true,
          false,
        )
      : IDBKeyRange.bound([snapshotId], [snapshotId, []]);

    return await new Promise<LocalCatalogSnapshotItem[]>(
      (resolve, reject) => {
        const items: LocalCatalogSnapshotItem[] = [];
        const request = store.openCursor(range);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || items.length >= INDEX_BATCH_SIZE) {
            resolve(items);
            return;
          }
          items.push(cursor.value as LocalCatalogSnapshotItem);
          cursor.continue();
        };
        request.onerror = () =>
          reject(new Error('LOCAL_CATALOG_SEARCH_INDEX_READ_FAILED'));
      },
    );
  } finally {
    db.close();
  }
}

async function writeIndexBatch(
  items: LocalCatalogSnapshotItem[],
  scopeKey: string,
) {
  if (items.length === 0) {
    return;
  }

  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.searchDocuments,
        LOCAL_CATALOG_V3_STORES.searchTokens,
      ],
      'readwrite',
    );
    const done = transactionDone(transaction);
    const documentStore = transaction.objectStore(
      LOCAL_CATALOG_V3_STORES.searchDocuments,
    );
    const tokenStore = transaction.objectStore(
      LOCAL_CATALOG_V3_STORES.searchTokens,
    );
    const updatedAt = new Date().toISOString();

    for (const item of items) {
      if (item.scopeKey !== scopeKey) {
        transaction.abort();
        throw new Error('LOCAL_CATALOG_SEARCH_SCOPE_MISMATCH');
      }
      const { document, tokenRecords } = createLocalCatalogSearchRecords(
        item,
        updatedAt,
      );
      documentStore.put(document);
      for (const token of tokenRecords) {
        tokenStore.put(token);
      }
    }
    await done;
  } finally {
    db.close();
  }
}

async function updateIndexedMetrics(snapshotId: string, indexedItems: number) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.metrics,
      'readwrite',
    );
    const done = transactionDone(transaction);
    const store = transaction.objectStore(LOCAL_CATALOG_V3_STORES.metrics);
    const metrics = (await requestResult(
      store.get(snapshotId),
    )) as LocalCatalogSnapshotMetrics | undefined;
    if (metrics) {
      store.put({
        ...metrics,
        indexedSearchItems: indexedItems,
        updatedAt: new Date().toISOString(),
      });
    }
    await done;
  } finally {
    db.close();
  }
}

async function buildLocalCatalogSearchIndex(input: {
  snapshotId: string;
  scopeKey: string;
}) {
  const catalogItems = await countSnapshotItems(input.snapshotId);
  let indexedItems = await countSearchDocuments(input.snapshotId);
  if (indexedItems >= catalogItems) {
    return;
  }

  let afterItemId: string | null = null;
  for (;;) {
    const items = await readItemBatch(input.snapshotId, afterItemId);
    if (items.length === 0) {
      break;
    }
    await writeIndexBatch(items, input.scopeKey);
    afterItemId = items[items.length - 1].itemId;
    if (items.length < INDEX_BATCH_SIZE) {
      break;
    }
  }

  indexedItems = await countSearchDocuments(input.snapshotId);
  await updateIndexedMetrics(input.snapshotId, indexedItems);
}

export function ensureLocalCatalogSearchIndex(input: {
  snapshotId: string;
  scopeKey: string;
}) {
  const pending = pendingIndexes.get(input.snapshotId);
  if (pending) {
    return pending;
  }

  const next = buildLocalCatalogSearchIndex(input).finally(() => {
    if (pendingIndexes.get(input.snapshotId) === next) {
      pendingIndexes.delete(input.snapshotId);
    }
  });
  pendingIndexes.set(input.snapshotId, next);
  return next;
}
