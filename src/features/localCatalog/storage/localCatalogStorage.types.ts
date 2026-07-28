import type {
  ListLocalCatalogItemsInput,
  LocalCatalogCategory,
  LocalCatalogContentKind,
  LocalCatalogImportMetadata,
  LocalCatalogItem,
  LocalCatalogStats,
  LocalTmdbMetadata,
} from '../types/localCatalog.types';

export type LocalCatalogStorage = {
  getStats(): Promise<LocalCatalogStats>;
  getImportMetadata(sourceId: string): Promise<LocalCatalogImportMetadata | null>;
  listCategories(input: {
    sourceId: string;
    contentKind?: LocalCatalogContentKind;
  }): Promise<LocalCatalogCategory[]>;
  listItems(input?: ListLocalCatalogItemsInput): Promise<LocalCatalogItem[]>;
  getTmdbMetadataBySourceItemIds(
    sourceItemIds: string[],
  ): Promise<Map<string, LocalTmdbMetadata>>;
  putItems(items: LocalCatalogItem[]): Promise<void>;
  deleteItems(itemIds: string[]): Promise<void>;
  clear(): Promise<void>;
};
