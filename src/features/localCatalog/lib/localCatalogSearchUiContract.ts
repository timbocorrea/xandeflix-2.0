export const LOCAL_CATALOG_SEARCH_ROUTE = '/search';
export const LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY =
  'local-catalog-search-input';

export function getLocalCatalogSearchResultFocusKey(index: number) {
  return `local-catalog-search-result-${Math.max(0, index)}`;
}

export function resolveLocalCatalogSearchInputArrowTarget(
  key: string,
  hasResults: boolean,
) {
  return key === 'ArrowDown' && hasResults
    ? getLocalCatalogSearchResultFocusKey(0)
    : null;
}

export function buildLocalCatalogSearchReturnTo(
  pathname: string,
  search: string,
) {
  return `${pathname}${search}`;
}

export function buildLocalCatalogSeriesDetailRoute(input: {
  title: string;
  groupTitle: string | null;
  seriesKey?: string;
}) {
  const params = new URLSearchParams({
    title: input.title,
    groupTitle: input.groupTitle ?? '',
  });
  if (input.seriesKey?.trim()) {
    params.set('seriesKey', input.seriesKey);
  }
  return `/category/series-detail?${params.toString()}`;
}
