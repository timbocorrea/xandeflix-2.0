import {
  getLocalCatalogImportCheckpoint,
  getLocalCatalogScope,
  getLocalCatalogSnapshot,
  listLocalCatalogSnapshots,
  LOCAL_CATALOG_DB_VERSION,
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
  putLocalCatalogScope,
  putLocalCatalogSnapshot,
} from './localCatalogDb.service';
import {
  beginLocalCatalogStagingSnapshot,
  cancelLocalCatalogStagingSnapshot,
  commitLocalCatalogImportCheckpoint,
  evaluateLocalCatalogResume,
  failLocalCatalogStagingSnapshot,
  getReadableLocalCatalogActiveSnapshot,
  isLocalCatalogSnapshotTransitionAllowed,
  markLocalCatalogSnapshotReady,
  markLocalCatalogSnapshotValidating,
  promoteLocalCatalogStagingSnapshot,
} from './localCatalogSnapshotLifecycle.service';
import type {
  LocalCatalogScope,
  LocalCatalogSnapshot,
} from '../types/localCatalog.types';

const SCOPE = 'smoke:lifecycle:scope';
const ABORT_SCOPE = 'smoke:lifecycle:abort-scope';
const A = 'smoke-lifecycle-a';
const B = 'smoke-lifecycle-b';
const C = 'smoke-lifecycle-c';
const D = 'smoke-lifecycle-d';
const ABORT_ACTIVE = 'smoke-lifecycle-abort-active';
const ABORT_STAGING = 'smoke-lifecycle-abort-staging';
const REVISION = 'synthetic-revision';
const TIMESTAMP = '2000-01-01T00:00:00.000Z';

export type LocalCatalogSnapshotLifecycleSmokeTestResult = {
  ok: boolean;
  beginStagingAtomic: boolean;
  activePreservedDuringStaging: boolean;
  checkpointMonotonic: boolean;
  checkpointRegressionRejected: boolean;
  resumeEligibleAfterReopen: boolean;
  sourceMismatchRestartRequired: boolean;
  epochMismatchBlocked: boolean;
  validTransitionsAccepted: boolean;
  invalidTransitionRejected: boolean;
  promotionAtomic: boolean;
  exactlyOneActive: boolean;
  previousActiveSuperseded: boolean;
  checkpointRemovedAfterPromotion: boolean;
  cancelPreservesActive: boolean;
  failurePreservesActive: boolean;
  abortedPromotionRolledBack: boolean;
  stagingNeverReadableAsActive: boolean;
  syntheticCleanup: boolean;
  errorCode?: string;
};

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(new Error('LOCAL_CATALOG_SMOKE_TRANSACTION_FAILED'));
  });
}

async function cleanup() {
  const db = await openLocalCatalogDb();
  try {
    const stores = Object.values(LOCAL_CATALOG_V3_STORES);
    const transaction = db.transaction(stores, 'readwrite');
    const done = waitForTransaction(transaction);
    const snapshotIds = [A, B, C, D, ABORT_ACTIVE, ABORT_STAGING];
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).delete(SCOPE);
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).delete(ABORT_SCOPE);
    for (const snapshotId of snapshotIds) {
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).delete(snapshotId);
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints).delete(snapshotId);
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.metrics).delete(snapshotId);
    }
    await done;
  } finally { db.close(); }
}

function scopeRecord(scopeKey: string, activeSnapshotId: string): LocalCatalogScope {
  return {
    scopeKey, tenantScopeId: 'opaque-synthetic-tenant', sourceId: 'synthetic-source',
    activeSnapshotId, stagingSnapshotId: null, accessStatus: 'active', runtimeEpoch: 1,
    retentionPolicyVersion: 1, createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
  };
}

function snapshotRecord(snapshotId: string, scopeKey: string, status: 'active' | 'ready'): LocalCatalogSnapshot {
  return {
    snapshotId, scopeKey, status, sourceRevision: REVISION, classificationVersion: 1,
    schemaVersion: LOCAL_CATALOG_DB_VERSION, totalItems: status === 'active' ? 10 : 20,
    createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
    completedAt: status === 'active' ? TIMESTAMP : null, failureCode: null,
  };
}

const lifecycle = (snapshotId: string, timestamp = TIMESTAMP) => ({
  scopeKey: SCOPE, snapshotId, expectedRuntimeEpoch: 1, timestamp,
});

async function verifySyntheticCleanup() {
  const [scope, abortScope, ...snapshots] = await Promise.all([
    getLocalCatalogScope(SCOPE), getLocalCatalogScope(ABORT_SCOPE),
    ...[A, B, C, D, ABORT_ACTIVE, ABORT_STAGING].map(getLocalCatalogSnapshot),
  ]);
  return !scope && !abortScope && snapshots.every((snapshot) => !snapshot);
}

