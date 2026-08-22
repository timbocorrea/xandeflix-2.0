import {
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
} from '../services/localCatalogDb.service';
import type {
  LocalCatalogImportCheckpoint,
  LocalCatalogResumeDecision,
  LocalCatalogScope,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotFailureKind,
  LocalCatalogSnapshotMetrics,
  LocalCatalogSnapshotCategory,
  LocalCatalogSnapshotItem,
  LocalCatalogSnapshotPromotionResult,
  LocalCatalogSnapshotStatus,
} from '../types/localCatalog.types';

const ALLOWED_TRANSITIONS: Record<LocalCatalogSnapshotStatus, LocalCatalogSnapshotStatus[]> = {
  building: ['validating', 'failed', 'canceled'],
  validating: ['ready', 'failed', 'canceled'],
  ready: ['active', 'failed', 'canceled'],
  active: ['superseded'],
  superseded: [],
  failed: [],
  canceled: [],
};

type BeginStagingInput = {
  scopeKey: string; snapshotId: string; expectedRuntimeEpoch: number;
  sourceRevision: string | null; classificationVersion: number; schemaVersion: number;
  parserVersion: number; timestamp: string;
};

type CheckpointInput = {
  scopeKey: string; snapshotId: string; expectedRuntimeEpoch: number;
  batchSequence: number; confirmedItems: number; confirmedBytes: number;
  sourceRevision: string | null; sourceEtag: string | null;
  sourceLastModified: string | null; parserVersion: number; updatedAt: string;
};

type LifecycleInput = {
  scopeKey: string; snapshotId: string; expectedRuntimeEpoch: number; timestamp: string;
};

type WriteFenceInput = Pick<
  LifecycleInput,
  'scopeKey' | 'snapshotId' | 'expectedRuntimeEpoch'
>;

type ResumeInput = {
  scopeKey: string; expectedRuntimeEpoch: number; parserVersion: number;
  sourceRevision: string | null; sourceEtag: string | null;
  sourceLastModified: string | null;
};

function code(value: string): Error { return new Error(value); }

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(code('LOCAL_CATALOG_DB_REQUEST_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(code('LOCAL_CATALOG_DB_TRANSACTION_FAILED'));
  });
}

async function runTransaction<T>(
  stores: string[], mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<T>,
) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(stores, mode);
    const done = transactionDone(transaction);
    try {
      const result = await operation(transaction);
      await done;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch { /* Transaction may already be inactive. */ }
      await done.catch(() => undefined);
      throw error;
    }
  } finally { db.close(); }
}

function assertNonNegativeIntegers(...values: number[]) {
  if (values.some((value) => !Number.isInteger(value) || value < 0))
    throw code('LOCAL_CATALOG_CHECKPOINT_INVALID');
}

function assertTransition(from: LocalCatalogSnapshotStatus, to: LocalCatalogSnapshotStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to))
    throw code('LOCAL_CATALOG_SNAPSHOT_TRANSITION_INVALID');
}

async function getScope(transaction: IDBTransaction, scopeKey: string) {
  const value = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).get(scopeKey));
  if (!value) throw code('LOCAL_CATALOG_SCOPE_NOT_FOUND');
  return value as LocalCatalogScope;
}

async function getSnapshot(transaction: IDBTransaction, snapshotId: string) {
  const value = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).get(snapshotId));
  if (!value) throw code('LOCAL_CATALOG_SNAPSHOT_NOT_FOUND');
  return value as LocalCatalogSnapshot;
}

function assertScopeFence(scope: LocalCatalogScope, expectedRuntimeEpoch: number) {
  if (scope.accessStatus !== 'active') throw code('LOCAL_CATALOG_SCOPE_ACCESS_BLOCKED');
  if (scope.runtimeEpoch !== expectedRuntimeEpoch)
    throw code('LOCAL_CATALOG_RUNTIME_EPOCH_MISMATCH');
}

