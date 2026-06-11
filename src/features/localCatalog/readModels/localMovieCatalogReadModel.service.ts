import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import type { CatalogRepository } from '../repositories/catalogRepository.types';
import type { LocalCatalogItem } from '../types/localCatalog.types';

export type ListLocalMovieCatalogItemsInput = {
  readonly groupTitle?: string;
  readonly limit?: number;
  readonly offset?: number;
};

export type LocalMovieCatalogReadModel = {
  readonly source: 'local-first-foundation';
  listMovies(input?: ListLocalMovieCatalogItemsInput): Promise<LocalCatalogItem[]>;
};

export function createLocalMovieCatalogReadModel(
  repository: CatalogRepository = localCatalogRepository,
): LocalMovieCatalogReadModel {
  return {
    source: 'local-first-foundation',
    listMovies: (input = {}) =>
      repository.listItems({
        ...input,
        contentKind: 'movie',
      }),
  };
}

export const localMovieCatalogReadModel = createLocalMovieCatalogReadModel();
