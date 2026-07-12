import type {
  HomeVodItem,
  HomeVodKind,
  HomeVodSection,
} from '../../catalog/services/homeVod.service';
import type { LocalCatalogItem } from '../types/localCatalog.types';
import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import type { CatalogRepository } from '../repositories/catalogRepository.types';
import { listLocalCatalogCategories } from '../services/localCatalogCategoryIndex.service';

function normalizeOptionalText(value?: string | null) {
  const normalizedValue = value?.trim();
  return normalizedValue || undefined;
}

export function getSafeLocalCatalogArtworkUrl(value?: string | null) {
  const candidate = normalizeOptionalText(value);

  if (!candidate) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(candidate);

    if (
      (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return undefined;
    }

    return candidate;
  } catch {
    return undefined;
  }
}

function toHomeVodKind(item: LocalCatalogItem): HomeVodKind {
  if (item.contentKind === 'movie' || item.contentKind === 'series') {
    return item.contentKind;
  }

  return 'unknown';
}

export function mapLocalCatalogItemToHomeVodItem(
  item: LocalCatalogItem,
  groupTitleOverride?: string,
): HomeVodItem {
  const originalGroupTitle = normalizeOptionalText(item.groupTitle);
  const groupTitle =
    normalizeOptionalText(groupTitleOverride) ?? originalGroupTitle;
  const title =
    normalizeOptionalText(item.rawName) ??
    normalizeOptionalText(item.name) ??
    normalizeOptionalText(item.tvgName) ??
    item.id;

  return {
    id: item.id,
    title,
    subtitle: groupTitle,
    posterUrl: getSafeLocalCatalogArtworkUrl(item.tvgLogo),
    streamUrl: normalizeOptionalText(item.streamUrl),
    groupTitle,
    kind: toHomeVodKind(item),
  };
}

export function mapLocalCatalogItemsToHomeVodItems(
  items: readonly LocalCatalogItem[],
  groupTitleOverride?: string,
) {
  return items.map((item) =>
    mapLocalCatalogItemToHomeVodItem(item, groupTitleOverride),
  );
}

export async function loadLocalCatalogHomeVodSections(
  {
    sourceId: rawSourceId,
    maxSections = 8,
    itemsPerSection = 20,
  }: {
    sourceId: string;
    maxSections?: number;
    itemsPerSection?: number;
  },
  repository: CatalogRepository = localCatalogRepository,
): Promise<HomeVodSection[]> {
  const sourceId = rawSourceId.trim();

  if (!sourceId) {
    return [];
  }

  const metadata = await repository.getImportMetadata(sourceId);

  if (
    metadata?.status !== 'ready' ||
    metadata.sourceType !== 'm3u' ||
    metadata.importedCount <= 0
  ) {
    return [];
  }

  const movieCategories = await listLocalCatalogCategories(
    { sourceId, contentKind: 'movie' },
    repository,
  );
  const unknownCategories = await listLocalCatalogCategories(
    { sourceId, contentKind: 'unknown' },
    repository,
  );
  const selectedMovieCategories = movieCategories.slice(
    0,
    Math.max(0, maxSections - (unknownCategories.length > 0 ? 1 : 0)),
  );
  const movieSections = await Promise.all(
    selectedMovieCategories.map(async (category) => {
      const items = await repository.listItems({
        sourceId,
        contentKind: 'movie',
        normalizedGroup: category.isUncategorized
          ? undefined
          : category.normalizedTitle,
        uncategorizedOnly: category.isUncategorized,
        limit: itemsPerSection,
      });

      return {
        id: `home-local-${category.id}`,
        title: category.title,
        eyebrow: '',
        description: 'Conteúdos disponíveis no catálogo local autorizado.',
        items: mapLocalCatalogItemsToHomeVodItems(items, category.title),
      } satisfies HomeVodSection;
    }),
  );
  const sections = movieSections.filter((section) => section.items.length > 0);

  if (unknownCategories.length > 0 && sections.length < maxSections) {
    const unknownItems = await repository.listItems({
      sourceId,
      contentKind: 'unknown',
      limit: itemsPerSection,
    });

    if (unknownItems.length > 0) {
      sections.push({
        id: 'home-local-unknown',
        title: 'Não classificados',
        eyebrow: '',
        description: 'Itens preservados sem classificação conclusiva.',
        items: mapLocalCatalogItemsToHomeVodItems(
          unknownItems,
          'Não classificados',
        ),
      });
    }
  }

  return sections;
}
