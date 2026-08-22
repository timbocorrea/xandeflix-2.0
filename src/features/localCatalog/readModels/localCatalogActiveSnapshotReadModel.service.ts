import {
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
} from '../services/localCatalogDb.service';
import type {
  LocalCatalogContentKind,
  LocalCatalogScope,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotCategory,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';

const FINGERPRINT_BATCH_SIZE = 500;
const FINGERPRINT_TIMEOUT_MS = 120_000;
const FINGERPRINT_MAX_ITEMS_IN_MEMORY = FINGERPRINT_BATCH_SIZE;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('LOCAL_CATALOG_DB_REQUEST_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error('LOCAL_CATALOG_DB_TRANSACTION_ABORTED'));
    transaction.onerror = () => reject(new Error('LOCAL_CATALOG_DB_TRANSACTION_FAILED'));
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw Object.assign(new Error('LOCAL_CATALOG_REFRESH_CANCELED'), {
      name: 'AbortError',
    });
  }
}

function throwIfFingerprintTimedOut(startedAt: number, timeoutMs: number) {
  if (performance.now() - startedAt >= timeoutMs) {
    throw new Error('LOCAL_CATALOG_REFRESH_TIMEOUT');
  }
}

async function readActiveSnapshot(
  transaction: IDBTransaction,
  scopeKey: string,
) {
  const scope = (await requestResult(
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).get(scopeKey),
  )) as LocalCatalogScope | undefined;

  if (
    scope?.accessStatus !== 'active' ||
    (!scope.activeSnapshotId && !scope.stagingSnapshotId)
  ) {
    return null;
  }

  const snapshotId = scope.activeSnapshotId || scope.stagingSnapshotId;
  const snapshot = (await requestResult(
    transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.snapshots)
      .get(snapshotId!),
  )) as LocalCatalogSnapshot | undefined;

  if (
    !snapshot ||
    snapshot.scopeKey !== scopeKey ||
    snapshot.status === 'failed' ||
    snapshot.status === 'canceled' ||
    snapshot.status === 'superseded'
  ) {
    return null;
  }

  return snapshot;
}

export async function listActiveLocalCatalogSnapshotCategories(input: {
  scopeKey: string;
  contentKinds: LocalCatalogContentKind[];
}) {
  const scopeKey = input.scopeKey.trim();
  const contentKinds = Array.from(new Set(input.contentKinds));

  if (!scopeKey || contentKinds.length === 0) {
    return null;
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.scopes,
        LOCAL_CATALOG_V3_STORES.snapshots,
        LOCAL_CATALOG_V3_STORES.categories,
      ],
      'readonly',
    );
    const completed = transactionDone(transaction);
    const snapshot = await readActiveSnapshot(transaction, scopeKey);

    if (!snapshot) {
      await completed;
      return null;
    }

    const index = transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.categories)
      .index('snapshotIdContentKind');
    const categoryGroups = await Promise.all(
      contentKinds.map((contentKind) =>
        requestResult(
          index.getAll(IDBKeyRange.only([snapshot.snapshotId, contentKind])),
        ) as Promise<LocalCatalogSnapshotCategory[]>,
      ),
    );
    await completed;

    return {
      snapshotId: snapshot.snapshotId,
      categories: categoryGroups
        .flat()
        .filter(
          (category) =>
            category.snapshotId === snapshot.snapshotId &&
            category.scopeKey === scopeKey,
        )
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.categoryId.localeCompare(right.categoryId),
        ),
    };
  } finally {
    db.close();
  }
}

function readBoundedItems(
  index: IDBIndex,
  range: IDBKeyRange,
  input: {
    snapshotId: string;
    scopeKey: string;
    contentKind: LocalCatalogContentKind;
    offset: number;
    limit: number;
  },
) {
  return new Promise<LocalCatalogSnapshotItem[]>((resolve, reject) => {
    const items: LocalCatalogSnapshotItem[] = [];
    let skipped = 0;
    const request = index.openCursor(range);

    request.onerror = () => reject(new Error('LOCAL_CATALOG_DB_REQUEST_FAILED'));
    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor || items.length >= input.limit) {
        resolve(items);
        return;
      }

      const item = cursor.value as LocalCatalogSnapshotItem;

      if (
        item.snapshotId === input.snapshotId &&
        item.scopeKey === input.scopeKey &&
        item.contentKind === input.contentKind
      ) {
        if (skipped < input.offset) {
          skipped += 1;
        } else {
          items.push(item);
        }
      }

      cursor.continue();
    };
  });
}

