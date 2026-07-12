import {
  clearLocalCatalogDb,
  deleteLocalCatalogItems,
  getLocalCatalogStats,
  getLocalCatalogImportMetadata,
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
    putItems: putLocalCatalogItems,
    deleteItems: deleteLocalCatalogItems,
    clear: clearLocalCatalogDb,
  };
}

export const localIndexedDbCatalogStorage = createLocalIndexedDbCatalogStorage();
