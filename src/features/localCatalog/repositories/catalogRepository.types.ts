import type {
  LocalCatalogCategory,
  LocalCatalogContentKind,
  LocalCatalogImportMetadata,
  LocalCatalogItem,
  LocalCatalogStats,
  LocalTmdbMetadata,
} from '../types/localCatalog.types';

export type CatalogRepositoryKind = 'local-indexeddb';

export type CatalogRepositoryListItemsInput = {
  readonly sourceId: string;
  readonly contentKind?: LocalCatalogContentKind;
  readonly groupTitle?: string | null;
  readonly normalizedGroup?: string | null;
  readonly uncategorizedOnly?: boolean;
  readonly limit?: number;
  readonly offset?: number;
};

export type CatalogRepository = {
  readonly kind: CatalogRepositoryKind;
  getStats(): Promise<LocalCatalogStats>;
  listItems(input: CatalogRepositoryListItemsInput): Promise<LocalCatalogItem[]>;
  getTmdbMetadataBySourceItemIds?(
    sourceItemIds: string[],
  ): Promise<Map<string, LocalTmdbMetadata>>;
  getImportMetadata(sourceId: string): Promise<LocalCatalogImportMetadata | null>;
  listCategories(input: {
    sourceId: string;
    contentKind?: LocalCatalogContentKind;
  }): Promise<LocalCatalogCategory[]>;
};
