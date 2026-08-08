export type CatalogItemOpenTarget =
  | 'episode'
  | 'movie-detail'
  | 'series-detail';

type CatalogItemOpenPolicyInput = {
  categorySlug?: string;
  isMovieSeeAllPage: boolean;
  isSeriesCollection: boolean;
  isSeriesDetailPage: boolean;
  seriesKey?: string | null;
};

export function resolveCatalogItemOpenTarget({
  categorySlug,
  isMovieSeeAllPage,
  isSeriesCollection,
  isSeriesDetailPage,
  seriesKey,
}: CatalogItemOpenPolicyInput): CatalogItemOpenTarget {
  if (isSeriesDetailPage) {
    return 'episode';
  }

  if (
    categorySlug === 'series' ||
    categorySlug === 'series-group' ||
    isSeriesCollection ||
    Boolean(seriesKey)
  ) {
    return 'series-detail';
  }

  if (categorySlug === 'filmes' || isMovieSeeAllPage) {
    return 'movie-detail';
  }

  return 'episode';
}
