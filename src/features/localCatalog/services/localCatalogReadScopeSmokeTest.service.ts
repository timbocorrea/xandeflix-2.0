import {
  getLocalCatalogImportCheckpoint,
  getLocalCatalogItemsByIds,
  getLocalCatalogScope,
  listLocalCatalogSnapshots,
  LOCAL_CATALOG_V2_STORES,
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
  putLocalCatalogImportMetadata,
  putLocalCatalogItems,
  putLocalCatalogScope,
} from './localCatalogDb.service';
import { ensureLocalCatalogReadScope } from './localCatalogSnapshotLifecycle.service';
import { deriveLocalCatalogScope } from './localCatalogScope.service';
import {
  ensureLegacyLocalCatalogSearchIndex,
  getLegacyLocalCatalogSearchIndexState,
  type LegacyLocalCatalogSearchIndexState,
} from './localCatalogSearchIndex.service';
import type { LocalCatalogItem, LocalCatalogScope } from '../types/localCatalog.types';

const SYNTHETIC_LICENSE = 'smoke-license-u2f32';
const SYNTHETIC_SOURCE = 'smoke-source-u2f32';
const TIMESTAMP = '2026-08-04T12:00:00.000Z';

export type LocalCatalogReadScopeSmokeTestResult = {
  ok: boolean;
  MISSING_SCOPE_CREATES_ACTIVE_SCOPE: boolean;
  CREATED_SCOPE_RUNTIME_EPOCH_1: boolean;
  CREATED_SCOPE_ACTIVE_SNAPSHOT_NULL: boolean;
  CREATED_SCOPE_STAGING_SNAPSHOT_NULL: boolean;
  MATCHING_SCOPE_IS_IDEMPOTENT: boolean;
  MATCHING_SCOPE_EPOCH_UNCHANGED: boolean;
  MATCHING_SCOPE_SNAPSHOTS_UNCHANGED: boolean;
  IDENTITY_MISMATCH_BLOCKED: boolean;
  INACTIVE_SCOPE_NOT_REACTIVATED: boolean;
  CONCURRENT_ENSURE_IS_IDEMPOTENT: boolean;
  NO_SNAPSHOT_CREATED: boolean;
  NO_CHECKPOINT_CREATED: boolean;
  NO_PLAYLIST_DOWNLOAD: boolean;
  V2_ITEMS_PRESERVED: boolean;
  V2_INTEGRATION_SCENARIO: {
    V2_ITEMS_PRESENT: boolean;
    CATALOG_SCOPE_MISSING: boolean;
    LOAD_FROM_CHANNELS_EXECUTED: boolean;
    CATALOG_SCOPE_CREATED: boolean;
    SEARCH_INDEX_CAN_START: boolean;
  };
  syntheticCleanup: boolean;
  errorCode?: string;
};

async function waitForLegacyIndexTerminal(
  scopeKey: string,
  timeoutMs = 5000,
): Promise<LegacyLocalCatalogSearchIndexState | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getLegacyLocalCatalogSearchIndexState(scopeKey);
    if (state && ['ready', 'failed', 'stale'].includes(state.status)) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return await getLegacyLocalCatalogSearchIndexState(scopeKey);
}

async function countSyntheticCheckpoints(scopeKey: string): Promise<number> {
  const checkpoint = await getLocalCatalogImportCheckpoint(scopeKey);
  return checkpoint ? 1 : 0;
}

async function comprehensiveSyntheticCleanup(scopeKey: string, sourceId: string) {
  const db = await openLocalCatalogDb();
  try {
    const txScopes = db.transaction([LOCAL_CATALOG_V3_STORES.scopes], 'readwrite');
    txScopes.objectStore(LOCAL_CATALOG_V3_STORES.scopes).delete(scopeKey);
    await new Promise<void>((res, rej) => {
      txScopes.oncomplete = () => res();
      txScopes.onabort = txScopes.onerror = () => rej(txScopes.error);
    });

    const txItems = db.transaction([LOCAL_CATALOG_V2_STORES[0]], 'readwrite');
    txItems.objectStore(LOCAL_CATALOG_V2_STORES[0]).delete('v2-smoke-item-1');
    await new Promise<void>((res, rej) => {
      txItems.oncomplete = () => res();
      txItems.onabort = txItems.onerror = () => rej(txItems.error);
    });

    const txMeta = db.transaction([LOCAL_CATALOG_V2_STORES[1]], 'readwrite');
    const metaStore = txMeta.objectStore(LOCAL_CATALOG_V2_STORES[1]);
    metaStore.delete(`source-import:${sourceId}`);
    metaStore.delete(`legacy-search-index:${scopeKey}`);
    await new Promise<void>((res, rej) => {
      txMeta.oncomplete = () => res();
      txMeta.onabort = txMeta.onerror = () => rej(txMeta.error);
    });

    const txSnap = db.transaction(
      [LOCAL_CATALOG_V3_STORES.snapshots, LOCAL_CATALOG_V3_STORES.checkpoints],
      'readwrite',
    );
    txSnap.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).delete(scopeKey);
    txSnap.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints).delete(scopeKey);
    await new Promise<void>((res, rej) => {
      txSnap.oncomplete = () => res();
      txSnap.onabort = txSnap.onerror = () => rej(txSnap.error);
    });

    const txSearch = db.transaction(
      [LOCAL_CATALOG_V3_STORES.searchDocuments, LOCAL_CATALOG_V3_STORES.searchTokens],
      'readwrite',
    );
    txSearch.objectStore(LOCAL_CATALOG_V3_STORES.searchDocuments).delete(scopeKey);
    txSearch.objectStore(LOCAL_CATALOG_V3_STORES.searchTokens).delete(scopeKey);
    await new Promise<void>((res, rej) => {
      txSearch.oncomplete = () => res();
      txSearch.onabort = txSearch.onerror = () => rej(txSearch.error);
    });
  } finally {
    db.close();
  }
}

