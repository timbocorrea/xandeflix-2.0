import {
  LOCAL_CATALOG_V2_STORES,
  LOCAL_CATALOG_V3_STORES,
  getLocalCatalogScope,
  openLocalCatalogDb,
} from '../services/localCatalogDb.service';
import { getReadableLocalCatalogActiveSnapshot } from '../services/localCatalogSnapshotLifecycle.service';
import {
  ensureLegacyLocalCatalogSearchIndex,
  ensureLocalCatalogSearchIndex,
  type LegacyLocalCatalogSearchIndexStatus,
} from '../services/localCatalogSearchIndex.service';
import type {
  LocalCatalogItem,
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
    status?: 'ready' | 'indexing' | 'index_failed';
    dataPath?:
      | 'ACTIVE_SNAPSHOT'
      | 'LEGACY_TOKEN_INDEX'
      | 'LEGACY_PREFIX_WHILE_INDEXING';
    processedCount?: number;
    totalItems?: number;
    indexingInBackground?: boolean;
  } | null>;
};

const LEGACY_SEARCH_CANDIDATE_LIMIT = 500;

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

function mapLegacyItem(
  item: LocalCatalogItem,
  generation: string,
  scopeKey: string,
  sourceOrder: number,
): LocalCatalogSnapshotItem {
  return {
    snapshotId: generation,
    itemId: item.id,
    scopeKey,
    logicalIdentity: {
      version: 1,
      strategy: 'url_fallback',
      value: item.id,
    },
    sourceItemId: item.id,
    contentKind: item.contentKind,
    rawName: (item.rawName ?? item.name).trim(),
    normalizedName: item.normalizedName.trim(),
    rawGroupTitle: item.groupTitle?.trim() || null,
    normalizedGroup: item.normalizedGroup?.trim() || null,
    streamUrl: item.streamUrl,
    artworkUrl: item.tvgLogo?.trim() || null,
    sourceOrder,
    classificationVersion: item.classificationVersion ?? 1,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function loadLegacyTokenCandidates(
  generation: string,
  scopeKey: string,
  sourceId: string,
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
        LOCAL_CATALOG_V2_STORES[0],
      ],
      'readonly',
    );
    const done = transactionDone(transaction);
    const documentStore = transaction.objectStore(
      LOCAL_CATALOG_V3_STORES.searchDocuments,
    );
    const itemStore = transaction.objectStore(LOCAL_CATALOG_V2_STORES[0]);
    const candidates = await Promise.all(
      documentIds.map(async (documentId, sourceOrder) => {
        const [document, item] = await Promise.all([
          requestResult(
            documentStore.get([generation, documentId]),
          ) as Promise<LocalCatalogSearchDocument | undefined>,
          requestResult(
            itemStore.get(documentId),
          ) as Promise<LocalCatalogItem | undefined>,
        ]);
        if (
          !document ||
          !item ||
          document.scopeKey !== scopeKey ||
          document.indexStatus !== 'ready' ||
          item.sourceId !== sourceId
        ) {
          return null;
        }
        return {
          document,
          item: mapLegacyItem(
            item,
            generation,
            scopeKey,
            sourceOrder,
          ),
          matchedTokens: Array.from(
            matchedTokensByDocument.get(documentId) ?? [],
          ),
        } satisfies LocalCatalogSearchCandidate;
      }),
    );
    await done;
    return candidates.filter(
      (candidate): candidate is LocalCatalogSearchCandidate =>
        candidate !== null,
    );
  } finally {
    db.close();
  }
}

