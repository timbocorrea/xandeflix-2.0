import {
  getLocalCatalogImportCheckpoint,
  getLocalCatalogScope,
  getLocalCatalogSnapshot,
  inspectLocalCatalogSchema,
  LOCAL_CATALOG_DB_VERSION,
  LOCAL_CATALOG_V2_STORES,
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
  putLocalCatalogImportCheckpoint,
  putLocalCatalogScope,
  putLocalCatalogSnapshot,
} from './localCatalogDb.service';
import {
  decodeLocalCatalogPageCursor,
  encodeLocalCatalogPageCursor,
} from './localCatalogCursor.service';
import type {
  LocalCatalogImportCheckpoint,
  LocalCatalogScope,
  LocalCatalogSearchDocument,
  LocalCatalogSearchToken,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotMetrics,
} from '../types/localCatalog.types';

const SCOPE_KEY = 'smoke:tenant:source';
const SNAPSHOT_ID = 'smoke-snapshot-v3';

export type LocalCatalogSchemaSmokeTestResult = {
  ok: boolean;
  schemaVersion: number;
  legacyStoresPreserved: boolean;
  newStoresPresent: boolean;
  indexesPresent: boolean;
  scopeRoundTrip: boolean;
  snapshotRoundTrip: boolean;
  checkpointRoundTrip: boolean;
  searchDocumentSanitized: boolean;
  searchTokenSanitized: boolean;
  metricsSanitized: boolean;
  cursorRoundTrip: boolean;
  invalidCursorSanitized: boolean;
  errorCode?: string;
};

async function cleanup() {
  const db = await openLocalCatalogDb();
  try {
    const scopeStore = LOCAL_CATALOG_V3_STORES.scopes;
    const snapshotStore = LOCAL_CATALOG_V3_STORES.snapshots;
    const checkpointStore = LOCAL_CATALOG_V3_STORES.checkpoints;
    const searchDocumentStore = LOCAL_CATALOG_V3_STORES.searchDocuments;
    const searchTokenStore = LOCAL_CATALOG_V3_STORES.searchTokens;
    const metricsStore = LOCAL_CATALOG_V3_STORES.metrics;
    const stores = [
      scopeStore, snapshotStore, checkpointStore, searchDocumentStore,
      searchTokenStore, metricsStore,
    ];
    const transaction = db.transaction(stores, 'readwrite');
    transaction.objectStore(scopeStore).delete(SCOPE_KEY);
    transaction.objectStore(snapshotStore).delete(SNAPSHOT_ID);
    transaction.objectStore(checkpointStore).delete(SNAPSHOT_ID);
    transaction.objectStore(searchDocumentStore).delete([SNAPSHOT_ID, 'synthetic-document']);
    transaction.objectStore(searchTokenStore).delete([SNAPSHOT_ID, 'synthetic-term', 'synthetic-document']);
    transaction.objectStore(metricsStore).delete(SNAPSHOT_ID);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error('LOCAL_CATALOG_SMOKE_CLEANUP_FAILED'));
    });
  } finally { db.close(); }
}

function containsForbiddenOperationalField(value: object) {
  const forbiddenKeys = new Set([
    'streamUrl', 'playlistUrl', 'sourceUrl', 'licenseCode', 'password',
    'username', 'authorization', 'credentialToken',
  ]);
  return Object.keys(value).some((key) => forbiddenKeys.has(key));
}

