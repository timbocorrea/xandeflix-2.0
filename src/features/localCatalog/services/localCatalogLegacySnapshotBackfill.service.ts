import type {
  LocalCatalogItem,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';
import {
  LOCAL_CATALOG_DB_VERSION,
  listLocalCatalogItemsAfterId,
} from './localCatalogDb.service';
import {
  beginLocalCatalogStagingSnapshot,
  cancelLocalCatalogStagingSnapshot,
  getReadableLocalCatalogActiveSnapshot,
  markLocalCatalogSnapshotReady,
  markLocalCatalogSnapshotValidating,
  prepareLocalCatalogRuntimeScope,
  promoteLocalCatalogStagingSnapshot,
  writeLocalCatalogSnapshotBatch,
} from './localCatalogSnapshotLifecycle.service';

const BACKFILL_BATCH_SIZE = 500;
const PARSER_VERSION = 1;

const activeBackfills = new Map<string, Promise<string | null>>();

function sanitizeBackfillFailureCode(error: unknown) {
  if (
    error instanceof Error &&
    /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(error.message)
  ) {
    return error.message;
  }

  return 'LOCAL_CATALOG_BACKFILL_FAILED';
}

function createSnapshotId() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('LOCAL_CATALOG_SNAPSHOT_ID_UNAVAILABLE');
  }

  return `snapshot_${globalThis.crypto.randomUUID()}`;
}

function normalize(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mapLegacyItemToSnapshotItem(
  item: LocalCatalogItem,
  input: {
    snapshotId: string;
    scopeKey: string;
    sourceOrder: number;
  },
): LocalCatalogSnapshotItem {
  const rawName = (item.rawName ?? item.name).trim();
  const rawGroupTitle = item.groupTitle?.trim() || null;

  return {
    snapshotId: input.snapshotId,
    itemId: item.id,
    scopeKey: input.scopeKey,
    logicalIdentity: {
      version: 1,
      strategy: 'url_fallback',
      value: item.id,
    },
    sourceItemId: item.id,
    contentKind: item.contentKind,
    rawName,
    normalizedName: item.normalizedName || normalize(rawName),
    rawGroupTitle,
    normalizedGroup:
      item.normalizedGroup?.trim() || normalize(rawGroupTitle) || null,
    streamUrl: item.streamUrl.trim(),
    artworkUrl: item.tvgLogo?.trim() || null,
    sourceOrder: input.sourceOrder,
    classificationVersion: item.classificationVersion ?? 1,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function runBackfill(input: {
  scopeKey: string;
  tenantScopeId: string;
  sourceId: string;
}) {
  const existing = await getReadableLocalCatalogActiveSnapshot(input.scopeKey);

  if (existing) {
    console.info('[XANDEFLIX_V3_BACKFILL]', {
      status: 'active',
      reused: true,
    });
    return existing.snapshotId;
  }

  console.info('[XANDEFLIX_V3_BACKFILL]', { status: 'start' });

  const preparedScope = await prepareLocalCatalogRuntimeScope({
    scopeKey: input.scopeKey,
    tenantScopeId: input.tenantScopeId,
    sourceId: input.sourceId,
    timestamp: new Date().toISOString(),
  });

  const snapshotId = createSnapshotId();
  const sourceRevision = 'legacy-local-catalog-v1';

  await beginLocalCatalogStagingSnapshot({
    scopeKey: input.scopeKey,
    snapshotId,
    expectedRuntimeEpoch: preparedScope.runtimeEpoch,
    sourceRevision,
    classificationVersion: 1,
    schemaVersion: LOCAL_CATALOG_DB_VERSION,
    parserVersion: PARSER_VERSION,
    timestamp: new Date().toISOString(),
  });

  let offset = 0;
  let afterItemId: string | null = null;
  let confirmedItems = 0;
  let batchSequence = 0;

  try {
    for (;;) {
      const legacyItems = await listLocalCatalogItemsAfterId({
        sourceId: input.sourceId,
        limit: BACKFILL_BATCH_SIZE,
        afterItemId,
      });

      if (legacyItems.length === 0) {
        break;
      }

      const snapshotItems = legacyItems.map((item, index) =>
        mapLegacyItemToSnapshotItem(item, {
          snapshotId,
          scopeKey: input.scopeKey,
          sourceOrder: offset + index,
        }),
      );

      batchSequence += 1;
      confirmedItems += snapshotItems.length;

      await writeLocalCatalogSnapshotBatch({
        scopeKey: input.scopeKey,
        snapshotId,
        expectedRuntimeEpoch: preparedScope.runtimeEpoch,
        batchSequence,
        confirmedItems,
        confirmedBytes: 0,
        sourceRevision,
        sourceEtag: null,
        sourceLastModified: null,
        parserVersion: PARSER_VERSION,
        updatedAt: new Date().toISOString(),
        items: snapshotItems,
        parsedItemsInBatch: legacyItems.length,
      });

      offset += legacyItems.length;
      afterItemId = legacyItems[legacyItems.length - 1].id;

      if (legacyItems.length < BACKFILL_BATCH_SIZE) {
        break;
      }
    }

    if (confirmedItems === 0) {
      await cancelLocalCatalogStagingSnapshot({
        scopeKey: input.scopeKey,
        snapshotId,
        expectedRuntimeEpoch: preparedScope.runtimeEpoch,
        timestamp: new Date().toISOString(),
        failureCode: 'LOCAL_CATALOG_BACKFILL_EMPTY',
      });

      console.warn('[XANDEFLIX_V3_BACKFILL]', {
        status: 'empty',
        failureCode: 'LOCAL_CATALOG_BACKFILL_EMPTY',
      });
      return null;
    }

    await markLocalCatalogSnapshotValidating({
      scopeKey: input.scopeKey,
      snapshotId,
      expectedRuntimeEpoch: preparedScope.runtimeEpoch,
      timestamp: new Date().toISOString(),
    });

    await markLocalCatalogSnapshotReady({
      scopeKey: input.scopeKey,
      snapshotId,
      expectedRuntimeEpoch: preparedScope.runtimeEpoch,
      timestamp: new Date().toISOString(),
      expectedTotalItems: confirmedItems,
    });

    await promoteLocalCatalogStagingSnapshot({
      scopeKey: input.scopeKey,
      snapshotId,
      expectedRuntimeEpoch: preparedScope.runtimeEpoch,
      timestamp: new Date().toISOString(),
    });

    console.info('[XANDEFLIX_V3_BACKFILL]', {
      status: 'active',
      reused: false,
    });
    return snapshotId;
  } catch (error) {
    const failureCode = sanitizeBackfillFailureCode(error);
    await cancelLocalCatalogStagingSnapshot({
      scopeKey: input.scopeKey,
      snapshotId,
      expectedRuntimeEpoch: preparedScope.runtimeEpoch,
      timestamp: new Date().toISOString(),
      failureCode,
    }).catch(() => undefined);

    console.warn('[XANDEFLIX_V3_BACKFILL]', {
      status: 'failed',
      failureCode,
    });
    throw error;
  }
}

export function ensureLocalCatalogLegacySnapshot(input: {
  scopeKey: string;
  tenantScopeId: string;
  sourceId: string;
}) {
  const existing = activeBackfills.get(input.scopeKey);

  if (existing) {
    return existing;
  }

  const backfill = runBackfill(input).finally(() => {
    activeBackfills.delete(input.scopeKey);
  });

  activeBackfills.set(input.scopeKey, backfill);

  return backfill;
}
