import type {
  ListLocalCatalogItemsInput,
  LocalCatalogCategory,
  LocalCatalogContentKind,
  LocalCatalogImportMetadata,
  LocalCatalogItem,
  LocalCatalogStats,
  LocalCatalogImportCheckpoint,
  LocalCatalogMetadata,
  LocalCatalogScope,
  LocalCatalogScopeAccessStatus,
  LocalCatalogSnapshot,
  LocalTmdbMetadata,
} from '../types/localCatalog.types';

const LOCAL_CATALOG_DB_NAME = 'xandeflix-local-catalog';
export const LOCAL_CATALOG_DB_VERSION = 4;

const PLAYLIST_ITEMS_STORE = 'playlistItems';
const CATALOG_METADATA_STORE = 'catalogMetadata';
const TMDB_METADATA_STORE = 'tmdbMetadata';
export const LOCAL_CATALOG_V2_STORES = [
  PLAYLIST_ITEMS_STORE,
  CATALOG_METADATA_STORE,
  TMDB_METADATA_STORE,
] as const;
export const LOCAL_CATALOG_V3_STORES = {
  scopes: 'catalogScopes',
  snapshots: 'importSnapshots',
  checkpoints: 'importCheckpoints',
  items: 'catalogSnapshotItems',
  categories: 'catalogSnapshotCategories',
  searchDocuments: 'searchDocuments',
  searchTokens: 'searchTokens',
  metrics: 'catalogSnapshotMetrics',
  seriesLookup: 'catalogSeriesLookup',
  seriesLookupState: 'catalogSeriesLookupState',
} as const;

const SOURCE_ID_INDEX = 'sourceId';
const SOURCE_ID_CONTENT_KIND_INDEX = 'sourceIdContentKind';
const SOURCE_ID_GROUP_TITLE_INDEX = 'sourceIdGroupTitle';
const SOURCE_ID_CONTENT_KIND_GROUP_TITLE_INDEX =
  'sourceIdContentKindGroupTitle';
const SOURCE_ID_CONTENT_KIND_NORMALIZED_GROUP_INDEX =
  'sourceIdContentKindNormalizedGroup';

const CONTENT_KINDS: LocalCatalogContentKind[] = [
  'live',
  'movie',
  'series',
  'series_episode',
  'radio',
  'unknown',
];

function ensurePlaylistItemIndexes(store: IDBObjectStore) {
  if (!store.indexNames.contains(SOURCE_ID_INDEX)) {
    store.createIndex(SOURCE_ID_INDEX, 'sourceId', { unique: false });
  }

  if (!store.indexNames.contains(SOURCE_ID_CONTENT_KIND_INDEX)) {
    store.createIndex(
      SOURCE_ID_CONTENT_KIND_INDEX,
      ['sourceId', 'contentKind'],
      { unique: false },
    );
  }

  if (!store.indexNames.contains(SOURCE_ID_GROUP_TITLE_INDEX)) {
    store.createIndex(
      SOURCE_ID_GROUP_TITLE_INDEX,
      ['sourceId', 'groupTitle'],
      { unique: false },
    );
  }

  if (!store.indexNames.contains(SOURCE_ID_CONTENT_KIND_GROUP_TITLE_INDEX)) {
    store.createIndex(
      SOURCE_ID_CONTENT_KIND_GROUP_TITLE_INDEX,
      ['sourceId', 'contentKind', 'groupTitle'],
      { unique: false },
    );
  }

  if (
    !store.indexNames.contains(SOURCE_ID_CONTENT_KIND_NORMALIZED_GROUP_INDEX)
  ) {
    store.createIndex(
      SOURCE_ID_CONTENT_KIND_NORMALIZED_GROUP_INDEX,
      ['sourceId', 'contentKind', 'normalizedGroup'],
      { unique: false },
    );
  }
}

function getIndexedDbFactory() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('INDEXEDDB_UNAVAILABLE');
  }

  return window.indexedDB;
}

function createPlaylistItemsStore(db: IDBDatabase) {
  const store = db.createObjectStore(PLAYLIST_ITEMS_STORE, { keyPath: 'id' });

  ensurePlaylistItemIndexes(store);
  store.createIndex('contentKind', 'contentKind', { unique: false });
  store.createIndex('groupTitle', 'groupTitle', { unique: false });
  store.createIndex('contentKindGroupTitle', ['contentKind', 'groupTitle'], {
    unique: false,
  });
  store.createIndex('streamUrl', 'streamUrl', { unique: false });
  store.createIndex('normalizedName', 'normalizedName', { unique: false });
}

