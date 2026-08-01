import { createLocalCatalogSearchRecords } from '../lib/localCatalogSearchIndex';
import {
  normalizeLocalCatalogSearchText,
  tokenizeLocalCatalogSearchText,
} from '../lib/localCatalogSearchNormalization';
import type {
  LocalCatalogImportMetadata,
  LocalCatalogItem,
  LocalCatalogMetadata,
  LocalCatalogScope,
  LocalCatalogSearchDocument,
  LocalCatalogSearchToken,
  LocalCatalogSnapshotItem,
  LocalCatalogSnapshotMetrics,
} from '../types/localCatalog.types';
import {
  LOCAL_CATALOG_V2_STORES,
  LOCAL_CATALOG_V3_STORES,
  getLocalCatalogImportMetadata,
  getLocalCatalogMetadata,
  getLocalCatalogScope,
  openLocalCatalogDb,
  putLocalCatalogMetadata,
} from './localCatalogDb.service';

const INDEX_BATCH_SIZE = 500;
const pendingIndexes = new Map<string, Promise<void>>();
export const LEGACY_LOCAL_SEARCH_INDEX_BATCH_SIZE = 100;
const LEGACY_INDEX_METADATA_PREFIX = 'legacy-search-index:';
const pendingLegacyIndexes = new Map<
  string,
  { generation: string; promise: Promise<void> }
>();
const pendingLegacyStarts = new Map<
  string,
  Promise<LegacyLocalCatalogSearchIndexState | null>
>();
let activeLegacyIndexBuilders = 0;
let maxConcurrentLegacyIndexBuilders = 0;
let legacyIndexBatchCount = 0;
let legacyIndexYieldCount = 0;

export type LegacyLocalCatalogSearchIndexStatus =
  | 'idle'
  | 'building'
  | 'ready'
  | 'failed'
  | 'stale';

export type LegacyLocalCatalogSearchIndexState = {
  generation: string;
  scopeKey: string;
  sourceId: string;
  checkpoint: string | null;
  processedCount: number;
  documentCount: number;
  tokenCount: number;
  totalItems: number;
  status: LegacyLocalCatalogSearchIndexStatus;
  updatedAt: string;
  startedAt: string;
  completedAt: string | null;
  failureCode: string | null;
  maxBatchReadTimeMs: number;
  maxBatchWriteTimeMs: number;
};

type LegacyIndexDescriptor = {
  generation: string;
  scopeKey: string;
  sourceId: string;
  totalItems: number;
};

type LegacyIndexBatch = {
  items: LocalCatalogItem[];
  checkpoint: string | null;
  readTimeMs: number;
  hasMoreScan: boolean;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error('LOCAL_CATALOG_SEARCH_INDEX_REQUEST_FAILED'),
      );
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error('LOCAL_CATALOG_SEARCH_INDEX_TRANSACTION_FAILED'),
      );
  });
}

function legacyIndexMetadataKey(scopeKey: string) {
  return `${LEGACY_INDEX_METADATA_PREFIX}${scopeKey}`;
}

function isLegacyIndexState(
  value: unknown,
): value is LegacyLocalCatalogSearchIndexState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as Partial<LegacyLocalCatalogSearchIndexState>;
  return (
    typeof state.generation === 'string' &&
    typeof state.scopeKey === 'string' &&
    typeof state.sourceId === 'string' &&
    typeof state.processedCount === 'number' &&
    typeof state.documentCount === 'number' &&
    typeof state.tokenCount === 'number' &&
    typeof state.totalItems === 'number' &&
    ['idle', 'building', 'ready', 'failed', 'stale'].includes(
      state.status ?? '',
    )
  );
}

function getStateFromMetadata(
  metadata: LocalCatalogMetadata | null,
): LegacyLocalCatalogSearchIndexState | null {
  return isLegacyIndexState(metadata?.value) ? metadata.value : null;
}

