import type { LocalCatalogSearchPage } from '../readModels/localCatalogSearchReadModel.service';

export const LOCAL_CATALOG_SEARCH_ROUTE = '/search';
export const LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY =
  'local-catalog-search-input';
export const LOCAL_CATALOG_SEARCH_INDEX_RETRY_FOCUS_KEY =
  'local-catalog-search-retry-index';
export const LOCAL_CATALOG_SEARCH_QUERY_RETRY_FOCUS_KEY =
  'local-catalog-search-retry-query';

export type LocalCatalogSearchNativeInputLifecycleEvent =
  | 'route_mount'
  | 'spatial_refocus'
  | 'explicit_enter'
  | 'arrow_down_exit'
  | 'open_result'
  | 'unmount';

export function resolveLocalCatalogSearchNativeInputLifecycle(
  event: LocalCatalogSearchNativeInputLifecycleEvent,
) {
  return {
    shouldFocusNativeInput: event === 'explicit_enter',
    shouldBlurNativeInput:
      event === 'arrow_down_exit' ||
      event === 'open_result' ||
      event === 'unmount',
  };
}

export type LocalCatalogBackListenerAuthority = {
  useWindowKeydown: boolean;
  useCapacitorBackButton: boolean;
};

export function resolveLocalCatalogBackListenerAuthority(
  isNativePlatform: boolean,
): LocalCatalogBackListenerAuthority {
  return {
    useWindowKeydown: !isNativePlatform,
    useCapacitorBackButton: isNativePlatform,
  };
}

export type LocalCatalogSearchViewStateInput = {
  query: string;
  isSearching: boolean;
  hasLocalError: boolean;
  status:
    | 'empty_query'
    | 'unavailable'
    | 'indexing'
    | 'index_failed'
    | 'ready';
  itemCount: number;
  indexingInBackground?: boolean;
};

export type LocalCatalogSearchViewState = {
  showSearching: boolean;
  showIndexing: boolean;
  showIndexFailed: boolean;
  showUnavailable: boolean;
  showError: boolean;
  showNoResults: boolean;
  showResults: boolean;
};

export function resolveLocalCatalogSearchViewState(
  input: LocalCatalogSearchViewStateInput,
): LocalCatalogSearchViewState {
  const hasQuery = input.query.trim().length > 0;
  const showSearching = hasQuery && input.isSearching;
  const showError = hasQuery && input.hasLocalError;
  const showIndexing =
    hasQuery &&
    !showSearching &&
    !showError &&
    (input.status === 'indexing' || input.indexingInBackground === true);
  const showIndexFailed =
    hasQuery &&
    !showSearching &&
    !showError &&
    input.status === 'index_failed';
  const showUnavailable =
    hasQuery &&
    !showSearching &&
    !showError &&
    input.status === 'unavailable';
  const showNoResults =
    hasQuery &&
    !showSearching &&
    !showError &&
    input.status === 'ready' &&
    input.itemCount === 0;
  const showResults = hasQuery && !showError && input.itemCount > 0;

  return {
    showSearching,
    showIndexing,
    showIndexFailed,
    showUnavailable,
    showError,
    showNoResults,
    showResults,
  };
}

export function getLocalCatalogSearchResultFocusKey(index: number) {
  return `local-catalog-search-result-${Math.max(0, index)}`;
}

export function resolveLocalCatalogSearchInputArrowTarget(
  key: string,
  hasResults: boolean,
  retryTargets: {
    showIndexRetry?: boolean;
    showQueryRetry?: boolean;
  } = {},
) {
  if (key !== 'ArrowDown') {
    return null;
  }

  if (hasResults) {
    return getLocalCatalogSearchResultFocusKey(0);
  }

  if (retryTargets.showIndexRetry) {
    return LOCAL_CATALOG_SEARCH_INDEX_RETRY_FOCUS_KEY;
  }

  if (retryTargets.showQueryRetry) {
    return LOCAL_CATALOG_SEARCH_QUERY_RETRY_FOCUS_KEY;
  }

  return null;
}

export type LocalCatalogSearchReturnCache = {
  scopeKey: string;
  query: string;
  page: LocalCatalogSearchPage;
};

export function createLocalCatalogSearchReturnCache(input: {
  scopeKey: string | null | undefined;
  query: string;
  page: LocalCatalogSearchPage;
}): LocalCatalogSearchReturnCache | null {
  const scopeKey = input.scopeKey?.trim() ?? '';
  const query = input.query.trim();

  if (!scopeKey || !query || input.page.items.length === 0) {
    return null;
  }

  return {
    scopeKey,
    query,
    page: input.page,
  };
}

export function isLocalCatalogSearchReturnCacheMatch(input: {
  cache: LocalCatalogSearchReturnCache | null;
  scopeKey: string | null | undefined;
  query: string;
}) {
  const scopeKey = input.scopeKey?.trim() ?? '';
  const query = input.query.trim();

  return Boolean(
    input.cache &&
      scopeKey &&
      query &&
      input.cache.scopeKey === scopeKey &&
      input.cache.query === query &&
      input.cache.page.items.length > 0,
  );
}

export function shouldInvalidateLocalCatalogSearchReturnCache(input: {
  cache: LocalCatalogSearchReturnCache | null;
  scopeKey: string | null | undefined;
  query: string;
  hasError: boolean;
}) {
  return (
    input.hasError &&
    isLocalCatalogSearchReturnCacheMatch({
      cache: input.cache,
      scopeKey: input.scopeKey,
      query: input.query,
    })
  );
}

export function replaceLocalCatalogSearchReturnCache(
  _current: LocalCatalogSearchReturnCache | null,
  next: LocalCatalogSearchReturnCache | null,
) {
  return next;
}

export function shouldBlurLocalCatalogSearchInputOnArrowNavigation(input: {
  key: string;
  target: string | null;
}) {
  return input.key === 'ArrowDown' && Boolean(input.target);
}

export type LocalCatalogSearchInputArrowPressResolution = {
  handled: boolean;
  target: string | null;
  shouldBlurNativeInput: boolean;
  allowDefaultSpatialNavigation: boolean;
};

export function resolveLocalCatalogSearchInputArrowPress(
  direction: string,
  hasResults: boolean,
  retryTargets: {
    showIndexRetry?: boolean;
    showQueryRetry?: boolean;
  } = {},
): LocalCatalogSearchInputArrowPressResolution {
  const target = resolveLocalCatalogSearchInputArrowTarget(
    direction === 'down' ? 'ArrowDown' : direction,
    hasResults,
    retryTargets,
  );
  const handled = Boolean(target);

  return {
    handled,
    target,
    shouldBlurNativeInput: shouldBlurLocalCatalogSearchInputOnArrowNavigation({
      key: direction === 'down' ? 'ArrowDown' : direction,
      target,
    }),
    allowDefaultSpatialNavigation: !handled,
  };
}

export function buildLocalCatalogSearchReturnTo(
  pathname: string,
  search: string,
) {
  return `${pathname}${search}`;
}

export function buildLocalCatalogMovieDetailRoute(input: {
  id: string;
  title: string;
  groupTitle?: string | null;
}) {
  const params = new URLSearchParams({
    movieId: input.id,
    title: input.title,
  });
  if (input.groupTitle?.trim()) {
    params.set('groupTitle', input.groupTitle);
  }
  return `/category/movie-detail?${params.toString()}`;
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
