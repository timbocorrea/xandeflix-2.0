import {
  LOCAL_CATALOG_V2_STORES,
  openLocalCatalogDb,
} from './localCatalogDb.service';
import { getSeriesCollectionKey } from './localCatalogSeriesIdentity.service';
import type { LocalCatalogItem } from '../types/localCatalog.types';

function normalizeLegacySeriesPrefix(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error('LOCAL_CATALOG_LEGACY_SERIES_LOOKUP_FAILED'),
      );
  });
}

export async function listLocalCatalogLegacySeriesItems(input: {
  sourceId: string;
  seriesKey: string;
}) {
  const sourceId = input.sourceId.trim();
  const seriesKey = input.seriesKey.trim().toLowerCase();
  const normalizedPrefix = normalizeLegacySeriesPrefix(seriesKey);

  if (!sourceId || !seriesKey || !normalizedPrefix) {
    return [];
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V2_STORES[0],
      'readonly',
    );
    const done = transactionDone(transaction);
    const index = transaction
      .objectStore(LOCAL_CATALOG_V2_STORES[0])
      .index('normalizedName');
    const range = IDBKeyRange.bound(
      normalizedPrefix,
      `${normalizedPrefix}\uffff`,
    );
    const items = await new Promise<LocalCatalogItem[]>(
      (resolve, reject) => {
        const matches: LocalCatalogItem[] = [];
        const request = index.openCursor(range);

        request.onerror = () =>
          reject(
            request.error ??
              new Error('LOCAL_CATALOG_LEGACY_SERIES_LOOKUP_FAILED'),
          );
        request.onsuccess = () => {
          const cursor = request.result;

          if (!cursor) {
            resolve(matches);
            return;
          }

          const item = cursor.value as LocalCatalogItem;

          if (
            item.sourceId === sourceId &&
            (item.contentKind === 'series' ||
              item.contentKind === 'series_episode') &&
            getSeriesCollectionKey(item) === seriesKey
          ) {
            matches.push(item);
          }

          cursor.continue();
        };
      },
    );

    await done;
    return items;
  } finally {
    db.close();
  }
}