function getLegacyGeneration(
  scope: LocalCatalogScope,
  metadata: LocalCatalogImportMetadata,
) {
  const importRevision =
    metadata.lastSuccessfulImportAt ?? metadata.completedAt ?? 'unknown';
  return [
    'legacy-search',
    encodeURIComponent(scope.scopeKey),
    encodeURIComponent(scope.sourceId),
    encodeURIComponent(importRevision),
    metadata.classificationVersion,
    metadata.importedCount,
  ].join(':');
}

async function countLegacySourceItems(sourceId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V2_STORES[0],
      'readonly',
    );
    const done = transactionDone(transaction);
    const count = await requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V2_STORES[0])
        .index('sourceId')
        .count(IDBKeyRange.only(sourceId)),
    );
    await done;
    return count;
  } finally {
    db.close();
  }
}

async function getLegacyIndexDescriptor(
  scopeKey: string,
  includeTotal: boolean,
): Promise<LegacyIndexDescriptor | null> {
  const scope = await getLocalCatalogScope(scopeKey);
  if (!scope || scope.accessStatus !== 'active') {
    return null;
  }

  const metadata = await getLocalCatalogImportMetadata(scope.sourceId);
  const importRevision =
    metadata?.lastSuccessfulImportAt ?? metadata?.completedAt;
  if (
    !metadata ||
    metadata.status !== 'ready' ||
    !importRevision ||
    metadata.importedCount <= 0
  ) {
    return null;
  }

  return {
    generation: getLegacyGeneration(scope, metadata),
    scopeKey,
    sourceId: scope.sourceId,
    totalItems: includeTotal
      ? await countLegacySourceItems(scope.sourceId)
      : metadata.importedCount,
  };
}

function createInitialLegacyIndexState(
  descriptor: LegacyIndexDescriptor,
): LegacyLocalCatalogSearchIndexState {
  const now = new Date().toISOString();
  return {
    ...descriptor,
    checkpoint: null,
    processedCount: 0,
    documentCount: 0,
    tokenCount: 0,
    status: 'building',
    updatedAt: now,
    startedAt: now,
    completedAt: null,
    failureCode: null,
    maxBatchReadTimeMs: 0,
    maxBatchWriteTimeMs: 0,
  };
}

async function writeLegacyIndexState(
  state: LegacyLocalCatalogSearchIndexState,
) {
  await putLocalCatalogMetadata({
    key: legacyIndexMetadataKey(state.scopeKey),
    value: state,
    updatedAt: state.updatedAt,
  });
}

async function writeLegacyIndexStateIfCurrent(
  state: LegacyLocalCatalogSearchIndexState,
  expectedStatus: LegacyLocalCatalogSearchIndexStatus,
) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V2_STORES[1],
      'readwrite',
    );
    const done = transactionDone(transaction);
    const store = transaction.objectStore(LOCAL_CATALOG_V2_STORES[1]);
    const key = legacyIndexMetadataKey(state.scopeKey);
    const metadata = (await requestResult(
      store.get(key),
    )) as LocalCatalogMetadata | undefined;
    const current = getStateFromMetadata(metadata ?? null);
    if (
      !current ||
      current.generation !== state.generation ||
      current.status !== expectedStatus
    ) {
      await done;
      return false;
    }
    store.put({
      key,
      value: state,
      updatedAt: state.updatedAt,
    } satisfies LocalCatalogMetadata);
    await done;
    return true;
  } finally {
    db.close();
  }
}

export async function getLegacyLocalCatalogSearchIndexState(
  scopeKey: string,
) {
  return getStateFromMetadata(
    await getLocalCatalogMetadata(legacyIndexMetadataKey(scopeKey)),
  );
}

