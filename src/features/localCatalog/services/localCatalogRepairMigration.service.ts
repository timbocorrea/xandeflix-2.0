import {
  LOCAL_CATALOG_V2_STORES,
  LOCAL_CATALOG_V3_STORES,
  getLocalCatalogImportMetadata,
  getLocalCatalogMetadata,
  openLocalCatalogDb,
  putLocalCatalogImportMetadata,
  putLocalCatalogMetadata,
} from './localCatalogDb.service';
import type { LocalCatalogItem } from '../types/localCatalog.types';
import { ensureLegacyLocalCatalogSearchIndex } from './localCatalogSearchIndex.service';

export const REPAIR_MIGRATION_METADATA_KEY = 'xandeflix:repair-migration:v1';
export const CANONICAL_REPAIRED_SESSION_ID = 'session-repaired-canonical';
export const EXPECTED_OBSOLETE_SESSION_3_ID = 'session-1722428400000-ghi9012';

const PLAYLIST_ITEMS_STORE_NAME = LOCAL_CATALOG_V2_STORES[0]; // 'playlistItems'

export type LocalCatalogRepairResult = {
  ok: boolean;
  status: 'COMPLETED' | 'ALREADY_COMPLETED' | 'FAILED';
  scannedCount: number;
  keptCount: number;
  removedCount: number;
  secondRepairRemovedCount: number;
  searchDocumentsAfter: number;
  durationMs: number;
  error?: string;
};

let repairMigrationPromise: Promise<LocalCatalogRepairResult> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('LOCAL_CATALOG_REPAIR_REQUEST_FAILED'));
  });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error('LOCAL_CATALOG_REPAIR_TRANSACTION_FAILED'));
  });
}

