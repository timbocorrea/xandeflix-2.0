import type { HomeVodItem } from '../../catalog/services/homeVod.service';
import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import type { CatalogRepository } from '../repositories/catalogRepository.types';
import { listLocalCatalogCategories } from '../services/localCatalogCategoryIndex.service';
import {
  dedupeLocalCatalogGroupTitles,
  normalizeLocalCatalogGroupIdentity,
} from '../services/localCatalogGroupIdentity.service';
import { isLocalCatalogReadable } from '../services/localCatalogReadability.service';
import { getLocalCatalogScope } from '../services/localCatalogDb.service';
import type { LocalCatalogCategory } from '../types/localCatalog.types';
import {
  mapActiveSnapshotItemToLocalCatalogItem,
  mapLocalCatalogItemsToHomeVodItems,
} from './localCatalogHomeVodAdapter.service';
import {
  listActiveLocalCatalogSnapshotCategories,
  listActiveLocalCatalogSnapshotItems,
} from './localCatalogActiveSnapshotReadModel.service';
import { listStagingFirstFoldHomeVodSections } from './localCatalogFirstFoldReadModel.service';

export type LocalCatalogCategoryReadResult = {
  status: 'ready' | 'unavailable';
  categories: LocalCatalogCategory[];
  items: HomeVodItem[];
};

export const LOCAL_MOVIE_CATEGORY_PAGE_SIZE = 20;
export const LOCAL_STAGING_CATEGORY_TOTAL_LIMIT = 800;
export const LOCAL_STAGING_CATEGORY_MAX_GROUPS = 50;

export type LocalCatalogCategoryReadMode = 'stable' | 'staging' | null;

export type LocalCatalogCategoryItemSelection = {
  readMode: LocalCatalogCategoryReadMode;
  items: HomeVodItem[];
};

export function selectStableOrStagingCategoryItems(
  stableItems: readonly HomeVodItem[],
  stagingItems: readonly HomeVodItem[],
): LocalCatalogCategoryItemSelection {
  if (stableItems.length > 0) {
    return { readMode: 'stable', items: [...stableItems] };
  }

  if (stagingItems.length > 0) {
    return { readMode: 'staging', items: [...stagingItems] };
  }

  return { readMode: null, items: [] };
}

export async function loadLocalStagingCategoryReadModel({
  sourceId: rawSourceId,
  scopeKey: rawScopeKey,
  groupTitles,
  contentKind,
  totalLimit = LOCAL_STAGING_CATEGORY_TOTAL_LIMIT,
  maxGroups = LOCAL_STAGING_CATEGORY_MAX_GROUPS,
}: {
  sourceId: string;
  scopeKey: string;
  groupTitles: readonly string[];
  contentKind: 'movie' | 'series';
  totalLimit?: number;
  maxGroups?: number;
}): Promise<LocalCatalogCategoryItemSelection> {
  const sourceId = rawSourceId.trim();
  const scopeKey = rawScopeKey.trim();
  const boundedTotalLimit = Math.max(1, Math.floor(totalLimit));
  const selectedGroupTitles = dedupeLocalCatalogGroupTitles(groupTitles).slice(
    0,
    Math.max(1, Math.floor(maxGroups)),
  );

  if (!sourceId || !scopeKey || selectedGroupTitles.length === 0) {
    return { readMode: null, items: [] };
  }

  const scope = await getLocalCatalogScope(scopeKey).catch(() => null);

  if (
    !scope ||
    scope.accessStatus !== 'active' ||
    scope.sourceId !== sourceId ||
    !scope.stagingSnapshotId
  ) {
    return { readMode: null, items: [] };
  }

  const itemsPerSection = Math.max(
    1,
    Math.ceil(boundedTotalLimit / selectedGroupTitles.length),
  );
  const sections = await listStagingFirstFoldHomeVodSections({
    scopeKey,
    snapshotId: scope.stagingSnapshotId,
    sourceId,
    maxSections: selectedGroupTitles.length,
    itemsPerSection,
    movieGroupTitles: contentKind === 'movie' ? selectedGroupTitles : [],
    seriesGroupTitles: contentKind === 'series' ? selectedGroupTitles : [],
  });
  const uniqueItems = new Map<string, HomeVodItem>();

  for (const item of sections.flatMap((section) => section.items)) {
    if (item.kind === contentKind && !uniqueItems.has(item.id)) {
      uniqueItems.set(item.id, item);
    }
  }

  const items = Array.from(uniqueItems.values()).slice(0, boundedTotalLimit);
  return items.length > 0
    ? { readMode: 'staging', items }
    : { readMode: null, items: [] };
}

