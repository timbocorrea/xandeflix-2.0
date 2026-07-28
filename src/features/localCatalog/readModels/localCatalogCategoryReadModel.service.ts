import type { HomeVodItem } from '../../catalog/services/homeVod.service';
import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import type { CatalogRepository } from '../repositories/catalogRepository.types';
import { listLocalCatalogCategories } from '../services/localCatalogCategoryIndex.service';
import { isLocalCatalogReadable } from '../services/localCatalogReadability.service';
import type { LocalCatalogCategory } from '../types/localCatalog.types';
import { mapLocalCatalogItemsToHomeVodItems } from './localCatalogHomeVodAdapter.service';

export type LocalCatalogCategoryReadResult = {
  status: 'ready' | 'unavailable';
  categories: LocalCatalogCategory[];
  items: HomeVodItem[];
};

export async function loadLocalMovieCategoryReadModel(
  {
    sourceId: rawSourceId,
    totalLimit = 800,
    maxCategories = 50,
  }: {
    sourceId: string;
    totalLimit?: number;
    maxCategories?: number;
  },
  repository: CatalogRepository = localCatalogRepository,
): Promise<LocalCatalogCategoryReadResult> {
  const sourceId = rawSourceId.trim();

  if (!sourceId) {
    return { status: 'unavailable', categories: [], items: [] };
  }

  const metadata = await repository.getImportMetadata(sourceId);

  if (!isLocalCatalogReadable(metadata)) {
    return { status: 'unavailable', categories: [], items: [] };
  }

  const categories = (
    await listLocalCatalogCategories(
      { sourceId, contentKind: 'movie' },
      repository,
    )
  ).slice(0, Math.max(1, maxCategories));

  if (categories.length === 0) {
    return { status: 'unavailable', categories: [], items: [] };
  }

  const perCategoryLimit = Math.max(
    1,
    Math.ceil(totalLimit / categories.length),
  );
  const groupedItems = await Promise.all(
    categories.map(async (category) => {
      const items = await repository.listItems({
        sourceId,
        contentKind: 'movie',
        normalizedGroup: category.isUncategorized
          ? undefined
          : category.normalizedTitle,
        uncategorizedOnly: category.isUncategorized,
        limit: perCategoryLimit,
      });

      const tmdbMetadata =
        repository.getTmdbMetadataBySourceItemIds && items.length > 0
          ? await repository.getTmdbMetadataBySourceItemIds(
              items.map((item) => item.id),
            )
          : new Map();

      return mapLocalCatalogItemsToHomeVodItems(
        items,
        category.title,
        tmdbMetadata,
      ).sort(
        (first, second) =>
          first.title.localeCompare(second.title, 'pt-BR', {
            sensitivity: 'base',
          }),
      );
    }),
  );

  return {
    status: 'ready',
    categories,
    items: groupedItems.flat().slice(0, totalLimit),
  };
}
