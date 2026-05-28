import type {
  ListLocalCatalogItemsInput,
  LocalCatalogContentKind,
  LocalCatalogItem,
  LocalCatalogStats,
} from '../types/localCatalog.types';

const LOCAL_CATALOG_DB_NAME = 'xandeflix-local-catalog';
const LOCAL_CATALOG_DB_VERSION = 1;

const PLAYLIST_ITEMS_STORE = 'playlistItems';
const CATALOG_METADATA_STORE = 'catalogMetadata';
const TMDB_METADATA_STORE = 'tmdbMetadata';

const CONTENT_KINDS: LocalCatalogContentKind[] = [
  'live',
  'movie',
  'series',
  'unknown',
];

function getIndexedDbFactory() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('INDEXEDDB_UNAVAILABLE');
  }

  return window.indexedDB;
}

function createPlaylistItemsStore(db: IDBDatabase) {
  const store = db.createObjectStore(PLAYLIST_ITEMS_STORE, { keyPath: 'id' });

  store.createIndex('sourceId', 'sourceId', { unique: false });
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

function ensureObjectStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(PLAYLIST_ITEMS_STORE)) {
    createPlaylistItemsStore(db);
  }

  if (!db.objectStoreNames.contains(CATALOG_METADATA_STORE)) {
    createCatalogMetadataStore(db);
  }

  if (!db.objectStoreNames.contains(TMDB_METADATA_STORE)) {
    createTmdbMetadataStore(db);
  }
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('LOCAL_CATALOG_DB_REQUEST_FAILED'));
  });
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

      if (skippedItems < offset) {
        skippedItems += 1;
        cursor.continue();
        return;
      }

      items.push(cursor.value as LocalCatalogItem);

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
      ensureObjectStores(request.result);
    };

    request.onsuccess = () => resolve(request.result);
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

    await waitForTransaction(transaction);

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

export async function clearLocalCatalogDb() {
  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      [PLAYLIST_ITEMS_STORE, CATALOG_METADATA_STORE, TMDB_METADATA_STORE],
      'readwrite',
    );

    transaction.objectStore(PLAYLIST_ITEMS_STORE).clear();
    transaction.objectStore(CATALOG_METADATA_STORE).clear();
    transaction.objectStore(TMDB_METADATA_STORE).clear();

    await waitForTransaction(transaction);
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
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);

    for (const item of items) {
      store.put(item);
    }

    await waitForTransaction(transaction);
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
    const store = transaction.objectStore(PLAYLIST_ITEMS_STORE);
    const { source, range } = getPlaylistCursorSource(store, input);
    const items = await collectCursorResults(source, range, input);

    await waitForTransaction(transaction);

    return items;
  } finally {
    db.close();
  }
}