async function assertWriteFence(
  transaction: IDBTransaction, input: WriteFenceInput,
  statuses: LocalCatalogSnapshotStatus[],
) {
  const scope = await getScope(transaction, input.scopeKey);
  assertScopeFence(scope, input.expectedRuntimeEpoch);
  if (scope.stagingSnapshotId !== input.snapshotId)
    throw code('LOCAL_CATALOG_STAGING_MISMATCH');
  const snapshot = await getSnapshot(transaction, input.snapshotId);
  if (snapshot.scopeKey !== input.scopeKey || !statuses.includes(snapshot.status))
    throw code('LOCAL_CATALOG_STAGING_MISMATCH');
  return { scope, snapshot };
}

function validatorsMatch(current: string | null, next: string | null) {
  return !current || !next || current === next;
}

export function isLocalCatalogSnapshotTransitionAllowed(
  from: LocalCatalogSnapshotStatus, to: LocalCatalogSnapshotStatus,
) { return ALLOWED_TRANSITIONS[from].includes(to); }

export async function prepareLocalCatalogRuntimeScope(input: {
  scopeKey: string;
  tenantScopeId: string;
  sourceId: string;
  timestamp: string;
}) {
  if (!input.scopeKey || !input.tenantScopeId || !input.sourceId)
    throw code('LOCAL_CATALOG_SCOPE_ID_INVALID');

  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes,
    LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.checkpoints,
  ], 'readwrite', async (transaction) => {
    const scopeStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes);
    const snapshotStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots);
    const checkpointStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints);
    const storedScope = await requestResult(scopeStore.get(input.scopeKey)) as
      LocalCatalogScope | undefined;

    if (!storedScope) {
      const created: LocalCatalogScope = {
        scopeKey: input.scopeKey,
        tenantScopeId: input.tenantScopeId,
        sourceId: input.sourceId,
        activeSnapshotId: null,
        stagingSnapshotId: null,
        accessStatus: 'active',
        runtimeEpoch: 1,
        retentionPolicyVersion: 1,
        createdAt: input.timestamp,
        updatedAt: input.timestamp,
      };
      await requestResult(scopeStore.add(created));
      return created;
    }

    if (
      storedScope.tenantScopeId !== input.tenantScopeId ||
      storedScope.sourceId !== input.sourceId
    ) {
      throw code('LOCAL_CATALOG_SCOPE_IDENTITY_MISMATCH');
    }
    if (storedScope.accessStatus !== 'active')
      throw code('LOCAL_CATALOG_SCOPE_ACCESS_BLOCKED');

    if (storedScope.stagingSnapshotId) {
      const staging = await requestResult(
        snapshotStore.get(storedScope.stagingSnapshotId),
      ) as LocalCatalogSnapshot | undefined;

      if (staging?.status === 'active')
        throw code('LOCAL_CATALOG_ACTIVE_SNAPSHOT_CONFLICT');
      if (staging && staging.scopeKey !== input.scopeKey)
        throw code('LOCAL_CATALOG_STAGING_MISMATCH');

      if (staging?.status === 'building' || staging?.status === 'validating') {
        await requestResult(snapshotStore.put({
          ...staging,
          status: 'canceled',
          failureCode: 'LOCAL_CATALOG_RUNTIME_SESSION_REPLACED',
          updatedAt: input.timestamp,
          completedAt: input.timestamp,
        } satisfies LocalCatalogSnapshot));
        await requestResult(checkpointStore.delete(staging.snapshotId));
      } else if (
        staging?.status === 'failed' ||
        staging?.status === 'canceled' ||
        staging?.status === 'superseded'
      ) {
        await requestResult(checkpointStore.delete(storedScope.stagingSnapshotId));
      }
      // A ready snapshot is retained but detached. It is never promoted implicitly.
    }

    const prepared: LocalCatalogScope = {
      ...storedScope,
      stagingSnapshotId: null,
      runtimeEpoch: storedScope.runtimeEpoch + 1,
      updatedAt: input.timestamp,
    };
    await requestResult(scopeStore.put(prepared));
    return prepared;
  });
}