async function verifyAbortedPromotionRollback() {
  await putLocalCatalogScope({
    ...scopeRecord(ABORT_SCOPE, ABORT_ACTIVE), stagingSnapshotId: ABORT_STAGING,
  });
  await putLocalCatalogSnapshot(snapshotRecord(ABORT_ACTIVE, ABORT_SCOPE, 'active'));
  await putLocalCatalogSnapshot(snapshotRecord(ABORT_STAGING, ABORT_SCOPE, 'ready'));
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction([
      LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
    ], 'readwrite');
    const done = waitForTransaction(transaction);
    const scopeStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes);
    const snapshotStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots);
    scopeStore.put({ ...scopeRecord(ABORT_SCOPE, ABORT_STAGING), stagingSnapshotId: null });
    snapshotStore.put({ ...snapshotRecord(ABORT_ACTIVE, ABORT_SCOPE, 'active'), status: 'superseded' });
    snapshotStore.put({ ...snapshotRecord(ABORT_STAGING, ABORT_SCOPE, 'ready'), status: 'active' });
    transaction.abort();
    await done.catch(() => undefined);
  } finally { db.close(); }
  const [scope, active, staging] = await Promise.all([
    getLocalCatalogScope(ABORT_SCOPE), getLocalCatalogSnapshot(ABORT_ACTIVE),
    getLocalCatalogSnapshot(ABORT_STAGING),
  ]);
  return scope?.activeSnapshotId === ABORT_ACTIVE && scope.stagingSnapshotId === ABORT_STAGING &&
    active?.status === 'active' && staging?.status === 'ready';
}