function createCatalogMetadataStore(db: IDBDatabase) {
  db.createObjectStore(CATALOG_METADATA_STORE, { keyPath: 'key' });
}

function createTmdbMetadataStore(db: IDBDatabase) {
  const store = db.createObjectStore(TMDB_METADATA_STORE, { keyPath: 'id' });

  store.createIndex('sourceItemId', 'sourceItemId', { unique: false });
}

function createIndexedStore(
  db: IDBDatabase,
  name: string,
  keyPath: string | string[],
  indexes: Array<[string, string | string[]]>,
) {
  const store = db.createObjectStore(name, { keyPath });
  for (const [indexName, indexKeyPath] of indexes) {
    store.createIndex(indexName, indexKeyPath, { unique: false });
  }
}

function ensureV3ObjectStores(db: IDBDatabase) {
  const definitions: Array<[
    string,
    string | string[],
    Array<[string, string | string[]]>,
  ]> = [
    [LOCAL_CATALOG_V3_STORES.scopes, 'scopeKey', [
      ['tenantScopeId', 'tenantScopeId'], ['sourceId', 'sourceId'],
      ['tenantScopeIdSourceId', ['tenantScopeId', 'sourceId']],
      ['accessStatus', 'accessStatus'],
    ]],
    [LOCAL_CATALOG_V3_STORES.snapshots, 'snapshotId', [
      ['scopeKey', 'scopeKey'], ['scopeKeyStatus', ['scopeKey', 'status']],
      ['scopeKeyCreatedAt', ['scopeKey', 'createdAt']],
    ]],
    [LOCAL_CATALOG_V3_STORES.checkpoints, 'snapshotId', [
      ['scopeKey', 'scopeKey'], ['scopeKeyUpdatedAt', ['scopeKey', 'updatedAt']],
    ]],
    [LOCAL_CATALOG_V3_STORES.items, ['snapshotId', 'itemId'], [
      ['snapshotId', 'snapshotId'],
      ['snapshotIdContentKind', ['snapshotId', 'contentKind']],
      ['snapshotIdContentKindNormalizedGroup', ['snapshotId', 'contentKind', 'normalizedGroup']],
      ['snapshotIdNormalizedName', ['snapshotId', 'normalizedName']],
      ['snapshotIdSourceOrder', ['snapshotId', 'sourceOrder']],
      ['scopeKeySnapshotId', ['scopeKey', 'snapshotId']],
    ]],
    [LOCAL_CATALOG_V3_STORES.categories, ['snapshotId', 'categoryId'], [
      ['snapshotId', 'snapshotId'],
      ['snapshotIdContentKind', ['snapshotId', 'contentKind']],
      ['snapshotIdSortOrder', ['snapshotId', 'sortOrder']],
    ]],
    [LOCAL_CATALOG_V3_STORES.searchDocuments, ['snapshotId', 'documentId'], [
      ['snapshotId', 'snapshotId'],
      ['snapshotIdIndexStatus', ['snapshotId', 'indexStatus']],
      ['snapshotIdContentKind', ['snapshotId', 'contentKind']],
      ['snapshotIdNormalizedTitle', ['snapshotId', 'normalizedTitle']],
      ['snapshotIdNormalizedCategory', ['snapshotId', 'normalizedCategory']],
    ]],
    [LOCAL_CATALOG_V3_STORES.searchTokens, ['snapshotId', 'token', 'documentId'], [
      ['snapshotIdToken', ['snapshotId', 'token']],
      ['snapshotIdDocumentId', ['snapshotId', 'documentId']],
    ]],
    [LOCAL_CATALOG_V3_STORES.metrics, 'snapshotId', []],
    [LOCAL_CATALOG_V3_STORES.seriesLookup, ['snapshotId', 'seriesKey', 'itemId'], [
      ['snapshotIdSeriesKey', ['snapshotId', 'seriesKey']],
      ['snapshotId', 'snapshotId'],
    ]],
    [LOCAL_CATALOG_V3_STORES.seriesLookupState, 'snapshotId', []],
  ];

  for (const [name, keyPath, indexes] of definitions) {
    if (!db.objectStoreNames.contains(name)) {
      createIndexedStore(db, name, keyPath, indexes);
    }
  }
}