export async function beginLocalCatalogStagingSnapshot(input: BeginStagingInput) {
  assertNonNegativeIntegers(
    input.expectedRuntimeEpoch, input.classificationVersion, input.schemaVersion,
    input.parserVersion,
  );
  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.checkpoints,
  ], 'readwrite', async (transaction) => {
    const scope = await getScope(transaction, input.scopeKey);
    assertScopeFence(scope, input.expectedRuntimeEpoch);
    if (scope.stagingSnapshotId) throw code('LOCAL_CATALOG_STAGING_MISMATCH');
    const snapshotStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots);
    if (await requestResult(snapshotStore.get(input.snapshotId)))
      throw code('LOCAL_CATALOG_SNAPSHOT_ALREADY_EXISTS');
    const snapshot: LocalCatalogSnapshot = {
      snapshotId: input.snapshotId, scopeKey: input.scopeKey, status: 'building',
      sourceRevision: input.sourceRevision, classificationVersion: input.classificationVersion,
      schemaVersion: input.schemaVersion, totalItems: 0, createdAt: input.timestamp,
      updatedAt: input.timestamp, completedAt: null, failureCode: null,
    };
    const checkpoint: LocalCatalogImportCheckpoint = {
      snapshotId: input.snapshotId, scopeKey: input.scopeKey, batchSequence: 0,
      confirmedItems: 0, confirmedBytes: 0, sourceEtag: null,
      sourceLastModified: null, sourceRevision: input.sourceRevision,
      parserVersion: input.parserVersion, updatedAt: input.timestamp,
    };
    await requestResult(snapshotStore.add(snapshot));
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints).add(checkpoint));
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).put({
      ...scope, stagingSnapshotId: input.snapshotId, updatedAt: input.timestamp,
    }));
    return snapshot;
  });
}

export async function commitLocalCatalogImportCheckpoint(input: CheckpointInput) {
  assertNonNegativeIntegers(
    input.expectedRuntimeEpoch, input.batchSequence, input.confirmedItems,
    input.confirmedBytes, input.parserVersion,
  );
  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.checkpoints,
  ], 'readwrite', async (transaction) => {
    const { snapshot } = await assertWriteFence(transaction, input, ['building']);
    const checkpointStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints);
    const current = await requestResult(checkpointStore.get(input.snapshotId)) as
      LocalCatalogImportCheckpoint | undefined;
    if (!current || current.scopeKey !== input.scopeKey)
      throw code('LOCAL_CATALOG_CHECKPOINT_INVALID');
    if (input.batchSequence < current.batchSequence ||
        input.confirmedItems < current.confirmedItems ||
        input.confirmedBytes < current.confirmedBytes)
      throw code('LOCAL_CATALOG_CHECKPOINT_REGRESSION');
    if (input.parserVersion !== current.parserVersion)
      throw code('LOCAL_CATALOG_PARSER_VERSION_MISMATCH');
    if (input.sourceRevision !== current.sourceRevision)
      throw code('LOCAL_CATALOG_SOURCE_REVISION_MISMATCH');
    if (!validatorsMatch(current.sourceEtag, input.sourceEtag) ||
        !validatorsMatch(current.sourceLastModified, input.sourceLastModified))
      throw code('LOCAL_CATALOG_SOURCE_VALIDATOR_MISMATCH');
    const next: LocalCatalogImportCheckpoint = {
      snapshotId: input.snapshotId, scopeKey: input.scopeKey,
      batchSequence: input.batchSequence, confirmedItems: input.confirmedItems,
      confirmedBytes: input.confirmedBytes, sourceEtag: input.sourceEtag,
      sourceLastModified: input.sourceLastModified,
      sourceRevision: input.sourceRevision, parserVersion: input.parserVersion,
      updatedAt: input.updatedAt,
    };
    await requestResult(checkpointStore.put(next));
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).put({
      ...snapshot, totalItems: input.confirmedItems, updatedAt: input.updatedAt,
    }));
    return next;
  });
}