async function putAndReadSanitizedRecords(
  searchDocument: LocalCatalogSearchDocument,
  searchToken: LocalCatalogSearchToken,
  metrics: LocalCatalogSnapshotMetrics,
) {
  const db = await openLocalCatalogDb();
  try {
    const stores = [
      LOCAL_CATALOG_V3_STORES.searchDocuments,
      LOCAL_CATALOG_V3_STORES.searchTokens,
      LOCAL_CATALOG_V3_STORES.metrics,
    ];
    const writeTransaction = db.transaction(stores, 'readwrite');
    writeTransaction.objectStore(stores[0]).put(searchDocument);
    writeTransaction.objectStore(stores[1]).put(searchToken);
    writeTransaction.objectStore(stores[2]).put(metrics);
    await new Promise<void>((resolve, reject) => {
      writeTransaction.oncomplete = () => resolve();
      writeTransaction.onabort = writeTransaction.onerror = () =>
        reject(new Error('LOCAL_CATALOG_SMOKE_WRITE_FAILED'));
    });
    const readTransaction = db.transaction(stores, 'readonly');
    const requests = [
      readTransaction.objectStore(stores[0]).get([SNAPSHOT_ID, searchDocument.documentId]),
      readTransaction.objectStore(stores[1]).get([SNAPSHOT_ID, searchToken.token, searchToken.documentId]),
      readTransaction.objectStore(stores[2]).get(SNAPSHOT_ID),
    ];
    return await Promise.all(requests.map((request) => new Promise<object>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as object);
      request.onerror = () => reject(new Error('LOCAL_CATALOG_SMOKE_READ_FAILED'));
    })));
  } finally {
    db.close();
  }
}

