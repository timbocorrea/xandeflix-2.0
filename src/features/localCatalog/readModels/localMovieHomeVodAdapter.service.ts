import type { HomeVodItem } from '../../catalog/services/homeVod.service';
import type { LocalCatalogItem } from '../types/localCatalog.types';
import { mapLocalCatalogItemToHomeVodItem } from './localCatalogHomeVodAdapter.service';

export function mapLocalMovieCatalogItemToHomeVodItem(
  item: LocalCatalogItem,
): HomeVodItem {
  return {
    ...mapLocalCatalogItemToHomeVodItem(item),
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
