import type { HomeVodItem } from '../../catalog/services/homeVod.service';
import type { LocalCatalogItem } from '../types/localCatalog.types';

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
}

function buildSeriesKey(item: LocalCatalogItem): string | undefined {
  return (
    normalizeOptionalText(item.seriesName) ??
    normalizeOptionalText(item.tvgName) ??
    normalizeOptionalText(item.name)
  );
}

function buildEpisodeTitle(item: LocalCatalogItem): string | undefined {
  const explicitName = normalizeOptionalText(item.name) ?? normalizeOptionalText(item.tvgName);

  if (explicitName) {
    return explicitName;
  }

  const seasonNumber = item.seasonNumber;
  const episodeNumber = item.episodeNumber;

  if (typeof seasonNumber === 'number' && typeof episodeNumber === 'number') {
    return `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
  }

  if (typeof episodeNumber === 'number') {
    return `Episodio ${episodeNumber}`;
  }

  return undefined;
}

export function mapLocalSeriesCatalogItemToHomeVodItem(
  item: LocalCatalogItem,
): HomeVodItem {
  const groupTitle = normalizeOptionalText(item.groupTitle);
  const posterUrl = normalizeOptionalText(item.tvgLogo);
  const streamUrl = normalizeOptionalText(item.streamUrl);
  const seriesKey = buildSeriesKey(item);
  const episodeTitle = buildEpisodeTitle(item);
  const title =
    normalizeOptionalText(item.seriesName) ??
    normalizeOptionalText(item.tvgName) ??
    normalizeOptionalText(item.name) ??
    item.id;

  return {
    id: item.id,
    title,
    subtitle: groupTitle,
    posterUrl,
    streamUrl,
    groupTitle,
    kind: 'series',
    seriesKey,
    episodeTitle,
  };
}

export function mapLocalSeriesCatalogItemsToHomeVodItems(
  items: readonly LocalCatalogItem[],
): HomeVodItem[] {
  return items
    .filter((item) => item.contentKind === 'series')
    .map(mapLocalSeriesCatalogItemToHomeVodItem);
}
