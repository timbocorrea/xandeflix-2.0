import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import type { CatalogRepository } from '../repositories/catalogRepository.types';
import type {
  LocalCatalogCategory,
  LocalCatalogContentKind,
} from '../types/localCatalog.types';

export type ListLocalCatalogCategoriesInput = {
  sourceId: string;
  contentKind?: LocalCatalogContentKind;
};

export async function listLocalCatalogCategories(
  input: ListLocalCatalogCategoriesInput,
  repository: CatalogRepository = localCatalogRepository,
): Promise<LocalCatalogCategory[]> {
  const sourceId = input.sourceId.trim();

  if (!sourceId) {
    return [];
  }

  return repository.listCategories({
    sourceId,
    contentKind: input.contentKind,
  });
}
