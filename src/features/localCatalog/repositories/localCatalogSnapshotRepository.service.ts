import {
  getLocalCatalogImportCheckpoint,
  getLocalCatalogScope,
  getLocalCatalogSnapshot,
  listLocalCatalogSnapshots,
  markLocalCatalogScopeAccess,
  prepareLocalCatalogScopePointers,
  putLocalCatalogImportCheckpoint,
  putLocalCatalogScope,
  putLocalCatalogSnapshot,
} from '../services/localCatalogDb.service';
import type {
  LocalCatalogImportCheckpoint,
  LocalCatalogScope,
  LocalCatalogScopeAccessStatus,
  LocalCatalogSnapshot,
} from '../types/localCatalog.types';

export type LocalCatalogScopeRemovalPlan = {
  scopeKey: string;
  scopeStore: 'catalogScopes';
  snapshotLookupStore: 'importSnapshots';
  snapshotDependentStores: readonly string[];
  execution: 'not_implemented';
};

export type LocalCatalogSnapshotRepository = {
  putScope(scope: LocalCatalogScope): Promise<void>;
  getScope(scopeKey: string): Promise<LocalCatalogScope | null>;
  markScopeAccess(
    scopeKey: string,
    status: LocalCatalogScopeAccessStatus,
  ): Promise<LocalCatalogScope>;
  prepareScopePointers(
    scopeKey: string,
    pointers: Pick<LocalCatalogScope, 'activeSnapshotId' | 'stagingSnapshotId'>,
  ): Promise<LocalCatalogScope>;
  putSnapshot(snapshot: LocalCatalogSnapshot): Promise<void>;
  getSnapshot(snapshotId: string): Promise<LocalCatalogSnapshot | null>;
  listSnapshots(scopeKey: string): Promise<LocalCatalogSnapshot[]>;
  putCheckpoint(checkpoint: LocalCatalogImportCheckpoint): Promise<void>;
  getCheckpoint(snapshotId: string): Promise<LocalCatalogImportCheckpoint | null>;
  planScopeRemoval(scopeKey: string): LocalCatalogScopeRemovalPlan;
};

const SNAPSHOT_DEPENDENT_STORES = [
  'importCheckpoints', 'catalogSnapshotItems',
  'catalogSnapshotCategories', 'searchDocuments', 'searchTokens',
  'catalogSnapshotMetrics',
] as const;

export function createLocalCatalogSnapshotRepository(): LocalCatalogSnapshotRepository {
  return {
    putScope: putLocalCatalogScope,
    getScope: getLocalCatalogScope,
    markScopeAccess: markLocalCatalogScopeAccess,
    prepareScopePointers: prepareLocalCatalogScopePointers,
    putSnapshot: putLocalCatalogSnapshot,
    getSnapshot: getLocalCatalogSnapshot,
    listSnapshots: listLocalCatalogSnapshots,
    putCheckpoint: putLocalCatalogImportCheckpoint,
    getCheckpoint: getLocalCatalogImportCheckpoint,
    planScopeRemoval: (scopeKey) => ({
      scopeKey,
      scopeStore: 'catalogScopes',
      snapshotLookupStore: 'importSnapshots',
      snapshotDependentStores: SNAPSHOT_DEPENDENT_STORES,
      execution: 'not_implemented',
    }),
  };
}