async function readLegacyItemBatch(
  descriptor: LegacyIndexDescriptor,
  checkpoint: string | null,
): Promise<LegacyIndexBatch> {
  const startedAt = performance.now();
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V2_STORES[0],
      'readonly',
    );
    const done = transactionDone(transaction);
    const range = checkpoint
      ? IDBKeyRange.lowerBound(checkpoint, true)
      : undefined;
    const scannedItems = (await requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V2_STORES[0])
        .getAll(range, LEGACY_LOCAL_SEARCH_INDEX_BATCH_SIZE),
    )) as LocalCatalogItem[];
    await done;
    return {
      items: scannedItems.filter(
        (item) => item.sourceId === descriptor.sourceId,
      ),
      checkpoint: scannedItems.at(-1)?.id ?? checkpoint,
      readTimeMs: performance.now() - startedAt,
      hasMoreScan:
        scannedItems.length === LEGACY_LOCAL_SEARCH_INDEX_BATCH_SIZE,
    };
  } finally {
    db.close();
  }
}

function createLegacySearchRecords(
  generation: string,
  scopeKey: string,
  item: LocalCatalogItem,
  updatedAt: string,
) {
  const normalizedTitle = normalizeLocalCatalogSearchText(
    item.rawName ?? item.name,
  );
  const document: LocalCatalogSearchDocument = {
    snapshotId: generation,
    documentId: item.id,
    scopeKey,
    catalogItemId: item.id,
    contentKind: item.contentKind,
    normalizedTitle,
    normalizedCategory:
      normalizeLocalCatalogSearchText(item.groupTitle) || null,
    year: null,
    seasonNumber: item.seasonNumber ?? null,
    episodeNumber: item.episodeNumber ?? null,
    indexStatus: 'ready',
    updatedAt,
  };
  const tokens: LocalCatalogSearchToken[] =
    tokenizeLocalCatalogSearchText(normalizedTitle).map(
      (token, position) => ({
        snapshotId: generation,
        token,
        documentId: item.id,
        weight: 100,
        position,
        prefixLength: token.length,
      }),
    );
  return { document, tokens };
}

async function writeLegacyIndexBatch(
  descriptor: LegacyIndexDescriptor,
  previous: LegacyLocalCatalogSearchIndexState,
  batch: LegacyIndexBatch,
) {
  const startedAt = performance.now();
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.searchDocuments,
        LOCAL_CATALOG_V3_STORES.searchTokens,
        LOCAL_CATALOG_V2_STORES[1],
      ],
      'readwrite',
    );
    const done = transactionDone(transaction);
    const metadataStore = transaction.objectStore(
      LOCAL_CATALOG_V2_STORES[1],
    );
    const metadataKey = legacyIndexMetadataKey(descriptor.scopeKey);
    const currentMetadata = (await requestResult(
      metadataStore.get(metadataKey),
    )) as LocalCatalogMetadata | undefined;
    const current = getStateFromMetadata(currentMetadata ?? null);
    if (
      !current ||
      current.generation !== descriptor.generation ||
      current.status !== 'building' ||
      current.checkpoint !== previous.checkpoint
    ) {
      transaction.abort();
      throw new Error('LOCAL_CATALOG_LEGACY_INDEX_STALE_GENERATION');
    }

    const updatedAt = new Date().toISOString();
    const documentStore = transaction.objectStore(
      LOCAL_CATALOG_V3_STORES.searchDocuments,
    );
    const tokenStore = transaction.objectStore(
      LOCAL_CATALOG_V3_STORES.searchTokens,
    );
    let tokenCount = 0;
    for (const item of batch.items) {
      const records = createLegacySearchRecords(
        descriptor.generation,
        descriptor.scopeKey,
        item,
        updatedAt,
      );
      documentStore.put(records.document);
      for (const token of records.tokens) {
        tokenStore.put(token);
        tokenCount += 1;
      }
    }

    const nextState: LegacyLocalCatalogSearchIndexState = {
      ...current,
      checkpoint: batch.checkpoint,
      processedCount: current.processedCount + batch.items.length,
      documentCount: current.documentCount + batch.items.length,
      tokenCount: current.tokenCount + tokenCount,
      updatedAt,
      maxBatchReadTimeMs: Math.max(
        current.maxBatchReadTimeMs,
        batch.readTimeMs,
      ),
      maxBatchWriteTimeMs: Math.max(
        current.maxBatchWriteTimeMs,
        previous.maxBatchWriteTimeMs,
        performance.now() - startedAt,
      ),
    };
    metadataStore.put({
      key: metadataKey,
      value: nextState,
      updatedAt,
    } satisfies LocalCatalogMetadata);
    await done;
    return {
      ...nextState,
      maxBatchWriteTimeMs: Math.max(
        nextState.maxBatchWriteTimeMs,
        performance.now() - startedAt,
      ),
    };
  } finally {
    db.close();
  }
}