export async function evaluateLocalCatalogResume(input: ResumeInput): Promise<LocalCatalogResumeDecision> {
  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.checkpoints,
  ], 'readonly', async (transaction) => {
    const rawScope = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).get(input.scopeKey));
    if (!rawScope) return { decision: 'restart_required', reasonCode: 'LOCAL_CATALOG_SCOPE_NOT_FOUND', snapshotId: null, checkpoint: null };
    const scope = rawScope as LocalCatalogScope;
    if (scope.accessStatus !== 'active') return { decision: 'blocked', reasonCode: 'LOCAL_CATALOG_SCOPE_ACCESS_BLOCKED', snapshotId: scope.stagingSnapshotId, checkpoint: null };
    if (scope.runtimeEpoch !== input.expectedRuntimeEpoch) return { decision: 'blocked', reasonCode: 'LOCAL_CATALOG_RUNTIME_EPOCH_MISMATCH', snapshotId: scope.stagingSnapshotId, checkpoint: null };
    if (!scope.stagingSnapshotId) return { decision: 'restart_required', reasonCode: 'LOCAL_CATALOG_STAGING_MISSING', snapshotId: null, checkpoint: null };
    const rawSnapshot = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).get(scope.stagingSnapshotId));
    if (!rawSnapshot || (rawSnapshot as LocalCatalogSnapshot).scopeKey !== input.scopeKey || (rawSnapshot as LocalCatalogSnapshot).status !== 'building')
      return { decision: 'restart_required', reasonCode: 'LOCAL_CATALOG_STAGING_INCONSISTENT', snapshotId: scope.stagingSnapshotId, checkpoint: null };
    const rawCheckpoint = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints).get(scope.stagingSnapshotId));
    if (!rawCheckpoint) return { decision: 'restart_required', reasonCode: 'LOCAL_CATALOG_CHECKPOINT_MISSING', snapshotId: scope.stagingSnapshotId, checkpoint: null };
    const checkpoint = rawCheckpoint as LocalCatalogImportCheckpoint;
    const safe = { batchSequence: checkpoint.batchSequence, confirmedItems: checkpoint.confirmedItems, confirmedBytes: checkpoint.confirmedBytes, parserVersion: checkpoint.parserVersion, updatedAt: checkpoint.updatedAt };
    if ([safe.batchSequence, safe.confirmedItems, safe.confirmedBytes, safe.parserVersion].some((value) => !Number.isInteger(value) || value < 0))
      return { decision: 'restart_required', reasonCode: 'LOCAL_CATALOG_CHECKPOINT_INVALID', snapshotId: scope.stagingSnapshotId, checkpoint: null };
    if (checkpoint.parserVersion !== input.parserVersion) return { decision: 'restart_required', reasonCode: 'LOCAL_CATALOG_PARSER_VERSION_MISMATCH', snapshotId: scope.stagingSnapshotId, checkpoint: safe };
    if (checkpoint.sourceRevision !== input.sourceRevision) return { decision: 'restart_required', reasonCode: 'LOCAL_CATALOG_SOURCE_REVISION_MISMATCH', snapshotId: scope.stagingSnapshotId, checkpoint: safe };
    if (!validatorsMatch(checkpoint.sourceEtag, input.sourceEtag) || !validatorsMatch(checkpoint.sourceLastModified, input.sourceLastModified))
      return { decision: 'restart_required', reasonCode: 'LOCAL_CATALOG_SOURCE_VALIDATOR_MISMATCH', snapshotId: scope.stagingSnapshotId, checkpoint: safe };
    return { decision: 'resume_eligible', reasonCode: 'LOCAL_CATALOG_RESUME_ELIGIBLE', snapshotId: scope.stagingSnapshotId, checkpoint: safe };
  });
}

async function transitionStaging(input: LifecycleInput, from: LocalCatalogSnapshotStatus, to: LocalCatalogSnapshotStatus) {
  assertTransition(from, to);
  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
  ], 'readwrite', async (transaction) => {
    const { snapshot } = await assertWriteFence(transaction, input, [from]);
    const next = { ...snapshot, status: to, updatedAt: input.timestamp };
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).put(next));
    return next as LocalCatalogSnapshot;
  });
}

export const markLocalCatalogSnapshotValidating = (input: LifecycleInput) =>
  transitionStaging(input, 'building', 'validating');

