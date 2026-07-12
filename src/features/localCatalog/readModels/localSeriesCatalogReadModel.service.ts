import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import type { CatalogRepository } from '../repositories/catalogRepository.types';
import type { LocalCatalogItem } from '../types/localCatalog.types';

export type ListLocalSeriesCatalogItemsInput = {
  readonly groupTitle?: string;
  readonly limit?: number;
  readonly offset?: number;
};

export type LocalSeriesCatalogReadModel = {
  readonly source: 'local-first-foundation';
  listSeries(input?: ListLocalSeriesCatalogItemsInput): Promise<LocalCatalogItem[]>;
};

export function createLocalSeriesCatalogReadModel(
  repository: CatalogRepository = localCatalogRepository,
): LocalSeriesCatalogReadModel {
  return {
    source: 'local-first-foundation',
    listSeries: (input = {}) =>
      repository.listItems({
        ...input,
        contentKind: 'series',
      }),
  };
}

export const localSeriesCatalogReadModel = createLocalSeriesCatalogReadModel();