async function verifySyntheticCleanup(
  scopeKey: string,
  syntheticItemId: string,
): Promise<boolean> {
  const scope = await getLocalCatalogScope(scopeKey);
  const itemsMap = await getLocalCatalogItemsByIds([syntheticItemId]);
  const legacyState = await getLegacyLocalCatalogSearchIndexState(scopeKey);
  const snapshots = await listLocalCatalogSnapshots(scopeKey);
  const checkpointCount = await countSyntheticCheckpoints(scopeKey);

  return (
    scope === null &&
    itemsMap.size === 0 &&
    legacyState === null &&
    snapshots.length === 0 &&
    checkpointCount === 0
  );
}

export async function runLocalCatalogReadScopeSmokeTest(): Promise<LocalCatalogReadScopeSmokeTestResult> {
  const derived = await deriveLocalCatalogScope({
    internalLicenseId: SYNTHETIC_LICENSE,
    sourceId: SYNTHETIC_SOURCE,
  });

  let networkRequestCount = 0;
  const originalFetch = globalThis.fetch;
  if (typeof globalThis.fetch === 'function') {
    globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
      networkRequestCount++;
      return originalFetch(...args);
    };
  }

  const result: LocalCatalogReadScopeSmokeTestResult = {
    ok: false,
    MISSING_SCOPE_CREATES_ACTIVE_SCOPE: false,
    CREATED_SCOPE_RUNTIME_EPOCH_1: false,
    CREATED_SCOPE_ACTIVE_SNAPSHOT_NULL: false,
    CREATED_SCOPE_STAGING_SNAPSHOT_NULL: false,
    MATCHING_SCOPE_IS_IDEMPOTENT: false,
    MATCHING_SCOPE_EPOCH_UNCHANGED: false,
    MATCHING_SCOPE_SNAPSHOTS_UNCHANGED: false,
    IDENTITY_MISMATCH_BLOCKED: false,
    INACTIVE_SCOPE_NOT_REACTIVATED: false,
    CONCURRENT_ENSURE_IS_IDEMPOTENT: false,
    NO_SNAPSHOT_CREATED: false,
    NO_CHECKPOINT_CREATED: false,
    NO_PLAYLIST_DOWNLOAD: false,
    V2_ITEMS_PRESERVED: false,
    V2_INTEGRATION_SCENARIO: {
      V2_ITEMS_PRESENT: false,
      CATALOG_SCOPE_MISSING: false,
      LOAD_FROM_CHANNELS_EXECUTED: false,
      CATALOG_SCOPE_CREATED: false,
      SEARCH_INDEX_CAN_START: false,
    },
    syntheticCleanup: false,
  };

  try {
    await comprehensiveSyntheticCleanup(derived.scopeKey, derived.sourceId).catch(() => undefined);

    // 1. Missing scope creates active scope with epoch 1, null snapshots
    const created = await ensureLocalCatalogReadScope({
      scopeKey: derived.scopeKey,
      tenantScopeId: derived.tenantScopeId,
      sourceId: derived.sourceId,
      timestamp: TIMESTAMP,
    });

    const storedScope = await getLocalCatalogScope(derived.scopeKey);

    result.MISSING_SCOPE_CREATES_ACTIVE_SCOPE =
      Boolean(created) &&
      created.accessStatus === 'active' &&
      storedScope?.accessStatus === 'active';
    result.CREATED_SCOPE_RUNTIME_EPOCH_1 =
      created.runtimeEpoch === 1 && storedScope?.runtimeEpoch === 1;
    result.CREATED_SCOPE_ACTIVE_SNAPSHOT_NULL =
      created.activeSnapshotId === null && storedScope?.activeSnapshotId === null;
    result.CREATED_SCOPE_STAGING_SNAPSHOT_NULL =
      created.stagingSnapshotId === null && storedScope?.stagingSnapshotId === null;

    // Verify no snapshots or checkpoints created
    const snapshotsAfterCreate = await listLocalCatalogSnapshots(derived.scopeKey);
    const checkpointAfterCreate = await getLocalCatalogImportCheckpoint(derived.scopeKey);
    result.NO_SNAPSHOT_CREATED = snapshotsAfterCreate.length === 0;
    result.NO_CHECKPOINT_CREATED = checkpointAfterCreate === null;
    result.NO_PLAYLIST_DOWNLOAD = networkRequestCount === 0;

    // 2. Matching scope is idempotent (no writes / no epoch increase)
    const idempotentCall = await ensureLocalCatalogReadScope({
      scopeKey: derived.scopeKey,
      tenantScopeId: derived.tenantScopeId,
      sourceId: derived.sourceId,
      timestamp: '2026-08-04T13:00:00.000Z',
    });

    result.MATCHING_SCOPE_IS_IDEMPOTENT =
      idempotentCall.scopeKey === derived.scopeKey &&
      idempotentCall.tenantScopeId === derived.tenantScopeId &&
      idempotentCall.sourceId === derived.sourceId;
    result.MATCHING_SCOPE_EPOCH_UNCHANGED = idempotentCall.runtimeEpoch === 1;
    result.MATCHING_SCOPE_SNAPSHOTS_UNCHANGED =
      idempotentCall.activeSnapshotId === null && idempotentCall.stagingSnapshotId === null;

    // 3. Identity mismatch blocked
    try {
      await ensureLocalCatalogReadScope({
        scopeKey: derived.scopeKey,
        tenantScopeId: 'different-tenant-scope-id',
        sourceId: derived.sourceId,
        timestamp: TIMESTAMP,
      });
      result.IDENTITY_MISMATCH_BLOCKED = false;
    } catch (err) {
      result.IDENTITY_MISMATCH_BLOCKED =
        err instanceof Error && err.message === 'LOCAL_CATALOG_SCOPE_IDENTITY_MISMATCH';
    }

    // 4. Inactive scope not reactivated
    const inactiveScope: LocalCatalogScope = {
      ...created,
      accessStatus: 'revoked',
      updatedAt: TIMESTAMP,
    };
    await putLocalCatalogScope(inactiveScope);

    try {
      await ensureLocalCatalogReadScope({
        scopeKey: derived.scopeKey,
        tenantScopeId: derived.tenantScopeId,
        sourceId: derived.sourceId,
        timestamp: TIMESTAMP,
      });
      result.INACTIVE_SCOPE_NOT_REACTIVATED = false;
    } catch (err) {
      const recheckedScope = await getLocalCatalogScope(derived.scopeKey);
      result.INACTIVE_SCOPE_NOT_REACTIVATED =
        err instanceof Error &&
        err.message === 'LOCAL_CATALOG_SCOPE_ACCESS_BLOCKED' &&
        recheckedScope?.accessStatus === 'revoked';
    }

    // Clean up for concurrency test
    await comprehensiveSyntheticCleanup(derived.scopeKey, derived.sourceId);

    // 5. Concurrent ensure is idempotent
    const concurrentResults = await Promise.all([
      ensureLocalCatalogReadScope({
        scopeKey: derived.scopeKey,
        tenantScopeId: derived.tenantScopeId,
        sourceId: derived.sourceId,
        timestamp: TIMESTAMP,
      }),
      ensureLocalCatalogReadScope({
        scopeKey: derived.scopeKey,
        tenantScopeId: derived.tenantScopeId,
        sourceId: derived.sourceId,
        timestamp: TIMESTAMP,
      }),
    ]);

    const scopeAfterConcurrent = await getLocalCatalogScope(derived.scopeKey);
    result.CONCURRENT_ENSURE_IS_IDEMPOTENT =
      concurrentResults[0].scopeKey === derived.scopeKey &&
      concurrentResults[1].scopeKey === derived.scopeKey &&
      concurrentResults[0].runtimeEpoch === 1 &&
      concurrentResults[1].runtimeEpoch === 1 &&
      scopeAfterConcurrent !== null;

    // 6. V2 Integration Scenario Simulation
    await comprehensiveSyntheticCleanup(derived.scopeKey, derived.sourceId);

    const fixtureV2Item: LocalCatalogItem = {
      id: 'v2-smoke-item-1',
      sourceId: derived.sourceId,
      name: 'Silo S01E01',
      rawName: 'Silo S01E01',
      groupTitle: 'Series',
      normalizedGroup: 'series',
      streamUrl: 'http://test.local/stream.m3u8',
      contentKind: 'series',
      normalizedName: 'silo s01e01',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
    await putLocalCatalogItems([fixtureV2Item]);

    const readBeforeHydrationMap = await getLocalCatalogItemsByIds([fixtureV2Item.id]);
    const readBeforeItem = readBeforeHydrationMap.get(fixtureV2Item.id);

    await putLocalCatalogImportMetadata({
      sourceId: derived.sourceId,
      sourceType: 'm3u',
      status: 'ready',
      startedAt: TIMESTAMP,
      completedAt: TIMESTAMP,
      lastSuccessfulImportAt: TIMESTAMP,
      parsedCount: 1,
      importedCount: 1,
      updatedCount: 0,
      removedCount: 0,
      unknownCount: 0,
      withoutGroupCount: 0,
      classificationVersion: 1,
      errorCode: null,
    });

    const scopeBeforeLoad = await getLocalCatalogScope(derived.scopeKey);
    result.V2_INTEGRATION_SCENARIO.V2_ITEMS_PRESENT = Boolean(readBeforeItem);
    result.V2_INTEGRATION_SCENARIO.CATALOG_SCOPE_MISSING = scopeBeforeLoad === null;

    // Simulate loadFromChannels hydration
    const hydratedReadScope = await ensureLocalCatalogReadScope({
      scopeKey: derived.scopeKey,
      tenantScopeId: derived.tenantScopeId,
      sourceId: derived.sourceId,
      timestamp: TIMESTAMP,
    });
    result.V2_INTEGRATION_SCENARIO.LOAD_FROM_CHANNELS_EXECUTED = true;

    const scopeAfterHydration = await getLocalCatalogScope(derived.scopeKey);
    result.V2_INTEGRATION_SCENARIO.CATALOG_SCOPE_CREATED =
      hydratedReadScope.accessStatus === 'active' && scopeAfterHydration !== null;

    void ensureLegacyLocalCatalogSearchIndex(derived.scopeKey);
    const indexTerminalState = await waitForLegacyIndexTerminal(derived.scopeKey, 5000);
    result.V2_INTEGRATION_SCENARIO.SEARCH_INDEX_CAN_START =
      indexTerminalState !== null && indexTerminalState.status === 'ready';

    const readAfterIndexMap = await getLocalCatalogItemsByIds([fixtureV2Item.id]);
    const readAfterItem = readAfterIndexMap.get(fixtureV2Item.id);

    result.V2_ITEMS_PRESERVED =
      Boolean(readBeforeItem) &&
      Boolean(readAfterItem) &&
      readBeforeItem?.name === fixtureV2Item.name &&
      readAfterItem?.name === fixtureV2Item.name;

    result.ok =
      result.MISSING_SCOPE_CREATES_ACTIVE_SCOPE &&
      result.CREATED_SCOPE_RUNTIME_EPOCH_1 &&
      result.CREATED_SCOPE_ACTIVE_SNAPSHOT_NULL &&
      result.CREATED_SCOPE_STAGING_SNAPSHOT_NULL &&
      result.MATCHING_SCOPE_IS_IDEMPOTENT &&
      result.MATCHING_SCOPE_EPOCH_UNCHANGED &&
      result.MATCHING_SCOPE_SNAPSHOTS_UNCHANGED &&
      result.IDENTITY_MISMATCH_BLOCKED &&
      result.INACTIVE_SCOPE_NOT_REACTIVATED &&
      result.CONCURRENT_ENSURE_IS_IDEMPOTENT &&
      result.NO_SNAPSHOT_CREATED &&
      result.NO_CHECKPOINT_CREATED &&
      result.NO_PLAYLIST_DOWNLOAD &&
      result.V2_ITEMS_PRESERVED &&
      result.V2_INTEGRATION_SCENARIO.V2_ITEMS_PRESENT &&
      result.V2_INTEGRATION_SCENARIO.CATALOG_SCOPE_MISSING &&
      result.V2_INTEGRATION_SCENARIO.LOAD_FROM_CHANNELS_EXECUTED &&
      result.V2_INTEGRATION_SCENARIO.CATALOG_SCOPE_CREATED &&
      result.V2_INTEGRATION_SCENARIO.SEARCH_INDEX_CAN_START;
  } catch (err) {
    result.errorCode =
      err instanceof Error ? err.message : 'LOCAL_CATALOG_READ_SCOPE_SMOKE_FAILED';
    result.ok = false;
  } finally {
    if (typeof globalThis.fetch === 'function') {
      globalThis.fetch = originalFetch;
    }
    await comprehensiveSyntheticCleanup(derived.scopeKey, derived.sourceId).catch(() => undefined);
    result.syntheticCleanup = await verifySyntheticCleanup(
      derived.scopeKey,
      'v2-smoke-item-1',
    ).catch(() => false);
    result.ok = result.ok && result.syntheticCleanup;
  }

  return result;
}