function yieldLegacyIndexBuilder() {
  legacyIndexYieldCount += 1;
  return new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(resolve, 16);
  });
}

export function getLegacyLocalCatalogSearchIndexDiagnostics() {
  return {
    activeBuilders: activeLegacyIndexBuilders,
    maxConcurrentBuilders: maxConcurrentLegacyIndexBuilders,
    batchCount: legacyIndexBatchCount,
    yieldCount: legacyIndexYieldCount,
  };
}

function isCurrentLegacyBuilder(descriptor: LegacyIndexDescriptor) {
  return (
    pendingLegacyIndexes.get(descriptor.scopeKey)?.generation ===
    descriptor.generation
  );
}

async function publishLegacyIndexReady(
  descriptor: LegacyIndexDescriptor,
  state: LegacyLocalCatalogSearchIndexState,
) {
  const currentDescriptor = await getLegacyIndexDescriptor(
    descriptor.scopeKey,
    false,
  );
  if (
    !currentDescriptor ||
    currentDescriptor.generation !== descriptor.generation ||
    !isCurrentLegacyBuilder(descriptor)
  ) {
    return;
  }

  const now = new Date().toISOString();
  await writeLegacyIndexStateIfCurrent({
    ...state,
    status: 'ready',
    processedCount: state.documentCount,
    totalItems: state.documentCount,
    updatedAt: now,
    completedAt: now,
    failureCode: null,
  }, 'building');
}

async function buildLegacyLocalCatalogSearchIndex(
  descriptor: LegacyIndexDescriptor,
  initialState: LegacyLocalCatalogSearchIndexState,
) {
  let state = initialState;
  let batchesSinceDescriptorCheck = 20;
  for (;;) {
    if (!isCurrentLegacyBuilder(descriptor)) {
      return;
    }

    if (batchesSinceDescriptorCheck >= 20) {
      const currentDescriptor = await getLegacyIndexDescriptor(
        descriptor.scopeKey,
        false,
      );
      batchesSinceDescriptorCheck = 0;
      if (
        !currentDescriptor ||
        currentDescriptor.generation !== descriptor.generation
      ) {
        if (isCurrentLegacyBuilder(descriptor)) {
          await writeLegacyIndexStateIfCurrent({
            ...state,
            status: 'stale',
            updatedAt: new Date().toISOString(),
            failureCode: 'LOCAL_CATALOG_LEGACY_INDEX_GENERATION_CHANGED',
          }, 'building');
        }
        return;
      }
    }

    const batch = await readLegacyItemBatch(
      descriptor,
      state.checkpoint,
    );
    if (batch.items.length === 0 && !batch.hasMoreScan) {
      await publishLegacyIndexReady(descriptor, state);
      return;
    }

    state = await writeLegacyIndexBatch(descriptor, state, batch);
    legacyIndexBatchCount += 1;
    batchesSinceDescriptorCheck += 1;
    await yieldLegacyIndexBuilder();
  }
}

function sanitizeLegacyIndexFailure(error: unknown) {
  if (
    error instanceof Error &&
    /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(error.message)
  ) {
    return error.message;
  }
  return 'LOCAL_CATALOG_LEGACY_INDEX_FAILED';
}