export function ensureLocalCatalogObjectStores(
  db: IDBDatabase,
  upgradeTransaction: IDBTransaction | null,
) {
  if (!db.objectStoreNames.contains(PLAYLIST_ITEMS_STORE)) {
    createPlaylistItemsStore(db);
  } else if (upgradeTransaction) {
    ensurePlaylistItemIndexes(
      upgradeTransaction.objectStore(PLAYLIST_ITEMS_STORE),
    );
  }

  if (!db.objectStoreNames.contains(CATALOG_METADATA_STORE)) {
    createCatalogMetadataStore(db);
  }

  if (!db.objectStoreNames.contains(TMDB_METADATA_STORE)) {
    createTmdbMetadataStore(db);
  }

  ensureV3ObjectStores(db);
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('LOCAL_CATALOG_DB_REQUEST_FAILED'));
  });
}

async function putV3Record<T>(storeName: string, value: T) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(storeName, 'readwrite');
    const done = waitForTransaction(transaction);
    transaction.objectStore(storeName).put(value);
    await done;
  } finally { db.close(); }
}

async function getV3Record<T>(storeName: string, key: IDBValidKey) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(storeName, 'readonly');
    const done = waitForTransaction(transaction);
    const value = await requestToPromise(transaction.objectStore(storeName).get(key));
    await done;
    return (value as T | undefined) ?? null;
  } finally { db.close(); }
}

export const putLocalCatalogScope = (value: LocalCatalogScope) =>
  putV3Record(LOCAL_CATALOG_V3_STORES.scopes, value);
export const getLocalCatalogScope = (scopeKey: string) =>
  getV3Record<LocalCatalogScope>(LOCAL_CATALOG_V3_STORES.scopes, scopeKey);
export async function getActiveLocalCatalogScopeBySourceId(sourceId: string) {
  const normalizedSourceId = sourceId.trim();

  if (!normalizedSourceId) {
    return null;
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.scopes,
      'readonly',
    );
    const done = waitForTransaction(transaction);
    const values = await requestToPromise(
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.scopes)
        .index('sourceId')
        .getAll(IDBKeyRange.only(normalizedSourceId)),
    );
    await done;

    return (
      (values as LocalCatalogScope[])
        .filter((scope) => scope.accessStatus === 'active')
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        )[0] ?? null
    );
  } finally {
    db.close();
  }
}
export async function markLocalCatalogScopeAccess(
  scopeKey: string,
  accessStatus: LocalCatalogScopeAccessStatus,
) {
  const scope = await getLocalCatalogScope(scopeKey);
  if (!scope) throw new Error('LOCAL_CATALOG_SCOPE_NOT_FOUND');
  const next = { ...scope, accessStatus, runtimeEpoch: scope.runtimeEpoch + 1, updatedAt: new Date().toISOString() };
  await putLocalCatalogScope(next);
  return next;
}
export async function prepareLocalCatalogScopePointers(
  scopeKey: string,
  pointers: Pick<LocalCatalogScope, 'activeSnapshotId' | 'stagingSnapshotId'>,
) {
  const scope = await getLocalCatalogScope(scopeKey);
  if (!scope) throw new Error('LOCAL_CATALOG_SCOPE_NOT_FOUND');
  const next = { ...scope, ...pointers, updatedAt: new Date().toISOString() };
  await putLocalCatalogScope(next);
  return next;
}
export const putLocalCatalogSnapshot = (value: LocalCatalogSnapshot) =>
  putV3Record(LOCAL_CATALOG_V3_STORES.snapshots, value);
export const getLocalCatalogSnapshot = (snapshotId: string) =>
  getV3Record<LocalCatalogSnapshot>(LOCAL_CATALOG_V3_STORES.snapshots, snapshotId);
export const putLocalCatalogImportCheckpoint = (value: LocalCatalogImportCheckpoint) =>
  putV3Record(LOCAL_CATALOG_V3_STORES.checkpoints, value);
export const getLocalCatalogImportCheckpoint = (snapshotId: string) =>
  getV3Record<LocalCatalogImportCheckpoint>(LOCAL_CATALOG_V3_STORES.checkpoints, snapshotId);

export async function listLocalCatalogSnapshots(scopeKey: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(LOCAL_CATALOG_V3_STORES.snapshots, 'readonly');
    const done = waitForTransaction(transaction);
    const values = await requestToPromise(
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots)
        .index('scopeKey').getAll(IDBKeyRange.only(scopeKey)),
    );
    await done;
    return values as LocalCatalogSnapshot[];
  } finally { db.close(); }
}