export async function listActiveLocalCatalogSnapshotItems(input: {
  scopeKey: string;
  contentKind: LocalCatalogContentKind;
  normalizedGroup?: string | null;
  offset?: number;
  limit: number;
}) {
  const scopeKey = input.scopeKey.trim();
  const normalizedGroup = input.normalizedGroup?.trim() || null;
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.max(1, Math.floor(input.limit));

  if (!scopeKey) {
    return null;
  }

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
    const completed = transactionDone(transaction);
    const snapshot = await readActiveSnapshot(transaction, scopeKey);

    if (!snapshot) {
      await completed;
      return null;
    }

    const store = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
    const index = normalizedGroup
      ? store.index('snapshotIdContentKindNormalizedGroup')
      : store.index('snapshotIdContentKind');
    const range = normalizedGroup
      ? IDBKeyRange.only([
          snapshot.snapshotId,
          input.contentKind,
          normalizedGroup,
        ])
      : IDBKeyRange.only([snapshot.snapshotId, input.contentKind]);
    const items = await readBoundedItems(index, range, {
      snapshotId: snapshot.snapshotId,
      scopeKey,
      contentKind: input.contentKind,
      offset,
      limit,
    });
    await completed;

    return {
      snapshotId: snapshot.snapshotId,
      items,
    };
  } finally {
    db.close();
  }
}

function updateFingerprintHash(hash: number, value: string) {
  const framedValue = `${value.length}:${value}|`;
  let nextHash = hash;

  for (let index = 0; index < framedValue.length; index += 1) {
    nextHash ^= framedValue.charCodeAt(index);
    nextHash = Math.imul(nextHash, 0x01000193);
  }

  return nextHash >>> 0;
}

function updateSnapshotFingerprint(
  state: { primary: number; secondary: number },
  item: LocalCatalogSnapshotItem,
) {
  const fields = [
    item.itemId,
    item.contentKind,
    item.rawName,
    item.rawGroupTitle ?? '',
    item.streamUrl,
    item.artworkUrl ?? '',
    String(item.sourceOrder),
  ];

  for (const field of fields) {
    state.primary = updateFingerprintHash(state.primary, field);
    state.secondary = updateFingerprintHash(
      state.secondary,
      `${field}\u001f${state.primary}`,
    );
  }
}

async function readSnapshotFingerprintBatch(input: {
  db: IDBDatabase;
  snapshotId: string;
  scopeKey: string;
  afterSourceOrder: number | null;
  signal?: AbortSignal;
}) {
  throwIfAborted(input.signal);
  const transaction = input.db.transaction(
    LOCAL_CATALOG_V3_STORES.items,
    'readonly',
  );
  const completed = transactionDone(transaction);
  const index = transaction
    .objectStore(LOCAL_CATALOG_V3_STORES.items)
    .index('snapshotIdSourceOrder');
  const lower = [input.snapshotId, input.afterSourceOrder ?? -1];
  const upper = [input.snapshotId, Number.MAX_SAFE_INTEGER];
  const items = (await requestResult(
    index.getAll(
      IDBKeyRange.bound(lower, upper, input.afterSourceOrder !== null, false),
      FINGERPRINT_BATCH_SIZE,
    ),
  )) as LocalCatalogSnapshotItem[];
  await completed;

  return items.filter(
    (item) =>
      item.snapshotId === input.snapshotId && item.scopeKey === input.scopeKey,
  );
}

export async function computeLocalCatalogSnapshotContentFingerprint(input: {
  snapshotId: string;
  scopeKey: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: {
    processedItems: number;
    elapsedMs: number;
  }) => void;
}) {
  const snapshotId = input.snapshotId.trim();
  const scopeKey = input.scopeKey.trim();
  const timeoutMs = input.timeoutMs ?? FINGERPRINT_TIMEOUT_MS;

  if (!snapshotId || !scopeKey || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('LOCAL_CATALOG_FINGERPRINT_SCOPE_INVALID');
  }

  throwIfAborted(input.signal);
  const startedAt = performance.now();
  const state = {
    primary: 0x811c9dc5,
    secondary: 0x9e3779b9,
  };
  let count = 0;
  let afterSourceOrder: number | null = null;
  const db = await openLocalCatalogDb();

  try {
    for (;;) {
      throwIfFingerprintTimedOut(startedAt, timeoutMs);
      const items = await readSnapshotFingerprintBatch({
        db,
        snapshotId,
        scopeKey,
        afterSourceOrder,
        signal: input.signal,
      });

      if (items.length > FINGERPRINT_MAX_ITEMS_IN_MEMORY) {
        throw new Error('LOCAL_CATALOG_REFRESH_MEMORY_GUARD');
      }

      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        updateSnapshotFingerprint(state, item);
        count += 1;
      }

      afterSourceOrder = items[items.length - 1]!.sourceOrder;
      input.onProgress?.({
        processedItems: count,
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });

      if (items.length < FINGERPRINT_BATCH_SIZE) {
        break;
      }

      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
      throwIfAborted(input.signal);
      throwIfFingerprintTimedOut(startedAt, timeoutMs);
    }
  } finally {
    db.close();
  }

  return {
    count,
    fingerprint: `snapshot-fnv2-v1:${count}:${state.primary
      .toString(16)
      .padStart(8, '0')}:${state.secondary.toString(16).padStart(8, '0')}`,
  };
}