async function findLegacyCandidates(input: {
  scopeKey: string;
  normalizedQuery: string;
  tokens: string[];
  indexStatus?: LegacyLocalCatalogSearchIndexStatus;
  processedCount?: number;
  totalItems?: number;
}) {
  const scope = await getLocalCatalogScope(input.scopeKey);
  if (!scope || scope.accessStatus !== 'active') {
    return null;
  }

  const db = await openLocalCatalogDb();
  try {
    const transaction = db.transaction(
      LOCAL_CATALOG_V2_STORES[0],
      'readonly',
    );
    const store = transaction.objectStore(LOCAL_CATALOG_V2_STORES[0]);
    const index = store.index('normalizedName');
    const range = IDBKeyRange.bound(
      input.normalizedQuery,
      `${input.normalizedQuery}\uffff`,
    );
    const candidates = await new Promise<LocalCatalogSearchCandidate[]>(
      (resolve, reject) => {
        const matches: LocalCatalogSearchCandidate[] = [];
        let sourceOrder = 0;
        const request = index.openCursor(range);
        request.onerror = () =>
          reject(
            request.error ??
              new Error('LOCAL_CATALOG_LEGACY_SEARCH_FAILED'),
          );
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || matches.length >= LEGACY_SEARCH_CANDIDATE_LIMIT) {
            resolve(matches);
            return;
          }
          const item = cursor.value as import('../types/localCatalog.types').LocalCatalogItem;
          if (item.sourceId === scope.sourceId) {
            const normalizedTitle = item.normalizedName.trim();
            matches.push({
              document: {
                snapshotId: `legacy:${input.scopeKey}`,
                documentId: item.id,
                scopeKey: input.scopeKey,
                catalogItemId: item.id,
                normalizedTitle,
                normalizedCategory: item.normalizedGroup?.trim() || null,
                contentKind: item.contentKind,
                year: null,
                seasonNumber: item.seasonNumber ?? null,
                episodeNumber: item.episodeNumber ?? null,
                indexStatus: 'ready',
                updatedAt: item.updatedAt,
              },
              item: mapLegacyItem(
                item,
                `legacy:${input.scopeKey}`,
                input.scopeKey,
                sourceOrder,
              ),
              matchedTokens: input.tokens,
            });
            sourceOrder += 1;
          }
          cursor.continue();
        };
      },
    );

    console.info('[XANDEFLIX_SEARCH_SNAPSHOT]', {
      active: false,
      legacyFallback: true,
      resultCount: candidates.length,
    });
    return {
      snapshotId: `legacy:${input.scopeKey}`,
      candidates,
      status: (
        input.indexStatus === 'failed'
          ? 'index_failed'
          : candidates.length > 0
            ? 'ready'
            : 'indexing'
      ) as 'index_failed' | 'indexing' | 'ready',
      dataPath: 'LEGACY_PREFIX_WHILE_INDEXING' as const,
      processedCount: input.processedCount,
      totalItems: input.totalItems,
      indexingInBackground: input.indexStatus !== 'failed',
    };
  } finally {
    db.close();
  }
}

export const localCatalogSearchRepository: LocalCatalogSearchRepository = {
  async findCandidates({ scopeKey, tokens, normalizedQuery }) {
    const snapshot = await getReadableLocalCatalogActiveSnapshot(scopeKey);

    if (!snapshot) {
      console.info('[XANDEFLIX_SEARCH_SNAPSHOT]', { active: false });
      const legacyIndex = await ensureLegacyLocalCatalogSearchIndex(scopeKey);
      if (legacyIndex?.status === 'ready') {
        const tokenMatches = await listTokenMatches(
          legacyIndex.generation,
          tokens,
        );
        const documentIds = intersectDocumentIds(tokenMatches);
        const candidates = await loadLegacyTokenCandidates(
          legacyIndex.generation,
          scopeKey,
          legacyIndex.sourceId,
          documentIds,
          tokenMatches,
        );
        console.info('[XANDEFLIX_SEARCH_SNAPSHOT]', {
          active: false,
          legacyTokenIndex: true,
          resultCount: candidates.length,
        });
        return {
          snapshotId: legacyIndex.generation,
          candidates,
          status: 'ready',
          dataPath: 'LEGACY_TOKEN_INDEX',
          processedCount: legacyIndex.processedCount,
          totalItems: legacyIndex.totalItems,
        };
      }
      return findLegacyCandidates({
        scopeKey,
        normalizedQuery,
        tokens,
        indexStatus: legacyIndex?.status,
        processedCount: legacyIndex?.processedCount,
        totalItems: legacyIndex?.totalItems,
      });
    }

    console.info('[XANDEFLIX_SEARCH_SNAPSHOT]', { active: true });
    await ensureLocalCatalogSearchIndex({
      snapshotId: snapshot.snapshotId,
      scopeKey,
    });
    const tokenMatches = await listTokenMatches(snapshot.snapshotId, tokens);
    const documentIds = intersectDocumentIds(tokenMatches);
    const candidates = await loadCandidates(
      snapshot.snapshotId,
      scopeKey,
      documentIds,
      tokenMatches,
    );

    return {
      snapshotId: snapshot.snapshotId,
      candidates,
      status: 'ready',
      dataPath: 'ACTIVE_SNAPSHOT',
    };
  },
};