export async function inspectLocalCatalogSchema() {
  const db = await openLocalCatalogDb();
  try {
    const stores: Record<string, string[]> = {};
    for (const storeName of Array.from(db.objectStoreNames)) {
      const transaction = db.transaction(storeName, 'readonly');
      stores[storeName] = Array.from(transaction.objectStore(storeName).indexNames);
    }
    return { version: db.version, stores };
  } finally { db.close(); }
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('LOCAL_CATALOG_DB_TRANSACTION_ABORTED'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('LOCAL_CATALOG_DB_TRANSACTION_FAILED'));
  });
}

function resolveLimit(limit: number | undefined) {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return 0;
  }

  return Math.floor(limit);
}

function resolveOffset(offset: number | undefined) {
  if (!Number.isFinite(offset) || !offset || offset <= 0) {
    return 0;
  }

  return Math.floor(offset);
}

function getPlaylistCursorSource(
  store: IDBObjectStore,
  input: ListLocalCatalogItemsInput,
) {
  const groupTitle = input.groupTitle?.trim();
  const normalizedGroup = input.normalizedGroup?.trim();
  const sourceId = input.sourceId?.trim();

  if (sourceId && input.contentKind && normalizedGroup) {
    return {
      source: store.index(SOURCE_ID_CONTENT_KIND_NORMALIZED_GROUP_INDEX),
      range: IDBKeyRange.only([
        sourceId,
        input.contentKind,
        normalizedGroup,
      ]),
    };
  }

  if (sourceId && input.contentKind && groupTitle) {
    return {
      source: store.index(SOURCE_ID_CONTENT_KIND_GROUP_TITLE_INDEX),
      range: IDBKeyRange.only([sourceId, input.contentKind, groupTitle]),
    };
  }

  if (sourceId && input.contentKind) {
    return {
      source: store.index(SOURCE_ID_CONTENT_KIND_INDEX),
      range: IDBKeyRange.only([sourceId, input.contentKind]),
    };
  }

  if (sourceId && groupTitle) {
    return {
      source: store.index(SOURCE_ID_GROUP_TITLE_INDEX),
      range: IDBKeyRange.only([sourceId, groupTitle]),
    };
  }

  if (sourceId) {
    return {
      source: store.index(SOURCE_ID_INDEX),
      range: IDBKeyRange.only(sourceId),
    };
  }

  if (input.contentKind && groupTitle) {
    return {
      source: store.index('contentKindGroupTitle'),
      range: IDBKeyRange.only([input.contentKind, groupTitle]),
    };
  }

  if (input.contentKind) {
    return {
      source: store.index('contentKind'),
      range: IDBKeyRange.only(input.contentKind),
    };
  }

  if (groupTitle) {
    return {
      source: store.index('groupTitle'),
      range: IDBKeyRange.only(groupTitle),
    };
  }

  return {
    source: store,
    range: undefined,
  };
}

function matchesListInput(
  item: LocalCatalogItem,
  input: ListLocalCatalogItemsInput,
) {
  if (
    input.sourceId &&
    item.sourceId !== input.sourceId.trim()
  ) {
    return false;
  }

  if (input.contentKind && item.contentKind !== input.contentKind) {
    return false;
  }

  if (
    input.normalizedGroup &&
    item.normalizedGroup !== input.normalizedGroup.trim()
  ) {
    return false;
  }

  if (input.groupTitle && item.groupTitle !== input.groupTitle.trim()) {
    return false;
  }

  if (input.uncategorizedOnly && item.groupTitle?.trim()) {
    return false;
  }

  return true;
}

function collectCursorResults(
  source: IDBObjectStore | IDBIndex,
  range: IDBKeyRange | undefined,
  input: ListLocalCatalogItemsInput,
) {
  const limit = resolveLimit(input.limit);
  const offset = resolveOffset(input.offset);
  const items: LocalCatalogItem[] = [];
  let skippedItems = 0;

  return new Promise<LocalCatalogItem[]>((resolve, reject) => {
    if (limit === 0) {
      resolve(items);
      return;
    }

    const request = source.openCursor(range);

    request.onerror = () =>
      reject(request.error ?? new Error('LOCAL_CATALOG_CURSOR_FAILED'));
    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(items);
        return;
      }

      const item = cursor.value as LocalCatalogItem;

      if (!matchesListInput(item, input)) {
        cursor.continue();
        return;
      }

      if (skippedItems < offset) {
        skippedItems += 1;
        cursor.continue();
        return;
      }

      items.push(item);

      if (limit !== undefined && items.length >= limit) {
        resolve(items);
        return;
      }

      cursor.continue();
    };
  });
}

