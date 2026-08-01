import type {
  IptvChannel,
  LoadedPlaylist,
} from '@/features/playlists/types/playlist';
import {
  SOURCE_FIXTURE_V1,
  SOURCE_FIXTURE_V2,
} from '@/features/catalog/services/u2f4d6SmokeTest.service';
import {
  computeLocalCatalogSnapshotContentFingerprint,
} from '../readModels/localCatalogActiveSnapshotReadModel.service';
import {
  getLocalCatalogMetadata,
  getLocalCatalogSnapshot,
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
  putLocalCatalogMetadata,
} from './localCatalogDb.service';
import {
  refreshLocalCatalogInBackground,
  resetLocalCatalogBackgroundRefreshRuntimeStateForTests,
  type LocalCatalogBackgroundRefreshDependencies,
} from './localCatalogBackgroundRefresh.service';
import { prepareLocalCatalogRuntimeSnapshotBridge } from './localCatalogRuntimeSnapshotBridge.service';
import { deriveLocalCatalogScope } from './localCatalogScope.service';
import { getReadableLocalCatalogActiveSnapshot } from './localCatalogSnapshotLifecycle.service';
import type {
  LocalCatalogSearchDocument,
  LocalCatalogSnapshotCategory,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';

const SOURCE_ID = 'synthetic-f4d6-browser-source';
const INTERNAL_LICENSE_ID = 'synthetic-f4d6-browser-license';

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('F4D6_BROWSER_READ_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(new Error('F4D6_BROWSER_TRANSACTION_FAILED'));
  });
}

function loadedFixture(
  fixture: IptvChannel[],
  responseEtag: string,
): LoadedPlaylist {
  return {
    channels: [],
    total: fixture.length,
    responseEtag,
    diagnostics: {
      contentLength: fixture.length * 128,
      totalLines: fixture.length * 2 + 1,
      startsWithExtM3u: true,
      extinfLines: fixture.length,
      playableUrlLines: fixture.length,
      firstNonEmptyLine: '#EXTM3U',
    },
  };
}

async function inspectGeneration(snapshotId: string) {
  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.items,
        LOCAL_CATALOG_V3_STORES.categories,
        LOCAL_CATALOG_V3_STORES.searchDocuments,
      ],
      'readonly',
    );
    const completed = transactionDone(transaction);
    const items = requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.items)
        .index('snapshotId')
        .getAll(IDBKeyRange.only(snapshotId)),
    ) as Promise<LocalCatalogSnapshotItem[]>;
    const categories = requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.categories)
        .index('snapshotId')
        .getAll(IDBKeyRange.only(snapshotId)),
    ) as Promise<LocalCatalogSnapshotCategory[]>;
    const searchDocuments = requestResult(
      transaction
        .objectStore(LOCAL_CATALOG_V3_STORES.searchDocuments)
        .index('snapshotId')
        .getAll(IDBKeyRange.only(snapshotId)),
    ) as Promise<LocalCatalogSearchDocument[]>;
    const records = await Promise.all([items, categories, searchDocuments]);
    await completed;
    return {
      items: records[0],
      categories: records[1],
      searchDocuments: records[2],
    };
  } finally {
    db.close();
  }
}