export async function markLocalCatalogSnapshotReady(input: LifecycleInput & { expectedTotalItems: number }) {
  assertNonNegativeIntegers(input.expectedTotalItems);
  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.checkpoints, LOCAL_CATALOG_V3_STORES.metrics,
  ], 'readwrite', async (transaction) => {
    const { snapshot } = await assertWriteFence(transaction, input, ['validating']);
    assertTransition(snapshot.status, 'ready');
    const checkpoint = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints).get(input.snapshotId)) as LocalCatalogImportCheckpoint | undefined;
    if (!checkpoint || checkpoint.confirmedItems !== input.expectedTotalItems)
      throw code('LOCAL_CATALOG_CHECKPOINT_INVALID');
    const metrics = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.metrics).get(input.snapshotId)) as LocalCatalogSnapshotMetrics | undefined;
    if (metrics && Object.entries(metrics).some(([key, value]) =>
      key !== 'snapshotId' && key !== 'updatedAt' &&
      (typeof value !== 'number' || !Number.isFinite(value) || value < 0)))
      throw code('LOCAL_CATALOG_SNAPSHOT_METRICS_INVALID');
    if (snapshot.failureCode) throw code('LOCAL_CATALOG_SNAPSHOT_TRANSITION_INVALID');
    const next: LocalCatalogSnapshot = { ...snapshot, status: 'ready', totalItems: input.expectedTotalItems, updatedAt: input.timestamp };
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).put(next));
    return next;
  });
}

export async function promoteLocalCatalogStagingSnapshot(input: LifecycleInput): Promise<LocalCatalogSnapshotPromotionResult> {
  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.checkpoints,
  ], 'readwrite', async (transaction) => {
    const { scope, snapshot } = await assertWriteFence(transaction, input, ['ready']);
    assertTransition(snapshot.status, 'active');
    const snapshotStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots);
    const activeSnapshots = await requestResult(snapshotStore.index('scopeKeyStatus').getAll(IDBKeyRange.only([input.scopeKey, 'active']))) as LocalCatalogSnapshot[];
    let previous: LocalCatalogSnapshot | null = null;
    if (scope.activeSnapshotId) {
      previous = await getSnapshot(transaction, scope.activeSnapshotId);
      if (previous.scopeKey !== input.scopeKey || previous.status !== 'active')
        throw code('LOCAL_CATALOG_ACTIVE_SNAPSHOT_CONFLICT');
    }
    if (activeSnapshots.some((item) => item.snapshotId !== scope.activeSnapshotId))
      throw code('LOCAL_CATALOG_ACTIVE_SNAPSHOT_CONFLICT');
    if (previous) {
      assertTransition(previous.status, 'superseded');
      await requestResult(snapshotStore.put({ ...previous, status: 'superseded', updatedAt: input.timestamp }));
    }
    await requestResult(snapshotStore.put({ ...snapshot, status: 'active', updatedAt: input.timestamp, completedAt: input.timestamp }));
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).put({
      ...scope, activeSnapshotId: input.snapshotId, stagingSnapshotId: null,
      updatedAt: input.timestamp,
    }));
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints).delete(input.snapshotId));
    return { scopeKey: input.scopeKey, activeSnapshotId: input.snapshotId, previousActiveSnapshotId: scope.activeSnapshotId };
  });
}

async function finishStaging(
  input: LifecycleInput & { failureCode: string; failureKind?: LocalCatalogSnapshotFailureKind },
  status: 'failed' | 'canceled', removeCheckpoint: boolean,
) {
  if (!/^LOCAL_CATALOG_[A-Z0-9_]+$/.test(input.failureCode))
    throw code('LOCAL_CATALOG_FAILURE_CODE_INVALID');
  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.checkpoints,
  ], 'readwrite', async (transaction) => {
    const { scope, snapshot } = await assertWriteFence(transaction, input, ['building', 'validating', 'ready']);
    assertTransition(snapshot.status, status);
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).put({
      ...snapshot, status, failureCode: input.failureCode, updatedAt: input.timestamp,
      completedAt: input.timestamp,
    }));
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).put({
      ...scope, stagingSnapshotId: null, updatedAt: input.timestamp,
    }));
    if (removeCheckpoint)
      await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints).delete(input.snapshotId));
  });
}

export const cancelLocalCatalogStagingSnapshot = (input: LifecycleInput & { failureCode: string }) =>
  finishStaging(input, 'canceled', true);

