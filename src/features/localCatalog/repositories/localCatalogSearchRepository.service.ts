import {
  LOCAL_CATALOG_V3_STORES,
  getLocalCatalogScope,
  openLocalCatalogDb,
} from '../services/localCatalogDb.service';
import { getReadableLocalCatalogActiveSnapshot } from '../services/localCatalogSnapshotLifecycle.service';
import {
  ensureLocalCatalogSearchIndex,
  getLocalCatalogSearchIndexState,
} from '../services/localCatalogSearchIndex.service';
import type {
  LocalCatalogSearchDocument,
  LocalCatalogSearchToken,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';

export type LocalCatalogSearchCandidate = {
  document: LocalCatalogSearchDocument;
  item: LocalCatalogSnapshotItem;
  matchedTokens: string[];
};

export type LocalCatalogSearchRepository = {
  findCandidates(input: {
    scopeKey: string;
    tokens: string[];
    normalizedQuery: string;
  }): Promise<{
    snapshotId: string;
    candidates: LocalCatalogSearchCandidate[];
    status?: 'ready' | 'indexing' | 'index_failed' | 'unavailable';
    dataPath?:
      | 'ACTIVE_SNAPSHOT'
      | 'NO_ACTIVE_AVAILABILITY';
    processedCount?: number;
    totalItems?: number;
    indexingInBackground?: boolean;
  } | null>;
};

async function resolveNoActiveSearchAvailability(scopeKey: string) {
  const scope = await getLocalCatalogScope(scopeKey);
  const hasSearchableScope = scope?.accessStatus === 'active';

  return {
    snapshotId: `no-active:${scopeKey}`,
    candidates: [] as LocalCatalogSearchCandidate[],
    status: hasSearchableScope ? ('indexing' as const) : ('unavailable' as const),
    dataPath: 'NO_ACTIVE_AVAILABILITY' as const,
    processedCount: undefined,
    totalItems: undefined,
    indexingInBackground: hasSearchableScope,
  };
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('LOCAL_CATALOG_SEARCH_READ_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error('LOCAL_CATALOG_SEARCH_TRANSACTION_FAILED'),
      );
  });
}

async function listTokenMatches(snapshotId: string, tokens: string[]) {
  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.searchTokens,
      'readonly',
    );
    const done = transactionDone(transaction);
    const index = transaction
      .objectStore(LOCAL_CATALOG_V3_STORES.searchTokens)
      .index('snapshotIdToken');
    const requests = tokens.map((token) =>
      requestResult(
        index.getAll(
          IDBKeyRange.bound(
            [snapshotId, token],
            [snapshotId, `${token}\uffff`],
          ),
        ),
      ),
    );
    const matches = (await Promise.all(requests)) as LocalCatalogSearchToken[][];
    await done;
    return matches;
  } finally {
    db.close();
  }
}

function intersectDocumentIds(matches: LocalCatalogSearchToken[][]) {
  if (matches.length === 0) {
    return [];
  }

  const counts = new Map<string, number>();

  for (const tokenMatches of matches) {
    const idsForToken = new Set(
      tokenMatches.map((match) => match.documentId),
    );

    for (const documentId of idsForToken) {
      counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
    }
  }

  return Array.from(counts)
    .filter(([, count]) => count === matches.length)
    .map(([documentId]) => documentId);
}

async function loadCandidates(
  snapshotId: string,
  scopeKey: string,
  documentIds: string[],
  tokenMatches: LocalCatalogSearchToken[][],
) {
  if (documentIds.length === 0) {
    return [];
  }

  const matchedTokensByDocument = new Map<string, Set<string>>();
  const eligibleDocumentIds = new Set(documentIds);
  for (const matches of tokenMatches) {
    for (const match of matches) {
      if (!eligibleDocumentIds.has(match.documentId)) {
        continue;
      }

      const current =
        matchedTokensByDocument.get(match.documentId) ?? new Set<string>();
      current.add(match.token);
      matchedTokensByDocument.set(match.documentId, current);
    }
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.searchDocuments,
        LOCAL_CATALOG_V3_STORES.items,
      ],
      'readonly',
    );
    const done = transactionDone(transaction);
    const documentStore = transaction.objectStore(
      LOCAL_CATALOG_V3_STORES.searchDocuments,
    );
    const itemStore = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
    const requests = documentIds.map(async (documentId) => {
      const [document, item] = await Promise.all([
        requestResult(
          documentStore.get([snapshotId, documentId]),
        ) as Promise<LocalCatalogSearchDocument | undefined>,
        requestResult(
          itemStore.get([snapshotId, documentId]),
        ) as Promise<LocalCatalogSnapshotItem | undefined>,
      ]);

      if (
        !document ||
        !item ||
        document.scopeKey !== scopeKey ||
        item.scopeKey !== scopeKey ||
        document.indexStatus !== 'ready'
      ) {
        return null;
      }

      return {
        document,
        item,
        matchedTokens: Array.from(
          matchedTokensByDocument.get(documentId) ?? [],
        ),
      } satisfies LocalCatalogSearchCandidate;
    });
    const candidates = await Promise.all(requests);
    await done;
    return candidates.filter(
      (candidate): candidate is LocalCatalogSearchCandidate =>
        candidate !== null,
    );
  } finally {
    db.close();
  }
}

export const localCatalogSearchRepository: LocalCatalogSearchRepository = {
  async findCandidates({ scopeKey, tokens }) {
    const snapshot = await getReadableLocalCatalogActiveSnapshot(scopeKey);

    if (!snapshot) {
      return resolveNoActiveSearchAvailability(scopeKey);
    }

    console.info('[XANDEFLIX_SEARCH_SNAPSHOT]', { active: true });
    void ensureLocalCatalogSearchIndex({
      snapshotId: snapshot.snapshotId,
      scopeKey,
    });
    const indexState = await getLocalCatalogSearchIndexState(
      snapshot.snapshotId,
    );
    const tokenMatches = await listTokenMatches(snapshot.snapshotId, tokens);
    const documentIds = intersectDocumentIds(tokenMatches);
    const candidates = await loadCandidates(
      snapshot.snapshotId,
      scopeKey,
      documentIds,
      tokenMatches,
    );

    const isComplete =
      indexState.status === 'ready' &&
      indexState.processedCount === indexState.totalItems;

    if (indexState.status === 'failed') {
      return {
        snapshotId: snapshot.snapshotId,
        candidates,
        status: 'index_failed',
        dataPath: 'ACTIVE_SNAPSHOT',
        processedCount: indexState.processedCount,
        totalItems: indexState.totalItems,
        indexingInBackground: false,
      };
    }

    if (candidates.length > 0) {
      return {
        snapshotId: snapshot.snapshotId,
        candidates,
        status: isComplete ? 'ready' : 'indexing',
        dataPath: 'ACTIVE_SNAPSHOT',
        processedCount: indexState.processedCount,
        totalItems: indexState.totalItems,
        indexingInBackground: !isComplete,
      };
    }

    if (isComplete) {
      return {
        snapshotId: snapshot.snapshotId,
        candidates: [],
        status: 'ready',
        dataPath: 'ACTIVE_SNAPSHOT',
        processedCount: indexState.processedCount,
        totalItems: indexState.totalItems,
        indexingInBackground: false,
      };
    }

    return {
      snapshotId: snapshot.snapshotId,
      candidates: [],
      status: 'indexing',
      dataPath: 'ACTIVE_SNAPSHOT',
      processedCount: indexState.processedCount,
      totalItems: indexState.totalItems,
      indexingInBackground: true,
    };
  },
};