export function openLocalCatalogDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;

    try {
      request = getIndexedDbFactory().open(
        LOCAL_CATALOG_DB_NAME,
        LOCAL_CATALOG_DB_VERSION,
      );
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      ensureLocalCatalogObjectStores(request.result, request.transaction);
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('LOCAL_CATALOG_DB_OPEN_FAILED'));
    request.onblocked = () => reject(new Error('LOCAL_CATALOG_DB_OPEN_BLOCKED'));
  });
}

export async function getLocalCatalogStats(): Promise<LocalCatalogStats> {
  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      [PLAYLIST_ITEMS_STORE, CATALOG_METADATA_STORE, TMDB_METADATA_STORE],
      'readonly',
    );
    const transactionDone = waitForTransaction(transaction);
    const playlistStore = transaction.objectStore(PLAYLIST_ITEMS_STORE);
    const contentKindIndex = playlistStore.index('contentKind');

    const playlistItemsCountPromise = requestToPromise(playlistStore.count());
    const catalogMetadataCountPromise = requestToPromise(
      transaction.objectStore(CATALOG_METADATA_STORE).count(),
    );
    const tmdbMetadataCountPromise = requestToPromise(
      transaction.objectStore(TMDB_METADATA_STORE).count(),
    );
    const contentKindCountPromises = CONTENT_KINDS.map(async (contentKind) => [
      contentKind,
      await requestToPromise(contentKindIndex.count(IDBKeyRange.only(contentKind))),
    ] as const);

    const [
      playlistItemsCount,
      catalogMetadataCount,
      tmdbMetadataCount,
      contentKindCounts,
    ] = await Promise.all([
      playlistItemsCountPromise,
      catalogMetadataCountPromise,
      tmdbMetadataCountPromise,
      Promise.all(contentKindCountPromises),
    ]);

    await transactionDone;

    return {
      playlistItemsCount,
      catalogMetadataCount,
      tmdbMetadataCount,
      byContentKind: Object.fromEntries(contentKindCounts) as Record<
        LocalCatalogContentKind,
        number
      >,
    };
  } finally {
    db.close();
  }
}

export async function getLocalTmdbMetadataBySourceItemIds(
  sourceItemIds: string[],
) {
  const uniqueSourceItemIds = Array.from(
    new Set(sourceItemIds.map((itemId) => itemId.trim()).filter(Boolean)),
  );

  if (uniqueSourceItemIds.length === 0) {
    return new Map<string, LocalTmdbMetadata>();
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(TMDB_METADATA_STORE, 'readonly');
    const transactionDone = waitForTransaction(transaction);
    const sourceItemIndex = transaction
      .objectStore(TMDB_METADATA_STORE)
      .index('sourceItemId');
    const entries = await Promise.all(
      uniqueSourceItemIds.map(async (sourceItemId) => {
        const matches = (await requestToPromise(
          sourceItemIndex.getAll(IDBKeyRange.only(sourceItemId)),
        )) as LocalTmdbMetadata[];
        return [
          sourceItemId,
          matches.find(
            (metadata) => metadata.sourceItemId === sourceItemId,
          ) ?? null,
        ] as const;
      }),
    );

    await transactionDone;

    return new Map(
      entries.filter(
        (entry): entry is readonly [string, LocalTmdbMetadata] =>
          entry[1] !== null,
      ),
    );
  } finally {
    db.close();
  }
}

export async function clearLocalCatalogDb() {
  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      [PLAYLIST_ITEMS_STORE, CATALOG_METADATA_STORE, TMDB_METADATA_STORE],
      'readwrite',
    );
    const transactionDone = waitForTransaction(transaction);

    transaction.objectStore(PLAYLIST_ITEMS_STORE).clear();
    transaction.objectStore(CATALOG_METADATA_STORE).clear();
    transaction.objectStore(TMDB_METADATA_STORE).clear();

    await transactionDone;
  } finally {
    db.close();
  }
}

export async function putLocalCatalogItems(items: LocalCatalogItem[]) {
  if (items.length === 0) {
    return;
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(PLAYLIST_ITEMS_STORE, 'readwrite');
    const transactionDone = waitForTransaction(transaction);
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);

    for (const item of items) {
      store.put(item);
    }

    await transactionDone;
  } finally {
    db.close();
  }
}