export const failLocalCatalogStagingSnapshot = (
  input: LifecycleInput & { failureCode: string; failureKind: LocalCatalogSnapshotFailureKind },
) => finishStaging(input, 'failed', input.failureKind === 'fatal');

export async function getReadableLocalCatalogActiveSnapshot(scopeKey: string) {
  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
  ], 'readonly', async (transaction) => {
    const rawScope = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).get(scopeKey));
    if (!rawScope) return null;
    const scope = rawScope as LocalCatalogScope;
    if (scope.accessStatus !== 'active' || (!scope.activeSnapshotId && !scope.stagingSnapshotId)) return null;
    const snapshotId = scope.activeSnapshotId || scope.stagingSnapshotId;
    const rawSnapshot = await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).get(snapshotId!));
    if (!rawSnapshot) return null;
    const snapshot = rawSnapshot as LocalCatalogSnapshot;
    return snapshot.scopeKey === scopeKey && snapshot.status !== 'failed' && snapshot.status !== 'canceled' && snapshot.status !== 'superseded' ? snapshot : null;
  });
}

export type VisitReadableLocalCatalogActiveSnapshotItemsInput = {
  scopeKey: string;
  contentKinds: LocalCatalogSnapshotItem['contentKind'][];
  visit: (item: LocalCatalogSnapshotItem) => void;
};

function visitSnapshotItemsByContentKind(
  index: IDBIndex,
  snapshotId: string,
  scopeKey: string,
  contentKinds: LocalCatalogSnapshotItem['contentKind'][],
  visit: (item: LocalCatalogSnapshotItem) => void,
) {
  return new Promise<number>((resolve, reject) => {
    let contentKindIndex = 0;
    let scannedCount = 0;

    const openNextCursor = () => {
      const contentKind = contentKinds[contentKindIndex];

      if (!contentKind) {
        resolve(scannedCount);
        return;
      }

      const request = index.openCursor(
        IDBKeyRange.only([snapshotId, contentKind]),
      );
      request.onerror = () =>
        reject(code('LOCAL_CATALOG_DB_REQUEST_FAILED'));
      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          contentKindIndex += 1;
          openNextCursor();
          return;
        }

        const item = cursor.value as LocalCatalogSnapshotItem;

        if (
          item.snapshotId === snapshotId &&
          item.scopeKey === scopeKey &&
          item.contentKind === contentKind
        ) {
          scannedCount += 1;
          try {
            visit(item);
          } catch (error) {
            reject(error);
            return;
          }
        }

        cursor.continue();
      };
    };

    openNextCursor();
  });
}

export async function visitReadableLocalCatalogActiveSnapshotItems(
  input: VisitReadableLocalCatalogActiveSnapshotItemsInput,
) {
  const scopeKey = input.scopeKey.trim();
  const contentKinds = Array.from(new Set(input.contentKinds));

  if (!scopeKey || contentKinds.length === 0) {
    return null;
  }

  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes,
    LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.items,
  ], 'readonly', async (transaction) => {
    const rawScope = await requestResult(
      transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).get(scopeKey),
    );

    if (!rawScope) {
      return null;
    }

    const scope = rawScope as LocalCatalogScope;

    if (scope.accessStatus !== 'active' || !scope.activeSnapshotId) {
      return null;
    }

    const rawSnapshot = await requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.snapshots)
        .get(scope.activeSnapshotId),
    );

    if (!rawSnapshot) {
      return null;
    }

    const snapshot = rawSnapshot as LocalCatalogSnapshot;

    if (snapshot.scopeKey !== scopeKey || snapshot.status !== 'active') {
      return null;
    }

    const index = transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.items)
      .index('snapshotIdContentKind');
    const scannedCount = await visitSnapshotItemsByContentKind(
      index,
      snapshot.snapshotId,
      scopeKey,
      contentKinds,
      input.visit,
    );

    return {
      snapshotId: snapshot.snapshotId,
      scannedCount,
    };
  });
}