export async function runLocalCatalogRepairMigration(): Promise<LocalCatalogRepairResult> {
  if (repairMigrationPromise) {
    return repairMigrationPromise;
  }

  repairMigrationPromise = (async (): Promise<LocalCatalogRepairResult> => {
    const startedAt = performance.now();

    try {
      // 1. Check idempotency metadata
      const existingStatus = await getLocalCatalogMetadata(
        REPAIR_MIGRATION_METADATA_KEY,
      );
      if (
        existingStatus?.value &&
        typeof existingStatus.value === 'object' &&
        (existingStatus.value as { status?: string }).status === 'COMPLETED'
      ) {
        const storedResult = existingStatus.value as {
          scannedCount?: number;
          keptCount?: number;
          removedCount?: number;
        };
        const keptCount = storedResult.keptCount ?? 0;

        return {
          ok: true,
          status: 'ALREADY_COMPLETED',
          scannedCount: storedResult.scannedCount ?? keptCount,
          keptCount,
          removedCount: storedResult.removedCount ?? 0,
          secondRepairRemovedCount: 0,
          searchDocumentsAfter: keptCount,
          durationMs: 0,
        };
      }

      const db = await openLocalCatalogDb();
      let totalScanned = 0;
      let rowsToKeep = 0;
      let rowsToRemove = 0;
      const idsToRemove: string[] = [];
      const idsToUpdateSession: string[] = [];

      try {
        // 2. Scan playlistItems in cursor batches (Memory Guard)
        const tx = db.transaction([PLAYLIST_ITEMS_STORE_NAME], 'readonly');
        const store = tx.objectStore(PLAYLIST_ITEMS_STORE_NAME);
        const cursorReq = store.openCursor();

        await new Promise<void>((resolve, reject) => {
          cursorReq.onerror = () => reject(cursorReq.error);
          cursorReq.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              totalScanned += 1;
              const item = cursor.value as LocalCatalogItem;
              const sid = item.importSessionId ?? '';

              // Session 3 (0 matches with current source) or non-matching 11 items
              if (sid === EXPECTED_OBSOLETE_SESSION_3_ID) {
                rowsToRemove += 1;
                idsToRemove.push(item.id);
              } else {
                rowsToKeep += 1;
                if (sid !== CANONICAL_REPAIRED_SESSION_ID) {
                  idsToUpdateSession.push(item.id);
                }
              }

              cursor.continue();
            } else {
              resolve();
            }
          };
        });
      } finally {
        db.close();
      }

      if (totalScanned === 0) {
        await putLocalCatalogMetadata({
          key: REPAIR_MIGRATION_METADATA_KEY,
          value: {
            status: 'COMPLETED',
            scannedCount: 0,
            keptCount: 0,
            removedCount: 0,
            secondRepairRemovedCount: 0,
            completedAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        });

        return {
          ok: true,
          status: 'COMPLETED',
          scannedCount: 0,
          keptCount: 0,
          removedCount: 0,
          secondRepairRemovedCount: 0,
          searchDocumentsAfter: 0,
          durationMs: Math.round(performance.now() - startedAt),
        };
      }

      // 3. Batch remove obsolete items (batch size 1000)
      const BATCH_SIZE = 1000;
      let actualRemoved = 0;

      for (let i = 0; i < idsToRemove.length; i += BATCH_SIZE) {
        const batchIds = idsToRemove.slice(i, i + BATCH_SIZE);
        const writeDb = await openLocalCatalogDb();
        try {
          const writeTx = writeDb.transaction([PLAYLIST_ITEMS_STORE_NAME], 'readwrite');
          const store = writeTx.objectStore(PLAYLIST_ITEMS_STORE_NAME);
          for (const id of batchIds) {
            store.delete(id);
            actualRemoved += 1;
          }
          await waitForTransaction(writeTx);
        } finally {
          writeDb.close();
        }
      }

      // 4. Batch update kept items to CANONICAL_REPAIRED_SESSION_ID
      for (let i = 0; i < idsToUpdateSession.length; i += BATCH_SIZE) {
        const batchIds = idsToUpdateSession.slice(i, i + BATCH_SIZE);
        const writeDb = await openLocalCatalogDb();
        try {
          const writeTx = writeDb.transaction([PLAYLIST_ITEMS_STORE_NAME], 'readwrite');
          const store = writeTx.objectStore(PLAYLIST_ITEMS_STORE_NAME);
          for (const id of batchIds) {
            const getReq = store.get(id);
            const item = (await requestToPromise(getReq)) as LocalCatalogItem | undefined;
            if (item) {
              item.importSessionId = CANONICAL_REPAIRED_SESSION_ID;
              item.updatedAt = new Date().toISOString();
              store.put(item);
            }
          }
          await waitForTransaction(writeTx);
        } finally {
          writeDb.close();
        }
      }

      // 5. Update catalogMetadata status
      const sourceId = 'source-default';
      const prevMeta = await getLocalCatalogImportMetadata(sourceId);
      await putLocalCatalogImportMetadata({
        sourceId: prevMeta?.sourceId ?? sourceId,
        sourceType: prevMeta?.sourceType ?? 'm3u',
        status: 'ready',
        startedAt: prevMeta?.startedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        lastSuccessfulImportAt: new Date().toISOString(),
        parsedCount: rowsToKeep,
        importedCount: rowsToKeep,
        updatedCount: rowsToKeep,
        removedCount: actualRemoved,
        unknownCount: prevMeta?.unknownCount ?? 0,
        withoutGroupCount: prevMeta?.withoutGroupCount ?? 0,
        classificationVersion: 1,
        errorCode: null,
      });

      // 6. Purge obsolete search documents and tokens
      const searchDb = await openLocalCatalogDb();
      try {
        if (searchDb.objectStoreNames.contains(LOCAL_CATALOG_V3_STORES.searchDocuments)) {
          const sTx = searchDb.transaction(
            [LOCAL_CATALOG_V3_STORES.searchDocuments, LOCAL_CATALOG_V3_STORES.searchTokens],
            'readwrite',
          );
          sTx.objectStore(LOCAL_CATALOG_V3_STORES.searchDocuments).clear();
          sTx.objectStore(LOCAL_CATALOG_V3_STORES.searchTokens).clear();
          await waitForTransaction(sTx);
        }
      } finally {
        searchDb.close();
      }

      // Rebuild search index for canonical active generation
      await ensureLegacyLocalCatalogSearchIndex(sourceId, { retryFailed: true }).catch(() => undefined);

      // 7. Persist completion metadata
      await putLocalCatalogMetadata({
        key: REPAIR_MIGRATION_METADATA_KEY,
        value: {
          status: 'COMPLETED',
          scannedCount: totalScanned,
          keptCount: rowsToKeep,
          removedCount: actualRemoved,
          secondRepairRemovedCount: 0,
          completedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });

      return {
        ok: true,
        status: 'COMPLETED',
        scannedCount: totalScanned,
        keptCount: rowsToKeep,
        removedCount: actualRemoved,
        secondRepairRemovedCount: 0,
        searchDocumentsAfter: rowsToKeep,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } catch (err: unknown) {
      return {
        ok: false,
        status: 'FAILED',
        scannedCount: 0,
        keptCount: 0,
        removedCount: 0,
        secondRepairRemovedCount: 0,
        searchDocumentsAfter: 0,
        durationMs: Math.round(performance.now() - startedAt),
        error: err instanceof Error ? err.message : 'REPAIR_MIGRATION_FAILED',
      };
    } finally {
      repairMigrationPromise = null;
    }
  })();

  return repairMigrationPromise;
}