export async function runLocalCatalogSourceFreshnessSmokeTest() {
  const derivedScope = await deriveLocalCatalogScope({
    internalLicenseId: INTERNAL_LICENSE_ID,
    sourceId: SOURCE_ID,
  });
  let fixture = SOURCE_FIXTURE_V1;
  let responseEtag = '"synthetic-v1"';
  let requestCount = 0;
  let activeGenerationObservedDuringV2: string | null = null;
  let collectChannelsDisabled = true;
  let conditionalHeaderObserved = false;

  const dependencies: LocalCatalogBackgroundRefreshDependencies = {
    loadPlaylist: async (_source, options) => {
      requestCount += 1;
      collectChannelsDisabled =
        collectChannelsDisabled && options?.collectChannels === false;
      conditionalHeaderObserved =
        conditionalHeaderObserved ||
        options?.conditionalHeaders?.ifNoneMatch === '"synthetic-v1"';
      await options?.onChannelsBatch?.(fixture.slice(0, 2));

      if (fixture === SOURCE_FIXTURE_V2) {
        activeGenerationObservedDuringV2 =
          (await getReadableLocalCatalogActiveSnapshot(derivedScope.scopeKey))
            ?.snapshotId ?? null;
      }

      await options?.onChannelsBatch?.(fixture.slice(2));
      return loadedFixture(fixture, responseEtag);
    },
    prepareBridge: prepareLocalCatalogRuntimeSnapshotBridge,
    getActiveSnapshot: getReadableLocalCatalogActiveSnapshot,
    computeFingerprint: computeLocalCatalogSnapshotContentFingerprint,
    readMetadata: getLocalCatalogMetadata,
    writeMetadata: putLocalCatalogMetadata,
  };
  const input = {
    source: {
      sourceType: 'm3u' as const,
      sourceId: SOURCE_ID,
      url: 'https://synthetic.invalid/f4d6.m3u',
    },
    authorizationContext: {
      internalLicenseId: INTERNAL_LICENSE_ID,
      sourceId: SOURCE_ID,
    },
    scopeKey: derivedScope.scopeKey,
    force: true,
  };

  resetLocalCatalogBackgroundRefreshRuntimeStateForTests();
  const v1Import = await refreshLocalCatalogInBackground(input, dependencies);
  const generationV1 = v1Import.activeGenerationId;
  const v1Records = generationV1
    ? await inspectGeneration(generationV1)
    : { items: [], categories: [], searchDocuments: [] };

  const unchangedImport = await refreshLocalCatalogInBackground(
    input,
    dependencies,
  );
  const activeAfterUnchanged = await getReadableLocalCatalogActiveSnapshot(
    derivedScope.scopeKey,
  );

  fixture = SOURCE_FIXTURE_V2;
  responseEtag = '"synthetic-v2"';
  const v2Import = await refreshLocalCatalogInBackground(input, dependencies);
  const generationV2 = v2Import.activeGenerationId;
  const v2Records = generationV2
    ? await inspectGeneration(generationV2)
    : { items: [], categories: [], searchDocuments: [] };
  const oldSnapshot = generationV1
    ? await getLocalCatalogSnapshot(generationV1)
    : null;

  const preservedV1 = v1Records.items.find(
    (item) => item.rawName === 'Synthetic Preserved Movie',
  );
  const preservedV2 = v2Records.items.find(
    (item) => item.rawName === 'Synthetic Preserved Movie',
  );
  const alteredV1 = v1Records.items.find((item) =>
    item.rawName.includes('Synthetic Altered Movie'),
  );
  const alteredV2 = v2Records.items.find((item) =>
    item.rawName.includes('Synthetic Altered Movie'),
  );
  const sameTitleItems = v2Records.items.filter(
    (item) => item.rawName === 'Synthetic Same Title',
  );
  const episodeItems = v2Records.items.filter((item) =>
    item.rawName.startsWith('Synthetic Series S01E'),
  );

  const stableBeforeFailure = generationV2;
  dependencies.loadPlaylist = async () => loadedFixture([], '"empty"');
  const emptyFailure = await refreshLocalCatalogInBackground(input, dependencies);
  const activeAfterEmpty = await getReadableLocalCatalogActiveSnapshot(
    derivedScope.scopeKey,
  );
  dependencies.loadPlaylist = async (_source, options) => {
    await options?.onChannelsBatch?.(SOURCE_FIXTURE_V2.slice(0, 1));
    throw Object.assign(new Error('LOCAL_CATALOG_REFRESH_CANCELED'), {
      name: 'AbortError',
    });
  };
  const canceledFailure = await refreshLocalCatalogInBackground(
    input,
    dependencies,
  );
  const activeAfterCanceled = await getReadableLocalCatalogActiveSnapshot(
    derivedScope.scopeKey,
  );

  const checks = {
    v1Promoted:
      v1Import.status === 'changed' &&
      v1Import.promoted &&
      v1Records.items.length === SOURCE_FIXTURE_V1.length,
    unchangedSkippedPromotion:
      unchangedImport.status === 'unchanged' &&
      !unchangedImport.promoted &&
      activeAfterUnchanged?.snapshotId === generationV1,
    v2PromotedAtomically:
      v2Import.status === 'changed' &&
      v2Import.promoted &&
      activeGenerationObservedDuringV2 === generationV1 &&
      generationV2 !== generationV1,
    exactV2Items: v2Records.items.length === SOURCE_FIXTURE_V2.length,
    exactV2SearchDocuments:
      v2Records.searchDocuments.length === SOURCE_FIXTURE_V2.length,
    categorySetRebuilt:
      v2Records.categories.some(
        (category) => category.normalizedTitle === 'synthetic new category',
      ),
    preservedIdentity:
      Boolean(preservedV1) && preservedV1?.itemId === preservedV2?.itemId,
    removedIdentityAbsent: !v2Records.items.some(
      (item) => item.rawName === 'Synthetic Removed Movie',
    ),
    alteredPayloadReplaced:
      Boolean(alteredV1) &&
      alteredV1?.itemId !== alteredV2?.itemId &&
      !v2Records.items.some(
        (item) => item.rawName === 'Synthetic Altered Movie V1',
      ) &&
      alteredV2?.rawName.endsWith('V2') === true,
    sameTitleDifferentStreamsDistinct:
      sameTitleItems.length === 2 &&
      sameTitleItems[0]?.itemId !== sameTitleItems[1]?.itemId,
    distinctEpisodesPreserved:
      episodeItems.length === 2 &&
      episodeItems[0]?.itemId !== episodeItems[1]?.itemId,
    previousGenerationSuperseded: oldSnapshot?.status === 'superseded',
    conditionalHeaderUsed: conditionalHeaderObserved,
    boundedCollection: collectChannelsDisabled,
    oneRequestPerRefresh: requestCount === 3,
    emptyFailurePreservedActive:
      emptyFailure.status === 'failed' &&
      activeAfterEmpty?.snapshotId === stableBeforeFailure,
    canceledFailurePreservedActive:
      canceledFailure.status === 'canceled' &&
      activeAfterCanceled?.snapshotId === stableBeforeFailure,
  };

  return {
    ok: Object.values(checks).every(Boolean),
    checks,
  };
}