export async function runLocalCatalogSchemaSmokeTest(): Promise<LocalCatalogSchemaSmokeTestResult> {
  const timestamp = '2000-01-01T00:00:00.000Z';
  const scope: LocalCatalogScope = {
    scopeKey: SCOPE_KEY, tenantScopeId: 'opaque-tenant-smoke', sourceId: 'synthetic-source',
    activeSnapshotId: null, stagingSnapshotId: SNAPSHOT_ID, accessStatus: 'active',
    runtimeEpoch: 1, retentionPolicyVersion: 1, createdAt: timestamp, updatedAt: timestamp,
  };
  const snapshot: LocalCatalogSnapshot = {
    snapshotId: SNAPSHOT_ID, scopeKey: SCOPE_KEY, status: 'building', sourceRevision: null,
    classificationVersion: 1, schemaVersion: LOCAL_CATALOG_DB_VERSION, totalItems: 0,
    createdAt: timestamp, updatedAt: timestamp, completedAt: null, failureCode: null,
  };
  const checkpoint: LocalCatalogImportCheckpoint = {
    snapshotId: SNAPSHOT_ID, scopeKey: SCOPE_KEY, batchSequence: 1, confirmedItems: 2,
    confirmedBytes: 128, sourceEtag: null, sourceLastModified: null, sourceRevision: null,
    parserVersion: 1, updatedAt: timestamp,
  };
  const searchDocument: LocalCatalogSearchDocument = {
    snapshotId: SNAPSHOT_ID, documentId: 'synthetic-document', scopeKey: SCOPE_KEY,
    catalogItemId: 'synthetic-item', contentKind: 'movie', normalizedTitle: 'synthetic title',
    normalizedCategory: 'synthetic category', year: null, seasonNumber: null,
    episodeNumber: null, indexStatus: 'ready', updatedAt: timestamp,
  };
  const searchToken: LocalCatalogSearchToken = {
    snapshotId: SNAPSHOT_ID, token: 'synthetic-term', documentId: 'synthetic-document',
    weight: 1, position: 0, prefixLength: 4,
  };
  const metrics: LocalCatalogSnapshotMetrics = {
    snapshotId: SNAPSHOT_ID, totalRawItems: 1, totalMovies: 1, totalSeries: 0,
    totalEpisodes: 0, totalLive: 0, totalRadio: 0, totalUnknown: 0,
    totalCategories: 1, indexedSearchItems: 1, withPoster: 0, withBackdrop: 0,
    withMetadata: 0, tmdbMatched: 0, tmdbNoMatch: 0, tmdbError: 0,
    metadataPending: 1, duplicatesIgnored: 0, failedItems: 0, removedItems: 0,
    updatedAt: timestamp,
  };

  try {
    await cleanup().catch(() => undefined);
    const schema = await inspectLocalCatalogSchema();
    await putLocalCatalogScope(scope);
    await putLocalCatalogSnapshot(snapshot);
    await putLocalCatalogImportCheckpoint(checkpoint);
    const [storedScope, storedSnapshot, storedCheckpoint] = await Promise.all([
      getLocalCatalogScope(SCOPE_KEY), getLocalCatalogSnapshot(SNAPSHOT_ID),
      getLocalCatalogImportCheckpoint(SNAPSHOT_ID),
    ]);
    const [storedSearchDocument, storedSearchToken, storedMetrics] =
      await putAndReadSanitizedRecords(searchDocument, searchToken, metrics);
    const cursor = encodeLocalCatalogPageCursor({
      snapshotId: SNAPSHOT_ID, filterKey: 'kind:movie', lastKey: [10, 'synthetic-item'],
    });
    const decoded = decodeLocalCatalogPageCursor(cursor, {
      snapshotId: SNAPSHOT_ID, filterKey: 'kind:movie',
    });
    let invalidCursorSanitized = false;
    try { decodeLocalCatalogPageCursor('invalid', { snapshotId: SNAPSHOT_ID, filterKey: 'kind:movie' }); }
    catch (error) { invalidCursorSanitized = error instanceof Error && error.message === 'LOCAL_CATALOG_CURSOR_INVALID'; }
    const searchDocumentSanitized = !containsForbiddenOperationalField(storedSearchDocument);
    const searchTokenSanitized = !containsForbiddenOperationalField(storedSearchToken);
    const metricsSanitized = !containsForbiddenOperationalField(storedMetrics);

    const legacyStoresPreserved = LOCAL_CATALOG_V2_STORES.every((name) => name in schema.stores);
    const newStoresPresent = Object.values(LOCAL_CATALOG_V3_STORES).every((name) => name in schema.stores);
    const indexesPresent = schema.stores.catalogScopes?.includes('tenantScopeIdSourceId') === true &&
      schema.stores.importSnapshots?.includes('scopeKeyStatus') === true &&
      schema.stores.searchTokens?.includes('snapshotIdToken') === true;
    const result = {
      ok: schema.version === LOCAL_CATALOG_DB_VERSION && legacyStoresPreserved && newStoresPresent &&
        indexesPresent && storedScope?.scopeKey === SCOPE_KEY && storedSnapshot?.snapshotId === SNAPSHOT_ID &&
        storedCheckpoint?.confirmedItems === 2 && searchDocumentSanitized &&
        searchTokenSanitized && metricsSanitized &&
        decoded.lastKey instanceof Array && invalidCursorSanitized,
      schemaVersion: schema.version, legacyStoresPreserved, newStoresPresent, indexesPresent,
      scopeRoundTrip: storedScope?.scopeKey === SCOPE_KEY,
      snapshotRoundTrip: storedSnapshot?.snapshotId === SNAPSHOT_ID,
      checkpointRoundTrip: storedCheckpoint?.confirmedItems === 2,
      searchDocumentSanitized, searchTokenSanitized, metricsSanitized,
      cursorRoundTrip: decoded.lastKey instanceof Array,
      invalidCursorSanitized,
    };
    await cleanup();
    return result;
  } catch {
    await cleanup().catch(() => undefined);
    return {
      ok: false, schemaVersion: LOCAL_CATALOG_DB_VERSION, legacyStoresPreserved: false,
      newStoresPresent: false, indexesPresent: false, scopeRoundTrip: false,
      snapshotRoundTrip: false, checkpointRoundTrip: false, searchDocumentSanitized: false,
      searchTokenSanitized: false, metricsSanitized: false,
      cursorRoundTrip: false, invalidCursorSanitized: false,
      errorCode: 'LOCAL_CATALOG_SCHEMA_SMOKE_TEST_FAILED',
    };
  }
}