export async function runLocalCatalogSnapshotLifecycleSmokeTest(): Promise<LocalCatalogSnapshotLifecycleSmokeTestResult> {
  const result: LocalCatalogSnapshotLifecycleSmokeTestResult = {
    ok: false, beginStagingAtomic: false, activePreservedDuringStaging: false,
    checkpointMonotonic: false, checkpointRegressionRejected: false,
    resumeEligibleAfterReopen: false, sourceMismatchRestartRequired: false,
    epochMismatchBlocked: false, validTransitionsAccepted: false,
    invalidTransitionRejected: false, promotionAtomic: false, exactlyOneActive: false,
    previousActiveSuperseded: false, checkpointRemovedAfterPromotion: false,
    cancelPreservesActive: false, failurePreservesActive: false,
    abortedPromotionRolledBack: false, stagingNeverReadableAsActive: false,
    syntheticCleanup: false,
  };
  try {
    await cleanup().catch(() => undefined);
    await putLocalCatalogScope(scopeRecord(SCOPE, A));
    await putLocalCatalogSnapshot(snapshotRecord(A, SCOPE, 'active'));
    await beginLocalCatalogStagingSnapshot({
      ...lifecycle(B), sourceRevision: REVISION, classificationVersion: 1,
      schemaVersion: LOCAL_CATALOG_DB_VERSION, parserVersion: 1,
    });
    const [scopeAfterBegin, snapshotB, readableDuringStaging] = await Promise.all([
      getLocalCatalogScope(SCOPE), getLocalCatalogSnapshot(B),
      getReadableLocalCatalogActiveSnapshot(SCOPE),
    ]);
    result.beginStagingAtomic = scopeAfterBegin?.stagingSnapshotId === B && snapshotB?.status === 'building';
    result.activePreservedDuringStaging = scopeAfterBegin?.activeSnapshotId === A;
    result.stagingNeverReadableAsActive = readableDuringStaging?.snapshotId === A;

    const checkpointBase = {
      scopeKey: SCOPE, snapshotId: B, expectedRuntimeEpoch: 1,
      sourceRevision: REVISION, sourceEtag: 'synthetic-etag',
      sourceLastModified: 'synthetic-last-modified', parserVersion: 1,
    };
    await commitLocalCatalogImportCheckpoint({
      ...checkpointBase, batchSequence: 1, confirmedItems: 10, confirmedBytes: 100,
      updatedAt: TIMESTAMP,
    });
    await commitLocalCatalogImportCheckpoint({
      ...checkpointBase, batchSequence: 2, confirmedItems: 20, confirmedBytes: 200,
      updatedAt: '2000-01-01T00:00:01.000Z',
    });
    const checkpoint = await getLocalCatalogImportCheckpoint(B);
    result.checkpointMonotonic = checkpoint?.batchSequence === 2 && checkpoint.confirmedItems === 20;
    try {
      await commitLocalCatalogImportCheckpoint({
        ...checkpointBase, batchSequence: 1, confirmedItems: 19, confirmedBytes: 199,
        updatedAt: '2000-01-01T00:00:02.000Z',
      });
    } catch (error) {
      const preserved = await getLocalCatalogImportCheckpoint(B);
      result.checkpointRegressionRejected = error instanceof Error &&
        error.message === 'LOCAL_CATALOG_CHECKPOINT_REGRESSION' && preserved?.confirmedItems === 20;
    }
    const resumeInput = {
      scopeKey: SCOPE, expectedRuntimeEpoch: 1, parserVersion: 1,
      sourceRevision: REVISION, sourceEtag: 'synthetic-etag',
      sourceLastModified: 'synthetic-last-modified',
    };
    result.resumeEligibleAfterReopen = (await evaluateLocalCatalogResume(resumeInput)).decision === 'resume_eligible';
    result.sourceMismatchRestartRequired = (await evaluateLocalCatalogResume({
      ...resumeInput, sourceRevision: 'synthetic-other-revision',
    })).decision === 'restart_required';
    result.epochMismatchBlocked = (await evaluateLocalCatalogResume({
      ...resumeInput, expectedRuntimeEpoch: 2,
    })).decision === 'blocked';
    try { await promoteLocalCatalogStagingSnapshot(lifecycle(B)); }
    catch (error) { result.invalidTransitionRejected = error instanceof Error && error.message === 'LOCAL_CATALOG_STAGING_MISMATCH'; }
    await markLocalCatalogSnapshotValidating(lifecycle(B));
    await markLocalCatalogSnapshotReady({ ...lifecycle(B), expectedTotalItems: 20 });
    result.validTransitionsAccepted = (await getLocalCatalogSnapshot(B))?.status === 'ready' &&
      isLocalCatalogSnapshotTransitionAllowed('ready', 'active');
    await promoteLocalCatalogStagingSnapshot(lifecycle(B, '2000-01-01T00:00:03.000Z'));
    const [promotedScope, promotedA, promotedB, promotedCheckpoint, snapshots] = await Promise.all([
      getLocalCatalogScope(SCOPE), getLocalCatalogSnapshot(A), getLocalCatalogSnapshot(B),
      getLocalCatalogImportCheckpoint(B), listLocalCatalogSnapshots(SCOPE),
    ]);
    result.promotionAtomic = promotedScope?.activeSnapshotId === B && promotedScope.stagingSnapshotId === null;
    result.exactlyOneActive = snapshots.filter((snapshot) => snapshot.status === 'active').length === 1;
    result.previousActiveSuperseded = promotedA?.status === 'superseded' && promotedB?.status === 'active';
    result.checkpointRemovedAfterPromotion = promotedCheckpoint === null;

    await beginLocalCatalogStagingSnapshot({
      ...lifecycle(C), sourceRevision: REVISION, classificationVersion: 1,
      schemaVersion: 3, parserVersion: 1,
    });
    await cancelLocalCatalogStagingSnapshot({
      ...lifecycle(C), failureCode: 'LOCAL_CATALOG_SMOKE_CANCELED',
    });
    const [scopeAfterCancel, canceled] = await Promise.all([
      getLocalCatalogScope(SCOPE), getLocalCatalogSnapshot(C),
    ]);
    result.cancelPreservesActive = scopeAfterCancel?.activeSnapshotId === B &&
      scopeAfterCancel.stagingSnapshotId === null && canceled?.status === 'canceled';

    await beginLocalCatalogStagingSnapshot({
      ...lifecycle(D), sourceRevision: REVISION, classificationVersion: 1,
      schemaVersion: 3, parserVersion: 1,
    });
    await failLocalCatalogStagingSnapshot({
      ...lifecycle(D), failureCode: 'LOCAL_CATALOG_SMOKE_FAILED', failureKind: 'transient',
    });
    const [scopeAfterFailure, failed, failedCheckpoint] = await Promise.all([
      getLocalCatalogScope(SCOPE), getLocalCatalogSnapshot(D),
      getLocalCatalogImportCheckpoint(D),
    ]);
    result.failurePreservesActive = scopeAfterFailure?.activeSnapshotId === B &&
      scopeAfterFailure.stagingSnapshotId === null && failed?.status === 'failed' &&
      failedCheckpoint !== null;
    result.abortedPromotionRolledBack = await verifyAbortedPromotionRollback();
    result.ok = Object.entries(result).every(([key, value]) => key === 'ok' || key === 'syntheticCleanup' || value === true);
  } catch {
    result.errorCode = 'LOCAL_CATALOG_SNAPSHOT_LIFECYCLE_SMOKE_FAILED';
  } finally {
    await cleanup().catch(() => undefined);
    result.syntheticCleanup = await verifySyntheticCleanup().catch(() => false);
    result.ok = result.ok && result.syntheticCleanup;
  }
  return result;
}
