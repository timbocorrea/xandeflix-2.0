import {
  clearLocalCatalogDb,
  deleteLocalCatalogItems,
  getLocalCatalogStats,
  listLocalCatalogItems,
  putLocalCatalogItems,
} from '../services/localCatalogDb.service';
import type { LocalCatalogStorage } from './localCatalogStorage.types';

export function createLocalIndexedDbCatalogStorage(): LocalCatalogStorage {
  return {
    getStats: getLocalCatalogStats,
    listItems: listLocalCatalogItems,
    putItems: putLocalCatalogItems,
    deleteItems: deleteLocalCatalogItems,
    clear: clearLocalCatalogDb,
  };
}

export const localIndexedDbCatalogStorage = createLocalIndexedDbCatalogStorage();
