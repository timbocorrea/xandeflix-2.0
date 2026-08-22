import type { IptvChannel } from '@/features/playlists/types/playlist';
import { localCatalogRepository } from '@/features/localCatalog/repositories/localCatalogRepository.service';
import type { CatalogRepository } from '@/features/localCatalog/repositories/catalogRepository.types';
import { isLocalCatalogReadable } from '@/features/localCatalog/services/localCatalogReadability.service';
import { listReadableLocalCatalogActiveSnapshotItems } from '@/features/localCatalog/repositories/localCatalogSnapshotLifecycleRepository.service';
import {
  openLocalCatalogDb,
  LOCAL_CATALOG_V3_STORES,
  getLocalCatalogScope,
} from '@/features/localCatalog/services/localCatalogDb.service';
import type {
  LocalCatalogScope,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotItem,
} from '@/features/localCatalog/types/localCatalog.types';

export async function loadReadableLocalLiveChannels(
  rawSourceId: string,
  repository: CatalogRepository = localCatalogRepository,
  scopeKey?: string | null,
): Promise<IptvChannel[] | null> {
  const sourceId = rawSourceId.trim();

  if (!sourceId) {
    return null;
  }

  // 1. V3 ACTIVE Snapshot (authoritative)
  if (scopeKey) {
    try {
      const activeSnapshotResult = await listReadableLocalCatalogActiveSnapshotItems({
        scopeKey,
        contentKinds: ['live'],
      });

      if (activeSnapshotResult && activeSnapshotResult.items.length > 0) {
        const channels = activeSnapshotResult.items.map<IptvChannel>((item) => ({
          id: item.itemId,
          name: item.rawName,
          url: item.streamUrl,
          logo: item.artworkUrl ?? undefined,
          groupTitle: item.rawGroupTitle ?? undefined,
          contentKind: 'live',
        }));
        return channels;
      }
    } catch (err) {
      console.warn('[XANDEFLIX_LIVE_V3_ACTIVE_READ_FAILED]', err);
    }
  }

  // 2. Stable Local Sources (e.g. V2 repository)
  try {
    const metadata = await repository.getImportMetadata(sourceId);

    if (isLocalCatalogReadable(metadata)) {
      const items = await repository.listItems({
        sourceId,
        contentKind: 'live',
      });

      if (items.length > 0) {
        return items.map((item) => ({
          id: item.id,
          name: item.name,
          url: item.streamUrl,
          logo: item.tvgLogo ?? undefined,
          groupTitle: item.groupTitle ?? undefined,
          tvgId: item.tvgId ?? undefined,
          tvgName: item.tvgName ?? undefined,
          contentKind: 'live',
        }));
      }
    }
  } catch (err) {
    console.warn('[XANDEFLIX_LIVE_V2_READ_FAILED]', err);
  }

  // 3. V3 STAGING Snapshot (partial non-authoritative fallback during building)
  if (scopeKey) {
    try {
      const scope = await getLocalCatalogScope(scopeKey);
      if (scope?.accessStatus === 'active' && scope.stagingSnapshotId) {
        const stagingChannels = await getStagingSnapshotLiveChannels(
          scopeKey,
          scope.stagingSnapshotId,
        );
        if (stagingChannels && stagingChannels.length > 0) {
          return stagingChannels;
        }
      }
    } catch (err) {
      console.warn('[XANDEFLIX_LIVE_V3_STAGING_READ_FAILED]', err);
    }
  }

  return null;
}

export async function getStagingSnapshotLiveChannels(
  scopeKey: string,
  stagingSnapshotId: string,
  limit: number = 5000,
): Promise<IptvChannel[]> {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.scopes,
        LOCAL_CATALOG_V3_STORES.snapshots,
        LOCAL_CATALOG_V3_STORES.items,
      ],
      'readonly',
    );
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('LOCAL_CATALOG_DB_TRANSACTION_ABORTED'));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('LOCAL_CATALOG_DB_TRANSACTION_FAILED'));
    });

    const scopeRequest = transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.scopes)
      .get(scopeKey);
    const scope = await new Promise<LocalCatalogScope | undefined>((resolve, reject) => {
      scopeRequest.onsuccess = () =>
        resolve(scopeRequest.result as LocalCatalogScope | undefined);
      scopeRequest.onerror = () => reject(scopeRequest.error);
    });

    if (
      !scope ||
      scope.accessStatus !== 'active' ||
      scope.stagingSnapshotId !== stagingSnapshotId
    ) {
      await completed;
      return [];
    }

    const snapshotRequest = transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.snapshots)
      .get(stagingSnapshotId);
    const snapshot = await new Promise<LocalCatalogSnapshot | undefined>((resolve, reject) => {
      snapshotRequest.onsuccess = () =>
        resolve(snapshotRequest.result as LocalCatalogSnapshot | undefined);
      snapshotRequest.onerror = () => reject(snapshotRequest.error);
    });

    if (
      !snapshot ||
      snapshot.scopeKey !== scopeKey ||
      snapshot.status !== 'building'
    ) {
      await completed;
      return [];
    }

    const itemStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
    const index = itemStore.index('snapshotIdContentKind');
    const range = IDBKeyRange.only([stagingSnapshotId, 'live']);
    const items = await new Promise<LocalCatalogSnapshotItem[]>((resolve, reject) => {
      const results: LocalCatalogSnapshotItem[] = [];
      const cursorRequest = index.openCursor(range);
      cursorRequest.onerror = () => reject(cursorRequest.error);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }
        const item = cursor.value as LocalCatalogSnapshotItem;
        if (
          item.snapshotId === stagingSnapshotId &&
          item.scopeKey === scopeKey
        ) {
          results.push(item);
        }
        cursor.continue();
      };
    });

    await completed;

    return items.map<IptvChannel>((item) => ({
      id: item.itemId,
      name: item.rawName,
      url: item.streamUrl,
      logo: item.artworkUrl ?? undefined,
      groupTitle: item.rawGroupTitle ?? undefined,
      contentKind: 'live',
    }));
  } finally {
    db.close();
  }
}