export async function getExistingLocalCatalogItemIds(itemIds: string[]) {
  if (itemIds.length === 0) {
    return new Set<string>();
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(PLAYLIST_ITEMS_STORE, 'readonly');
    const transactionDone = waitForTransaction(transaction);
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);
    const existingIds = new Set<string>();

    await Promise.all(
      itemIds.map(async (itemId) => {
        const existingKey = await requestToPromise(store.getKey(itemId));

        if (existingKey !== undefined) {
          existingIds.add(itemId);
        }
      }),
    );

    await transactionDone;
    return existingIds;
  } finally {
    db.close();
  }
}

export async function getLocalCatalogItemsByIds(itemIds: string[]) {
  if (itemIds.length === 0) {
    return new Map<string, LocalCatalogItem>();
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(PLAYLIST_ITEMS_STORE, 'readonly');
    const transactionDone = waitForTransaction(transaction);
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);
    const items = new Map<string, LocalCatalogItem>();

    await Promise.all(
      itemIds.map(async (itemId) => {
        const item = (await requestToPromise(store.get(itemId))) as
          | LocalCatalogItem
          | undefined;

        if (item) {
          items.set(itemId, item);
        }
      }),
    );

    await transactionDone;
    return items;
  } finally {
    db.close();
  }
}

export async function removeObsoleteLocalCatalogItems(
  sourceId: string,
  currentImportSessionId: string,
) {
  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(PLAYLIST_ITEMS_STORE, 'readwrite');
    const transactionDone = waitForTransaction(transaction);
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);
    const request = store
      .index(SOURCE_ID_INDEX)
      .openCursor(IDBKeyRange.only(sourceId));
    let removedCount = 0;

    await new Promise<void>((resolve, reject) => {
      request.onerror = () =>
        reject(request.error ?? new Error('LOCAL_CATALOG_RECONCILE_FAILED'));
      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve();
          return;
        }

        const item = cursor.value as LocalCatalogItem;

        if (item.importSessionId !== currentImportSessionId) {
          cursor.delete();
          removedCount += 1;
        }

        cursor.continue();
      };
    });

    await transactionDone;
    return removedCount;
  } finally {
    db.close();
  }
}

function importMetadataKey(sourceId: string) {
  return `import:${sourceId}`;
}