export async function listReadableLocalCatalogActiveSnapshotItems(input: {
  scopeKey: string;
  contentKinds: LocalCatalogSnapshotItem['contentKind'][];
}) {
  const items: LocalCatalogSnapshotItem[] = [];
  const scan = await visitReadableLocalCatalogActiveSnapshotItems({
    ...input,
    visit: (item) => {
      items.push(item);
    },
  });

  if (!scan) {
    return null;
  }

  items.sort(
    (first, second) =>
      first.sourceOrder - second.sourceOrder ||
      first.itemId.localeCompare(second.itemId),
  );

  return {
    snapshotId: scan.snapshotId,
    items,
  };
}

export const assertLocalCatalogSnapshotWriteFence = assertWriteFence;

type SnapshotBatchInput = CheckpointInput & {
  items: LocalCatalogSnapshotItem[];
  parsedItemsInBatch: number;
};

function emptyMetrics(snapshotId: string, updatedAt: string): LocalCatalogSnapshotMetrics {
  return {
    snapshotId, totalRawItems: 0, totalMovies: 0, totalSeries: 0,
    totalEpisodes: 0, totalLive: 0, totalRadio: 0, totalUnknown: 0,
    totalCategories: 0, indexedSearchItems: 0, withPoster: 0, withBackdrop: 0,
    withMetadata: 0, tmdbMatched: 0, tmdbNoMatch: 0, tmdbError: 0,
    metadataPending: 0, duplicatesIgnored: 0, failedItems: 0, removedItems: 0,
    updatedAt,
  };
}

