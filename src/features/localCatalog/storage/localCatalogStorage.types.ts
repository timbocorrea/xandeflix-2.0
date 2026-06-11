import type {
  ListLocalCatalogItemsInput,
  LocalCatalogItem,
  LocalCatalogStats,
} from '../types/localCatalog.types';

export type LocalCatalogStorage = {
  getStats(): Promise<LocalCatalogStats>;
  listItems(input?: ListLocalCatalogItemsInput): Promise<LocalCatalogItem[]>;
  putItems(items: LocalCatalogItem[]): Promise<void>;
  deleteItems(itemIds: string[]): Promise<void>;
  clear(): Promise<void>;
};