export async function getLocalCatalogMetadata(key: string) {
  const normalizedKey = key.trim();

  if (!normalizedKey) {
    return null;
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(CATALOG_METADATA_STORE, 'readonly');
    const transactionDone = waitForTransaction(transaction);
    const record = await requestToPromise(
      transaction.objectStore(CATALOG_METADATA_STORE).get(normalizedKey),
    );
    await transactionDone;

    return (record as LocalCatalogMetadata | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function getLocalCatalogMetadataBatch(keys: string[]) {
  const normalizedKeys = Array.from(
    new Set(keys.map((key) => key.trim()).filter(Boolean)),
  );

  if (normalizedKeys.length === 0) {
    return new Map<string, LocalCatalogMetadata>();
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(CATALOG_METADATA_STORE, 'readonly');
    const transactionDone = waitForTransaction(transaction);
    const store = transaction.objectStore(CATALOG_METADATA_STORE);
    const records = await Promise.all(
      normalizedKeys.map(async (key) => {
        const record = await requestToPromise(store.get(key));
        return [key, record as LocalCatalogMetadata | undefined] as const;
      }),
    );
    await transactionDone;

    return new Map(
      records.filter(
        (entry): entry is readonly [string, LocalCatalogMetadata] =>
          Boolean(entry[1]),
      ),
    );
  } finally {
    db.close();
  }
}

export async function putLocalCatalogMetadata(
  metadata: LocalCatalogMetadata,
) {
  if (!metadata.key.trim()) {
    throw new Error('LOCAL_CATALOG_METADATA_KEY_REQUIRED');
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(CATALOG_METADATA_STORE, 'readwrite');
    const transactionDone = waitForTransaction(transaction);
    transaction.objectStore(CATALOG_METADATA_STORE).put(metadata);
    await transactionDone;
  } finally {
    db.close();
  }
}

function isLocalCatalogImportMetadata(
  value: unknown,
  sourceId: string,
): value is LocalCatalogImportMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const metadata = value as Partial<LocalCatalogImportMetadata>;
  const validStatuses = new Set([
    'idle',
    'importing',
    'ready',
    'failed',
    'canceled',
  ]);

  return (
    metadata.sourceId === sourceId &&
    typeof metadata.status === 'string' &&
    validStatuses.has(metadata.status) &&
    typeof metadata.parsedCount === 'number' &&
    typeof metadata.importedCount === 'number' &&
    typeof metadata.classificationVersion === 'number'
  );
}



export async function getLocalCatalogImportMetadata(sourceId: string) {
  const normalizedSourceId = sourceId.trim();

  if (!normalizedSourceId) {
    return null;
  }

  const db = await openLocalCatalogDb();

  try {
    const metaTx = db.transaction(CATALOG_METADATA_STORE, 'readonly');
    const metaDone = waitForTransaction(metaTx);
    const record = await requestToPromise(
      metaTx
        .objectStore(CATALOG_METADATA_STORE)
        .get(importMetadataKey(normalizedSourceId)),
    ).catch(() => null);

    const aliasRecord = await requestToPromise(
      metaTx
        .objectStore(CATALOG_METADATA_STORE)
        .get(`xandeflix:source-alias:${normalizedSourceId}`),
    ).catch(() => null);

    const bindingRecord = await requestToPromise(
      metaTx
        .objectStore(CATALOG_METADATA_STORE)
        .get('xandeflix:source-binding-migration:v1'),
    ).catch(() => null);

    const repairRecord = await requestToPromise(
      metaTx
        .objectStore(CATALOG_METADATA_STORE)
        .get('xandeflix:repair-migration:v1'),
    ).catch(() => null);
    await metaDone;

    if (record && typeof record === 'object' && 'value' in record) {
      const value = (record as { value: unknown }).value;
      if (isLocalCatalogImportMetadata(value, normalizedSourceId)) {
        return value;
      }
    }

    const isBindingValid =
      Boolean(aliasRecord?.value) ||
      (bindingRecord?.value &&
        typeof bindingRecord.value === 'object' &&
        (bindingRecord.value as { status?: string }).status === 'COMPLETED' &&
        (bindingRecord.value as { boundSourceId?: string }).boundSourceId === normalizedSourceId);

    if (
      isBindingValid &&
      repairRecord?.value &&
      typeof repairRecord.value === 'object' &&
      (repairRecord.value as { status?: string }).status === 'COMPLETED'
    ) {
      const keptCount =
        (repairRecord.value as { keptCount?: number }).keptCount ?? 0;
      if (keptCount > 0) {
        return {
          sourceId: normalizedSourceId,
          sourceType: 'm3u',
          status: 'ready',
          startedAt: new Date().toISOString(),
          completedAt:
            (repairRecord.value as { completedAt?: string }).completedAt ??
            new Date().toISOString(),
          lastSuccessfulImportAt:
            (repairRecord.value as { completedAt?: string }).completedAt ??
            new Date().toISOString(),
          parsedCount: keptCount,
          importedCount: keptCount,
          updatedCount: 0,
          removedCount:
            (repairRecord.value as { removedCount?: number }).removedCount ??
            0,
          unknownCount: 0,
          withoutGroupCount: 0,
          classificationVersion: 1,
          errorCode: null,
        } satisfies LocalCatalogImportMetadata;
      }
    }

    return null;
  } finally {
    db.close();
  }
}

export async function putLocalCatalogImportMetadata(
  metadata: LocalCatalogImportMetadata,
) {
  if (!metadata.sourceId.trim()) {
    throw new Error('LOCAL_CATALOG_SOURCE_ID_REQUIRED');
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(CATALOG_METADATA_STORE, 'readwrite');
    const transactionDone = waitForTransaction(transaction);
    transaction.objectStore(CATALOG_METADATA_STORE).put({
      key: importMetadataKey(metadata.sourceId),
      value: metadata,
      updatedAt: new Date().toISOString(),
    });
    await transactionDone;
  } finally {
    db.close();
  }
}

function normalizeCategoryTitle(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function hashCategoryScope(sourceId: string) {
  let hash = 2166136261;

  for (let index = 0; index < sourceId.length; index += 1) {
    hash ^= sourceId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function categoryId(
  sourceId: string,
  contentKind: LocalCatalogContentKind,
  normalizedTitle: string,
) {
  const safeTitle = normalizedTitle.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `local-${hashCategoryScope(sourceId)}-${contentKind}-${safeTitle || 'uncategorized'}`;
}

export async function listLocalCatalogCategoryAggregates({
  sourceId,
  contentKind,
}: {
  sourceId: string;
  contentKind?: LocalCatalogContentKind;
}): Promise<LocalCatalogCategory[]> {
  const normalizedSourceId = sourceId.trim();

  if (!normalizedSourceId) {
    return [];
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(PLAYLIST_ITEMS_STORE, 'readonly');
    const transactionDone = waitForTransaction(transaction);
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);
    const cursorSource = contentKind
      ? store.index(SOURCE_ID_CONTENT_KIND_INDEX)
      : store.index(SOURCE_ID_INDEX);
    const range = contentKind
      ? IDBKeyRange.only([normalizedSourceId, contentKind])
      : IDBKeyRange.only(normalizedSourceId);
    const request = cursorSource.openCursor(range);
    const categories = new Map<string, LocalCatalogCategory>();

    await new Promise<void>((resolve, reject) => {
      request.onerror = () =>
        reject(request.error ?? new Error('LOCAL_CATALOG_CATEGORY_SCAN_FAILED'));
      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve();
          return;
        }

        const item = cursor.value as LocalCatalogItem;
        const isUnknownKind = item.contentKind === 'unknown';
        const originalTitle = item.groupTitle?.trim();
        const normalizedTitle = isUnknownKind
          ? 'nao classificados'
          : item.normalizedGroup?.trim() || normalizeCategoryTitle(originalTitle);
        const title = isUnknownKind
          ? 'Não classificados'
          : originalTitle || 'Não categorizados';
        const key = `${item.contentKind}:${normalizedTitle || 'uncategorized'}`;
        const current = categories.get(key);

        if (current) {
          current.itemCount += 1;
        } else {
          categories.set(key, {
            id: categoryId(
              normalizedSourceId,
              item.contentKind,
              normalizedTitle,
            ),
            title,
            normalizedTitle,
            contentKind: item.contentKind,
            itemCount: 1,
            isUncategorized: !originalTitle && !isUnknownKind,
            isUnknownKind,
          });
        }

        cursor.continue();
      };
    });

    await transactionDone;

    return Array.from(categories.values()).sort((first, second) => {
      if (first.isUnknownKind !== second.isUnknownKind) {
        return first.isUnknownKind ? 1 : -1;
      }

      if (first.isUncategorized !== second.isUncategorized) {
        return first.isUncategorized ? 1 : -1;
      }

      return first.title.localeCompare(second.title, 'pt-BR', {
        sensitivity: 'base',
      });
    });
  } finally {
    db.close();
  }
}

export async function deleteLocalCatalogItems(itemIds: string[]) {
  if (itemIds.length === 0) {
    return;
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(PLAYLIST_ITEMS_STORE, 'readwrite');
    const transactionDone = waitForTransaction(transaction);
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);

    for (const itemId of itemIds) {
      store.delete(itemId);
    }

    await transactionDone;
  } finally {
    db.close();
  }
}

export async function listLocalCatalogItems(
  input: ListLocalCatalogItemsInput = {},
) {
  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(PLAYLIST_ITEMS_STORE, 'readonly');
    const transactionDone = waitForTransaction(transaction);
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);
    const { source, range } = getPlaylistCursorSource(store, input);
    const items = await collectCursorResults(source, range, input);

    await transactionDone;

    return items;
  } finally {
    db.close();
  }
}

export async function countLocalCatalogItemsForSource(sourceId: string) {
  const normalizedSourceId = sourceId.trim();

  if (!normalizedSourceId) {
    return 0;
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(PLAYLIST_ITEMS_STORE, 'readonly');
    const transactionDone = waitForTransaction(transaction);
    const count = await requestToPromise(
      transaction
        .objectStore(PLAYLIST_ITEMS_STORE)
        .index(SOURCE_ID_INDEX)
        .count(IDBKeyRange.only(normalizedSourceId)),
    );
    await transactionDone;
    return count;
  } finally {
    db.close();
  }
}

export async function listLocalCatalogItemsAfterId(input: {
  sourceId: string;
  afterItemId: string | null;
  limit: number;
}) {
  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(PLAYLIST_ITEMS_STORE, 'readonly');
    const transactionDone = waitForTransaction(transaction);
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);
    const range = input.afterItemId
      ? IDBKeyRange.lowerBound(input.afterItemId, true)
      : undefined;
    const items = await collectCursorResults(store, range, {
      sourceId: input.sourceId,
      limit: input.limit,
    });

    await transactionDone;
    return items;
  } finally {
    db.close();
  }
}