export type LocalMovieCategoryPageResult = {
  status: 'ready' | 'unavailable' | 'not_found';
  items: HomeVodItem[];
  rawOffset: number;
  receivedCount: number;
  totalCount: number;
  hasMore: boolean;
  resolvedCategory: LocalCatalogCategory | null;
};

export function mergeLocalMovieCategoryPageItems(
  currentItems: readonly HomeVodItem[],
  pageItems: readonly HomeVodItem[],
) {
  const uniqueItems = new Map(
    currentItems.map((item) => [item.id, item] as const),
  );

  for (const item of pageItems) {
    if (!uniqueItems.has(item.id)) {
      uniqueItems.set(item.id, item);
    }
  }

  return Array.from(uniqueItems.values());
}

export async function loadLocalMovieCategoryPage(
  {
    sourceId: rawSourceId,
    scopeKey: rawScopeKey,
    groupTitles,
    offset = 0,
    limit = LOCAL_MOVIE_CATEGORY_PAGE_SIZE,
  }: {
    sourceId: string;
    scopeKey?: string;
    groupTitles: readonly string[];
    offset?: number;
    limit?: number;
  },
  repository: CatalogRepository = localCatalogRepository,
): Promise<LocalMovieCategoryPageResult> {
  const sourceId = rawSourceId.trim();
  const scopeKey = rawScopeKey?.trim();
  const rawOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const pageLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;
  const normalizedGroupTitles = new Set(
    dedupeLocalCatalogGroupTitles(groupTitles).map((title) =>
      normalizeLocalCatalogGroupIdentity(title),
    ),
  );

  if (!sourceId || normalizedGroupTitles.size === 0) {
    return {
      status: 'unavailable',
      items: [],
      rawOffset,
      receivedCount: 0,
      totalCount: 0,
      hasMore: false,
      resolvedCategory: null,
    };
  }

  if (scopeKey) {
    const activeCategories = await listActiveLocalCatalogSnapshotCategories({
      scopeKey,
      contentKinds: ['movie'],
    }).catch(() => null);

    if (activeCategories && activeCategories.categories.length > 0) {
      const activeCategory =
        activeCategories.categories.find((category) =>
          normalizedGroupTitles.has(
            normalizeLocalCatalogGroupIdentity(category.normalizedTitle),
          ),
        ) ?? null;

      if (!activeCategory) {
        return {
          status: 'not_found',
          items: [],
          rawOffset,
          receivedCount: 0,
          totalCount: 0,
          hasMore: false,
          resolvedCategory: null,
        };
      }

      const activePage = await listActiveLocalCatalogSnapshotItems({
        scopeKey,
        contentKind: 'movie',
        normalizedGroup: activeCategory.normalizedTitle,
        offset: rawOffset,
        limit: pageLimit,
      });
      const localItems = (activePage?.items ?? []).map((item) =>
        mapActiveSnapshotItemToLocalCatalogItem(item, sourceId),
      );
      const tmdbMetadata =
        repository.getTmdbMetadataBySourceItemIds && localItems.length > 0
          ? await repository.getTmdbMetadataBySourceItemIds(
              localItems.map((item) => item.id),
            )
          : new Map();
      const resolvedCategory: LocalCatalogCategory = {
        id: activeCategory.categoryId,
        title: activeCategory.title,
        normalizedTitle: activeCategory.normalizedTitle,
        contentKind: 'movie',
        itemCount: activeCategory.itemCount,
        isUncategorized: activeCategory.isUncategorized,
        isUnknownKind: false,
      };

      return {
        status: 'ready',
        items: mapLocalCatalogItemsToHomeVodItems(
          localItems,
          resolvedCategory.title,
          tmdbMetadata,
        ),
        rawOffset,
        receivedCount: localItems.length,
        totalCount: activeCategory.itemCount,
        hasMore:
          localItems.length > 0 &&
          rawOffset + localItems.length < activeCategory.itemCount,
        resolvedCategory,
      };
    }
  }

  const metadata = await repository.getImportMetadata(sourceId);

  if (!isLocalCatalogReadable(metadata)) {
    return {
      status: 'unavailable',
      items: [],
      rawOffset,
      receivedCount: 0,
      totalCount: 0,
      hasMore: false,
      resolvedCategory: null,
    };
  }

  const categories = await listLocalCatalogCategories(
    { sourceId, contentKind: 'movie' },
    repository,
  );
  const resolvedCategory =
    categories.find((category) =>
      normalizedGroupTitles.has(
        normalizeLocalCatalogGroupIdentity(category.normalizedTitle),
      ),
    ) ?? null;

  if (!resolvedCategory) {
    return {
      status: 'not_found',
      items: [],
      rawOffset,
      receivedCount: 0,
      totalCount: 0,
      hasMore: false,
      resolvedCategory: null,
    };
  }

  const localItems = await repository.listItems({
    sourceId,
    contentKind: 'movie',
    normalizedGroup: resolvedCategory.isUncategorized
      ? undefined
      : resolvedCategory.normalizedTitle,
    uncategorizedOnly: resolvedCategory.isUncategorized,
    offset: rawOffset,
    limit: pageLimit,
  });
  const tmdbMetadata =
    repository.getTmdbMetadataBySourceItemIds && localItems.length > 0
      ? await repository.getTmdbMetadataBySourceItemIds(
          localItems.map((item) => item.id),
        )
      : new Map();
  const receivedCount = localItems.length;
  const totalCount = resolvedCategory.itemCount;

  return {
    status: 'ready',
    items: mapLocalCatalogItemsToHomeVodItems(
      localItems,
      resolvedCategory.title,
      tmdbMetadata,
    ),
    rawOffset,
    receivedCount,
    totalCount,
    hasMore:
      receivedCount > 0 && rawOffset + receivedCount < totalCount,
    resolvedCategory,
  };
}