function scheduleLegacyIndexBuilder(
  descriptor: LegacyIndexDescriptor,
  state: LegacyLocalCatalogSearchIndexState,
) {
  const pending = pendingLegacyIndexes.get(descriptor.scopeKey);
  if (pending?.generation === descriptor.generation) {
    return;
  }

  const waitForPrevious = pending
    ? pending.promise.catch(() => undefined)
    : Promise.resolve();
  const promise = waitForPrevious
    .then(async () => {
      activeLegacyIndexBuilders += 1;
      maxConcurrentLegacyIndexBuilders = Math.max(
        maxConcurrentLegacyIndexBuilders,
        activeLegacyIndexBuilders,
      );
      try {
        await buildLegacyLocalCatalogSearchIndex(descriptor, state);
      } finally {
        activeLegacyIndexBuilders -= 1;
      }
    })
    .catch(async (error: unknown) => {
      if (!isCurrentLegacyBuilder(descriptor)) {
        return;
      }
      const current = await getLegacyLocalCatalogSearchIndexState(
        descriptor.scopeKey,
      );
      if (
        current?.generation === descriptor.generation &&
        current.status === 'building'
      ) {
        await writeLegacyIndexStateIfCurrent({
          ...current,
          status: 'failed',
          updatedAt: new Date().toISOString(),
          failureCode: sanitizeLegacyIndexFailure(error),
        }, 'building');
      }
    })
    .finally(() => {
      if (
        pendingLegacyIndexes.get(descriptor.scopeKey)?.generation ===
        descriptor.generation
      ) {
        pendingLegacyIndexes.delete(descriptor.scopeKey);
      }
    });
  pendingLegacyIndexes.set(descriptor.scopeKey, {
    generation: descriptor.generation,
    promise,
  });
}

async function prepareLegacyIndex(
  scopeKey: string,
  retryFailed: boolean,
) {
  const currentDescriptor = await getLegacyIndexDescriptor(scopeKey, false);
  if (!currentDescriptor) {
    return null;
  }

  let state = await getLegacyLocalCatalogSearchIndexState(scopeKey);
  if (
    !state ||
    state.generation !== currentDescriptor.generation ||
    (retryFailed && state.status === 'failed')
  ) {
    const descriptor = {
      ...currentDescriptor,
      totalItems: await countLegacySourceItems(currentDescriptor.sourceId),
    };
    state = createInitialLegacyIndexState(descriptor);
    await writeLegacyIndexState(state);
  }

  if (state.status === 'building') {
    scheduleLegacyIndexBuilder(
      {
        ...currentDescriptor,
        totalItems: state.totalItems,
      },
      state,
    );
  }
  return state;
}

export function ensureLegacyLocalCatalogSearchIndex(
  scopeKey: string,
  options: { retryFailed?: boolean } = {},
) {
  const normalizedScopeKey = scopeKey.trim();
  if (!normalizedScopeKey) {
    return Promise.resolve(null);
  }

  const pending = pendingLegacyStarts.get(normalizedScopeKey);
  if (pending) {
    return pending;
  }

  const next = prepareLegacyIndex(
    normalizedScopeKey,
    options.retryFailed === true,
  ).finally(() => {
    if (pendingLegacyStarts.get(normalizedScopeKey) === next) {
      pendingLegacyStarts.delete(normalizedScopeKey);
    }
  });
  pendingLegacyStarts.set(normalizedScopeKey, next);
  return next;
}

async function countSearchDocuments(snapshotId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.searchDocuments,
      'readonly',
    );
    return await requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.searchDocuments)
        .index('snapshotId')
        .count(IDBKeyRange.only(snapshotId)),
    );
  } finally {
    db.close();
  }
}

async function countSnapshotItems(snapshotId: string) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.items,
      'readonly',
    );
    return await requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.items)
        .index('snapshotId')
        .count(IDBKeyRange.only(snapshotId)),
    );
  } finally {
    db.close();
  }
}