export async function writeLocalCatalogSnapshotBatch(input: SnapshotBatchInput) {
  assertNonNegativeIntegers(
    input.expectedRuntimeEpoch, input.batchSequence, input.confirmedItems,
    input.confirmedBytes, input.parserVersion, input.parsedItemsInBatch,
  );
  return runTransaction([
    LOCAL_CATALOG_V3_STORES.scopes, LOCAL_CATALOG_V3_STORES.snapshots,
    LOCAL_CATALOG_V3_STORES.checkpoints, LOCAL_CATALOG_V3_STORES.items,
    LOCAL_CATALOG_V3_STORES.categories,
    LOCAL_CATALOG_V3_STORES.metrics,
  ], 'readwrite', async (transaction) => {
    const { scope, snapshot } = await assertWriteFence(transaction, input, ['building']);
    const checkpointStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.checkpoints);
    const current = await requestResult(checkpointStore.get(input.snapshotId)) as
      LocalCatalogImportCheckpoint | undefined;
    if (!current || current.scopeKey !== input.scopeKey)
      throw code('LOCAL_CATALOG_CHECKPOINT_INVALID');
    if (input.batchSequence <= current.batchSequence ||
        input.confirmedItems < current.confirmedItems ||
        input.confirmedBytes < current.confirmedBytes)
      throw code('LOCAL_CATALOG_CHECKPOINT_REGRESSION');
    if (input.parserVersion !== current.parserVersion)
      throw code('LOCAL_CATALOG_PARSER_VERSION_MISMATCH');
    if (input.sourceRevision !== current.sourceRevision)
      throw code('LOCAL_CATALOG_SOURCE_REVISION_MISMATCH');
    if (!validatorsMatch(current.sourceEtag, input.sourceEtag) ||
        !validatorsMatch(current.sourceLastModified, input.sourceLastModified))
      throw code('LOCAL_CATALOG_SOURCE_VALIDATOR_MISMATCH');
    const itemStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
    const categoryStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.categories);
    const metricsStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.metrics);
    const newItems: LocalCatalogSnapshotItem[] = [];
    const seenBatch = new Set<string>();
    const uniqueBatchItems: LocalCatalogSnapshotItem[] = [];
    let duplicates = 0;
    for (const item of input.items) {
      if (item.snapshotId !== input.snapshotId || item.scopeKey !== input.scopeKey)
        throw code('LOCAL_CATALOG_STAGING_MISMATCH');
      if (seenBatch.has(item.itemId)) { duplicates += 1; continue; }
      seenBatch.add(item.itemId);
      uniqueBatchItems.push(item);
    }
    const existingKeys = await Promise.all(
      uniqueBatchItems.map((item) =>
        requestResult(
          itemStore.getKey([input.snapshotId, item.itemId]),
        ),
      ),
    );
    for (let index = 0; index < uniqueBatchItems.length; index += 1) {
      const item = uniqueBatchItems[index];
      if (existingKeys[index] !== undefined) {
        duplicates += 1;
      } else {
        newItems.push(item);
      }
    }
    const persistenceRequests: Promise<unknown>[] = [];
    for (const item of newItems) {
      persistenceRequests.push(requestResult(itemStore.add(item)));
    }
    await Promise.all(persistenceRequests);
    const categoryDeltas = new Map<string, { item: LocalCatalogSnapshotItem; count: number }>();
    for (const item of newItems) {
      const categoryId = `${item.contentKind}:${item.normalizedGroup || 'uncategorized'}`;
      const currentDelta = categoryDeltas.get(categoryId);
      categoryDeltas.set(categoryId, { item, count: (currentDelta?.count ?? 0) + 1 });
    }
    let newCategories = 0;
    for (const [categoryId, delta] of categoryDeltas) {
      const key: IDBValidKey = [input.snapshotId, categoryId];
      const existing = await requestResult(categoryStore.get(key)) as LocalCatalogSnapshotCategory | undefined;
      if (!existing) newCategories += 1;
      const category: LocalCatalogSnapshotCategory = {
        snapshotId: input.snapshotId, categoryId, scopeKey: input.scopeKey,
        contentKind: delta.item.contentKind,
        title: delta.item.rawGroupTitle || (delta.item.contentKind === 'unknown' ? 'Unclassified' : 'Uncategorized'),
        normalizedTitle: delta.item.normalizedGroup || (delta.item.contentKind === 'unknown' ? 'unclassified' : 'uncategorized'),
        itemCount: (existing?.itemCount ?? 0) + delta.count,
        sortOrder: existing?.sortOrder ?? delta.item.sourceOrder,
        isUncategorized: !delta.item.rawGroupTitle,
        isUnknownKind: delta.item.contentKind === 'unknown', updatedAt: input.updatedAt,
      };
      await requestResult(categoryStore.put(category));
    }
    const metrics = (await requestResult(metricsStore.get(input.snapshotId)) as
      LocalCatalogSnapshotMetrics | undefined) ?? emptyMetrics(input.snapshotId, input.updatedAt);
    const nextMetrics = { ...metrics };
    nextMetrics.totalRawItems += input.parsedItemsInBatch;
    nextMetrics.totalCategories += newCategories;
    nextMetrics.duplicatesIgnored += duplicates;
    for (const item of newItems) {
      if (item.contentKind === 'movie') nextMetrics.totalMovies += 1;
      else if (item.contentKind === 'series') nextMetrics.totalSeries += 1;
      else if (item.contentKind === 'series_episode') nextMetrics.totalEpisodes += 1;
      else if (item.contentKind === 'live') nextMetrics.totalLive += 1;
      else if (item.contentKind === 'radio') nextMetrics.totalRadio += 1;
      else nextMetrics.totalUnknown += 1;
    }
    nextMetrics.updatedAt = input.updatedAt;
    await requestResult(metricsStore.put(nextMetrics));
    await requestResult(transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).put({
      ...snapshot, totalItems: input.confirmedItems, updatedAt: input.updatedAt,
    }));
    const nextCheckpoint: LocalCatalogImportCheckpoint = {
      snapshotId: input.snapshotId, scopeKey: input.scopeKey,
      batchSequence: input.batchSequence, confirmedItems: input.confirmedItems,
      confirmedBytes: input.confirmedBytes, sourceEtag: input.sourceEtag,
      sourceLastModified: input.sourceLastModified, sourceRevision: input.sourceRevision,
      parserVersion: input.parserVersion, updatedAt: input.updatedAt,
    };
    await requestResult(checkpointStore.put(nextCheckpoint));
    if (scope.activeSnapshotId !== (await getScope(transaction, input.scopeKey)).activeSnapshotId)
      throw code('LOCAL_CATALOG_ACTIVE_SNAPSHOT_CONFLICT');
    return { inserted: newItems.length, duplicates, metrics: nextMetrics, checkpoint: nextCheckpoint };
  });
}
