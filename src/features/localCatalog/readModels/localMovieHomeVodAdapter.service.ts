import type { HomeVodItem } from '../../catalog/services/homeVod.service';
import type { LocalCatalogItem } from '../types/localCatalog.types';

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
}

export function mapLocalMovieCatalogItemToHomeVodItem(
  item: LocalCatalogItem,
): HomeVodItem {
  const groupTitle = normalizeOptionalText(item.groupTitle);
  const posterUrl = normalizeOptionalText(item.tvgLogo);
  const streamUrl = normalizeOptionalText(item.streamUrl);
  const title =
    normalizeOptionalText(item.name) ??
    normalizeOptionalText(item.tvgName) ??
    item.id;

  return {
    id: item.id,
    title,
    subtitle: groupTitle,
    posterUrl,
    streamUrl,
    groupTitle,
    kind: 'movie',
  };
}

export function mapLocalMovieCatalogItemsToHomeVodItems(
  items: readonly LocalCatalogItem[],
): HomeVodItem[] {
  return items
    .filter((item) => item.contentKind === 'movie')
    .map(mapLocalMovieCatalogItemToHomeVodItem);
}
