import type {
  LocalCatalogContentKind,
  LocalCatalogItem,
  LocalCatalogStats,
} from '../types/localCatalog.types';

export type CatalogRepositoryKind = 'local-indexeddb';

export type CatalogRepositoryListItemsInput = {
  readonly contentKind?: LocalCatalogContentKind;
  readonly groupTitle?: string | null;
  readonly limit?: number;
  readonly offset?: number;
};

export type CatalogRepository = {
  readonly kind: CatalogRepositoryKind;
  getStats(): Promise<LocalCatalogStats>;
  listItems(input?: CatalogRepositoryListItemsInput): Promise<LocalCatalogItem[]>;
};