async function readItemBatch(
  snapshotId: string,
  afterItemId: string | null,
) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.items,
      'readonly',
    );
    const store = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
    const range = afterItemId
      ? IDBKeyRange.bound(
          [snapshotId, afterItemId],
          [snapshotId, []],
          true,
          false,
        )
      : IDBKeyRange.bound([snapshotId], [snapshotId, []]);

    return await new Promise<LocalCatalogSnapshotItem[]>(
      (resolve, reject) => {
        const items: LocalCatalogSnapshotItem[] = [];
        const request = store.openCursor(range);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || items.length >= INDEX_BATCH_SIZE) {
            resolve(items);
            return;
          }
          items.push(cursor.value as LocalCatalogSnapshotItem);
          cursor.continue();
        };
        request.onerror = () =>
          reject(new Error('LOCAL_CATALOG_SEARCH_INDEX_READ_FAILED'));
      },
    );
  } finally {
    db.close();
  }
}

async function writeIndexBatch(
  items: LocalCatalogSnapshotItem[],
  scopeKey: string,
) {
  if (items.length === 0) {
    return;
  }

  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.searchDocuments,
        LOCAL_CATALOG_V3_STORES.searchTokens,
      ],
      'readwrite',
    );
    const done = transactionDone(transaction);
    const documentStore = transaction.objectStore(
      LOCAL_CATALOG_V3_STORES.searchDocuments,
    );
    const tokenStore = transaction.objectStore(
      LOCAL_CATALOG_V3_STORES.searchTokens,
    );
    const updatedAt = new Date().toISOString();

    for (const item of items) {
      if (item.scopeKey !== scopeKey) {
        transaction.abort();
        throw new Error('LOCAL_CATALOG_SEARCH_SCOPE_MISMATCH');
      }
      const { document, tokenRecords } = createLocalCatalogSearchRecords(
        item,
        updatedAt,
      );
      documentStore.put(document);
      for (const token of tokenRecords) {
        tokenStore.put(token);
      }
    }
    await done;
  } finally {
    db.close();
  }
}

async function updateIndexedMetrics(snapshotId: string, indexedItems: number) {
  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.metrics,
      'readwrite',
    );
    const done = transactionDone(transaction);
    const store = transaction.objectStore(LOCAL_CATALOG_V3_STORES.metrics);
    const metrics = (await requestResult(
      store.get(snapshotId),
    )) as LocalCatalogSnapshotMetrics | undefined;
    if (metrics) {
      store.put({
        ...metrics,
        indexedSearchItems: indexedItems,
        updatedAt: new Date().toISOString(),
      });
    }
    await done;
  } finally {
    db.close();
  }
}

async function buildLocalCatalogSearchIndex(input: {
  snapshotId: string;
  scopeKey: string;
}) {
  const catalogItems = await countSnapshotItems(input.snapshotId);
  let indexedItems = await countSearchDocuments(input.snapshotId);
  if (indexedItems >= catalogItems) {
    return;
  }

  let afterItemId: string | null = null;
  for (;;) {
    const items = await readItemBatch(input.snapshotId, afterItemId);
    if (items.length === 0) {
      break;
    }
    await writeIndexBatch(items, input.scopeKey);
    afterItemId = items[items.length - 1].itemId;
    if (items.length < INDEX_BATCH_SIZE) {
      break;
    }
  }

  indexedItems = await countSearchDocuments(input.snapshotId);
  await updateIndexedMetrics(input.snapshotId, indexedItems);
}

export function ensureLocalCatalogSearchIndex(input: {
  snapshotId: string;
  scopeKey: string;
}) {
  const pending = pendingIndexes.get(input.snapshotId);
  if (pending) {
    return pending;
  }

  const next = buildLocalCatalogSearchIndex(input).finally(() => {
    if (pendingIndexes.get(input.snapshotId) === next) {
      pendingIndexes.delete(input.snapshotId);
    }
  });
  pendingIndexes.set(input.snapshotId, next);
  return next;
}