export async function loadLocalMovieCategoryReadModel(
  {
    sourceId: rawSourceId,
    scopeKey: rawScopeKey,
    totalLimit = 800,
    maxCategories = 50,
  }: {
    sourceId: string;
    scopeKey?: string;
    totalLimit?: number;
    maxCategories?: number;
  },
  repository: CatalogRepository = localCatalogRepository,
): Promise<LocalCatalogCategoryReadResult> {
  const sourceId = rawSourceId.trim();
  const scopeKey = rawScopeKey?.trim();

  if (!sourceId) {
    return { status: 'unavailable', categories: [], items: [] };
  }

  if (scopeKey) {
    const activeCategories = await listActiveLocalCatalogSnapshotCategories({
      scopeKey,
      contentKinds: ['movie'],
    }).catch(() => null);

    if (activeCategories?.categories.length) {
      const selectedCategories = activeCategories.categories.slice(
        0,
        Math.max(1, maxCategories),
      );
      const perCategoryLimit = Math.max(
        1,
        Math.ceil(totalLimit / selectedCategories.length),
      );
      const groupedItems = await Promise.all(
        selectedCategories.map(async (category) => {
          const page = await listActiveLocalCatalogSnapshotItems({
            scopeKey,
            contentKind: 'movie',
            normalizedGroup: category.normalizedTitle,
            limit: perCategoryLimit,
          });
          const localItems = (page?.items ?? []).map((item) =>
            mapActiveSnapshotItemToLocalCatalogItem(item, sourceId),
          );
          const tmdbMetadata =
            repository.getTmdbMetadataBySourceItemIds && localItems.length > 0
              ? await repository.getTmdbMetadataBySourceItemIds(
                  localItems.map((item) => item.id),
                )
              : new Map();

          return mapLocalCatalogItemsToHomeVodItems(
            localItems,
            category.title,
            tmdbMetadata,
          ).sort((first, second) =>
            first.title.localeCompare(second.title, 'pt-BR', {
              sensitivity: 'base',
            }),
          );
        }),
      );
      const categories: LocalCatalogCategory[] = selectedCategories.map(
        (category) => ({
          id: category.categoryId,
          title: category.title,
          normalizedTitle: category.normalizedTitle,
          contentKind: 'movie',
          itemCount: category.itemCount,
          isUncategorized: category.isUncategorized,
          isUnknownKind: false,
        }),
      );

      return {
        status: 'ready',
        categories,
        items: groupedItems.flat().slice(0, totalLimit),
      };
    }
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
