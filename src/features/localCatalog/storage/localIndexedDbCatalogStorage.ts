import {
  clearLocalCatalogDb,
  deleteLocalCatalogItems,
  getLocalCatalogStats,
  getLocalCatalogImportMetadata,
  getLocalTmdbMetadataBySourceItemIds,
  listLocalCatalogCategoryAggregates,
  listLocalCatalogItems,
  putLocalCatalogItems,
} from '../services/localCatalogDb.service';
import type { LocalCatalogStorage } from './localCatalogStorage.types';

export function createLocalIndexedDbCatalogStorage(): LocalCatalogStorage {
  return {
    getStats: getLocalCatalogStats,
    getImportMetadata: getLocalCatalogImportMetadata,
    listCategories: listLocalCatalogCategoryAggregates,
    listItems: listLocalCatalogItems,
    getTmdbMetadataBySourceItemIds: getLocalTmdbMetadataBySourceItemIds,
    putItems: putLocalCatalogItems,
    deleteItems: deleteLocalCatalogItems,
    clear: clearLocalCatalogDb,
  };
}

export const localIndexedDbCatalogStorage = createLocalIndexedDbCatalogStorage();
