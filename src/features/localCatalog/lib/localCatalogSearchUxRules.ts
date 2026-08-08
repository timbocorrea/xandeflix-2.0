import { normalizeLocalCatalogSearchText } from './localCatalogSearchNormalization';
import type {
  LocalCatalogSearchPage,
  LocalCatalogSearchResultItem,
} from '../readModels/localCatalogSearchReadModel.service';

export const LOCAL_CATALOG_SEARCHING_MESSAGE =
  'Buscando, aguarde...';

export const LOCAL_CATALOG_MISSING_CONTENT_MESSAGE =
  'Lamentamos, mas ainda não temos esse conteúdo.';

export const LOCAL_CATALOG_RELATED_RESULTS_HEADING =
  'Conteúdos relacionados';

const SERIES_DECORATION_MARKERS = new Set([
  'serie',
  'series',
  'season',
  'temporada',
]);

const SERIES_DECORATION_TOKENS = new Set([
  ...SERIES_DECORATION_MARKERS,
  'apple',
  'amazon',
  'disney',
  'globoplay',
  'hbo',
  'max',
  'netflix',
  'paramount',
  'plus',
  'prime',
  'star',
  'starz',
  'tv',
  'video',
]);

export type LocalCatalogSearchUxInput = {
  query: string;
  isSearching: boolean;
  hasLocalError: boolean;
  page: LocalCatalogSearchPage;
};

function isConservativeDecoratedSeriesExactMatch(
  item: LocalCatalogSearchResultItem,
  normalizedQuery: string,
) {
  if (
    item.contentKind !== 'series' ||
    normalizedQuery.length < 2
  ) {
    return false;
  }

  const normalizedSeriesKey = normalizeLocalCatalogSearchText(
    item.seriesKey,
  );

  if (normalizedSeriesKey === normalizedQuery) {
    return true;
  }

  const expectedPrefix = `${normalizedQuery} `;

  if (!item.normalizedTitle.startsWith(expectedPrefix)) {
    return false;
  }

  const suffixTokens = item.normalizedTitle
    .slice(expectedPrefix.length)
    .split(' ')
    .filter(Boolean);

  return (
    suffixTokens.length > 0 &&
    suffixTokens.some((token) =>
      SERIES_DECORATION_MARKERS.has(token),
    ) &&
    suffixTokens.every((token) =>
      SERIES_DECORATION_TOKENS.has(token),
    )
  );
}

export function resolveLocalCatalogSearchArtworkUx(
  artworkUrl?: string | null,
) {
  const normalizedArtworkUrl = artworkUrl?.trim() || null;

  return {
    posterUrl: normalizedArtworkUrl ?? undefined,
    useTextualFallback: normalizedArtworkUrl === null,
  };
}

export function resolveLocalCatalogSearchUxRules({
  query,
  isSearching,
  hasLocalError,
  page,
}: LocalCatalogSearchUxInput) {
  const indexingInBackground =
    page.status === 'indexing' ||
    Boolean(page.indexingInBackground);

  const searchInProgress = isSearching;

  const hasExactTitleMatch = page.items.some(
    (item) =>
      item.normalizedTitle === page.normalizedQuery ||
      isConservativeDecoratedSeriesExactMatch(
        item,
        page.normalizedQuery,
      ),
  );

  const searchSettled =
    !isSearching &&
    (
      page.status === 'ready' ||
      page.status === 'indexing'
    );

  const showFriendlySearching =
    Boolean(query.trim()) &&
    page.items.length === 0 &&
    searchInProgress &&
    !hasLocalError &&
    page.status !== 'unavailable' &&
    page.status !== 'index_failed';

  const showMissingContentMessage =
    Boolean(query.trim()) &&
    searchSettled &&
    !hasLocalError &&
    !hasExactTitleMatch;

  const showRelatedResultsHeading =
    showMissingContentMessage &&
    page.items.length > 0;

  return {
    searchInProgress,
    indexingInBackground,
    hasExactTitleMatch,
    searchSettled,
    showFriendlySearching,
    showMissingContentMessage,
    showRelatedResultsHeading,
    friendlySearchingMessage: showFriendlySearching
      ? LOCAL_CATALOG_SEARCHING_MESSAGE
      : null,
    missingContentMessage: showMissingContentMessage
      ? LOCAL_CATALOG_MISSING_CONTENT_MESSAGE
      : null,
    relatedResultsHeading: showRelatedResultsHeading
      ? LOCAL_CATALOG_RELATED_RESULTS_HEADING
      : null,
  };
}
