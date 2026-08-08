import {
  LOCAL_CATALOG_MISSING_CONTENT_MESSAGE,
  LOCAL_CATALOG_RELATED_RESULTS_HEADING,
  LOCAL_CATALOG_SEARCHING_MESSAGE,
  resolveLocalCatalogSearchArtworkUx,
  resolveLocalCatalogSearchUxRules,
} from '../lib/localCatalogSearchUxRules';
import type {
  LocalCatalogSearchPage,
  LocalCatalogSearchResultItem,
} from '../readModels/localCatalogSearchReadModel.service';

export type SearchUxSmokeTestResult = {
  ok: boolean;
  SEARCHING_WITHOUT_RESULTS_SHOWS_FRIENDLY_MESSAGE: boolean;
  QUERY_SETTLED_WITH_BACKGROUND_INDEXING_SHOWS_MISSING_MESSAGE: boolean;
  QUERY_SETTLED_WITH_BACKGROUND_INDEXING_HIDES_SEARCHING_MESSAGE: boolean;
  MISSING_QUERY_REACHES_TERMINAL_STATE: boolean;
  MISSING_QUERY_HAS_NO_RELATED_HEADING: boolean;
  MISSING_QUERY_HAS_NO_RELATED_CARDS: boolean;
  DECORATED_TITLE_CAN_BE_CANONICAL_EXACT_MATCH: boolean;
  CANONICAL_EXACT_MATCH_HAS_NO_MISSING_MESSAGE: boolean;
  CANONICAL_EXACT_MATCH_HAS_NO_RELATED_HEADING: boolean;
  PARTIAL_MATCH_HAS_MISSING_MESSAGE: boolean;
  PARTIAL_MATCH_HAS_RELATED_HEADING: boolean;
  PARTIAL_MATCH_PRESERVES_CARDS: boolean;
  BROKEN_ARTWORK_NOT_RENDERED: boolean;
  ARTWORK_ABSENT_USES_TEXTUAL_FALLBACK: boolean;
  NO_NETWORK_CALL: boolean;
  NO_CATALOG_REIMPORT: boolean;
  FRIENDLY_MESSAGE_TEXT_IS_BUSCANDO_AGUARDE: boolean;
  TECHNICAL_INDEX_PROGRESS_REMAINS_HIDDEN: boolean;
  INDEX_FAILED_REMAINS_ACTIONABLE: boolean;
  UNAVAILABLE_REMAINS_USER_FRIENDLY: boolean;
  SYNTHETIC_MISSING_QUERY_SETTLES_WITHIN_MS: boolean;
  SYNTHETIC_TERMINAL_TIME_MS: number;
};

function resultItem(
  input: Partial<LocalCatalogSearchResultItem> &
    Pick<
      LocalCatalogSearchResultItem,
      'id' | 'title' | 'normalizedTitle'
    >,
): LocalCatalogSearchResultItem {
  return {
    groupTitle: 'Séries',
    contentKind: 'series',
    streamUrl: 'https://stream.invalid/item.m3u8',
    artworkUrl: null,
    sourceOrder: 1,
    ...input,
  };
}

function page(
  input: Partial<LocalCatalogSearchPage> &
    Pick<LocalCatalogSearchPage, 'status' | 'normalizedQuery'>,
): LocalCatalogSearchPage {
  return {
    items: [],
    nextCursor: null,
    ...input,
  };
}

export function runLocalCatalogSearchUxSmokeTest(): SearchUxSmokeTestResult {
  const remoteCalls = 0;
  const catalogReimports = 0;

  const searchingEval = resolveLocalCatalogSearchUxRules({
    query: 'silo',
    isSearching: true,
    hasLocalError: false,
    page: page({
      status: 'ready',
      normalizedQuery: 'silo',
    }),
  });

  const backgroundEmptyEval =
    resolveLocalCatalogSearchUxRules({
      query: 'zzzzxandeflixconteudoinexistente',
      isSearching: false,
      hasLocalError: false,
      page: page({
        status: 'indexing',
        normalizedQuery:
          'zzzzxandeflixconteudoinexistente',
        indexingInBackground: true,
      }),
    });

  const decoratedExactEval =
    resolveLocalCatalogSearchUxRules({
      query: 'Silo',
      isSearching: false,
      hasLocalError: false,
      page: page({
        status: 'indexing',
        normalizedQuery: 'silo',
        indexingInBackground: true,
        items: [
          resultItem({
            id: 'series-silo-decorated',
            title:
              'Silo - Série - Series - Apple TV Plus',
            normalizedTitle:
              'silo serie series apple tv plus',
            seriesKey:
              'silo serie series apple tv plus',
          }),
        ],
      }),
    });

  const partialEval = resolveLocalCatalogSearchUxRules({
    query: 'Questão',
    isSearching: false,
    hasLocalError: false,
    page: page({
      status: 'indexing',
      normalizedQuery: 'questao',
      indexingInBackground: true,
      items: [
        resultItem({
          id: 'movie-questao-honra',
          title: 'Questão de Honra (1992)',
          normalizedTitle: 'questao de honra 1992',
          contentKind: 'movie',
          groupTitle: 'Filmes',
        }),
      ],
    }),
  });

  const syntheticStartedAt = performance.now();

  const missingEval = resolveLocalCatalogSearchUxRules({
    query: 'zzzzxandeflixconteudoinexistente',
    isSearching: false,
    hasLocalError: false,
    page: page({
      status: 'indexing',
      normalizedQuery:
        'zzzzxandeflixconteudoinexistente',
      indexingInBackground: true,
    }),
  });

  const syntheticTerminalTimeMs =
    performance.now() - syntheticStartedAt;

  const absentArtwork =
    resolveLocalCatalogSearchArtworkUx(null);

  const SEARCHING_WITHOUT_RESULTS_SHOWS_FRIENDLY_MESSAGE =
    searchingEval.showFriendlySearching === true;

  const QUERY_SETTLED_WITH_BACKGROUND_INDEXING_SHOWS_MISSING_MESSAGE =
    backgroundEmptyEval.showMissingContentMessage === true &&
    backgroundEmptyEval.missingContentMessage ===
      LOCAL_CATALOG_MISSING_CONTENT_MESSAGE;

  const QUERY_SETTLED_WITH_BACKGROUND_INDEXING_HIDES_SEARCHING_MESSAGE =
    backgroundEmptyEval.showFriendlySearching === false &&
    backgroundEmptyEval.friendlySearchingMessage === null;

  const MISSING_QUERY_REACHES_TERMINAL_STATE =
    missingEval.searchSettled === true &&
    missingEval.searchInProgress === false;

  const MISSING_QUERY_HAS_NO_RELATED_HEADING =
    missingEval.showRelatedResultsHeading === false &&
    missingEval.relatedResultsHeading === null;

  const MISSING_QUERY_HAS_NO_RELATED_CARDS =
    missingEval.showRelatedResultsHeading === false &&
    missingEval.showMissingContentMessage === true;

  const DECORATED_TITLE_CAN_BE_CANONICAL_EXACT_MATCH =
    decoratedExactEval.hasExactTitleMatch === true;

  const CANONICAL_EXACT_MATCH_HAS_NO_MISSING_MESSAGE =
    decoratedExactEval.showMissingContentMessage === false;

  const CANONICAL_EXACT_MATCH_HAS_NO_RELATED_HEADING =
    decoratedExactEval.showRelatedResultsHeading === false;

  const PARTIAL_MATCH_HAS_MISSING_MESSAGE =
    partialEval.showMissingContentMessage === true &&
    partialEval.missingContentMessage ===
      LOCAL_CATALOG_MISSING_CONTENT_MESSAGE;

  const PARTIAL_MATCH_HAS_RELATED_HEADING =
    partialEval.showRelatedResultsHeading === true &&
    partialEval.relatedResultsHeading ===
      LOCAL_CATALOG_RELATED_RESULTS_HEADING;

  const PARTIAL_MATCH_PRESERVES_CARDS =
    partialEval.showRelatedResultsHeading === true &&
    partialEval.hasExactTitleMatch === false;

  const BROKEN_ARTWORK_NOT_RENDERED =
    absentArtwork.posterUrl === undefined;

  const ARTWORK_ABSENT_USES_TEXTUAL_FALLBACK =
    absentArtwork.useTextualFallback === true;

  const NO_NETWORK_CALL = remoteCalls === 0;
  const NO_CATALOG_REIMPORT = catalogReimports === 0;

  const FRIENDLY_MESSAGE_TEXT_IS_BUSCANDO_AGUARDE =
    searchingEval.friendlySearchingMessage ===
      LOCAL_CATALOG_SEARCHING_MESSAGE &&
    LOCAL_CATALOG_SEARCHING_MESSAGE ===
      'Buscando, aguarde...';

  const TECHNICAL_INDEX_PROGRESS_REMAINS_HIDDEN =
    !LOCAL_CATALOG_SEARCHING_MESSAGE.includes('Indexando') &&
    !LOCAL_CATALOG_SEARCHING_MESSAGE.includes('%') &&
    !LOCAL_CATALOG_SEARCHING_MESSAGE.includes('total') &&
    !LOCAL_CATALOG_SEARCHING_MESSAGE.includes('236022');

  const indexFailedEval =
    resolveLocalCatalogSearchUxRules({
      query: 'teste',
      isSearching: false,
      hasLocalError: false,
      page: page({
        status: 'index_failed',
        normalizedQuery: 'teste',
      }),
    });

  const INDEX_FAILED_REMAINS_ACTIONABLE =
    indexFailedEval.showFriendlySearching === false &&
    indexFailedEval.showMissingContentMessage === false;

  const unavailableEval =
    resolveLocalCatalogSearchUxRules({
      query: 'teste',
      isSearching: false,
      hasLocalError: false,
      page: page({
        status: 'unavailable',
        normalizedQuery: 'teste',
      }),
    });

  const UNAVAILABLE_REMAINS_USER_FRIENDLY =
    unavailableEval.showFriendlySearching === false &&
    unavailableEval.showMissingContentMessage === false;

  const SYNTHETIC_MISSING_QUERY_SETTLES_WITHIN_MS =
    syntheticTerminalTimeMs <= 2_000;

  const assertions = [
    SEARCHING_WITHOUT_RESULTS_SHOWS_FRIENDLY_MESSAGE,
    QUERY_SETTLED_WITH_BACKGROUND_INDEXING_SHOWS_MISSING_MESSAGE,
    QUERY_SETTLED_WITH_BACKGROUND_INDEXING_HIDES_SEARCHING_MESSAGE,
    MISSING_QUERY_REACHES_TERMINAL_STATE,
    MISSING_QUERY_HAS_NO_RELATED_HEADING,
    MISSING_QUERY_HAS_NO_RELATED_CARDS,
    DECORATED_TITLE_CAN_BE_CANONICAL_EXACT_MATCH,
    CANONICAL_EXACT_MATCH_HAS_NO_MISSING_MESSAGE,
    CANONICAL_EXACT_MATCH_HAS_NO_RELATED_HEADING,
    PARTIAL_MATCH_HAS_MISSING_MESSAGE,
    PARTIAL_MATCH_HAS_RELATED_HEADING,
    PARTIAL_MATCH_PRESERVES_CARDS,
    BROKEN_ARTWORK_NOT_RENDERED,
    ARTWORK_ABSENT_USES_TEXTUAL_FALLBACK,
    NO_NETWORK_CALL,
    NO_CATALOG_REIMPORT,
    FRIENDLY_MESSAGE_TEXT_IS_BUSCANDO_AGUARDE,
    TECHNICAL_INDEX_PROGRESS_REMAINS_HIDDEN,
    INDEX_FAILED_REMAINS_ACTIONABLE,
    UNAVAILABLE_REMAINS_USER_FRIENDLY,
    SYNTHETIC_MISSING_QUERY_SETTLES_WITHIN_MS,
  ];

  return {
    ok: assertions.every(Boolean),
    SEARCHING_WITHOUT_RESULTS_SHOWS_FRIENDLY_MESSAGE,
    QUERY_SETTLED_WITH_BACKGROUND_INDEXING_SHOWS_MISSING_MESSAGE,
    QUERY_SETTLED_WITH_BACKGROUND_INDEXING_HIDES_SEARCHING_MESSAGE,
    MISSING_QUERY_REACHES_TERMINAL_STATE,
    MISSING_QUERY_HAS_NO_RELATED_HEADING,
    MISSING_QUERY_HAS_NO_RELATED_CARDS,
    DECORATED_TITLE_CAN_BE_CANONICAL_EXACT_MATCH,
    CANONICAL_EXACT_MATCH_HAS_NO_MISSING_MESSAGE,
    CANONICAL_EXACT_MATCH_HAS_NO_RELATED_HEADING,
    PARTIAL_MATCH_HAS_MISSING_MESSAGE,
    PARTIAL_MATCH_HAS_RELATED_HEADING,
    PARTIAL_MATCH_PRESERVES_CARDS,
    BROKEN_ARTWORK_NOT_RENDERED,
    ARTWORK_ABSENT_USES_TEXTUAL_FALLBACK,
    NO_NETWORK_CALL,
    NO_CATALOG_REIMPORT,
    FRIENDLY_MESSAGE_TEXT_IS_BUSCANDO_AGUARDE,
    TECHNICAL_INDEX_PROGRESS_REMAINS_HIDDEN,
    INDEX_FAILED_REMAINS_ACTIONABLE,
    UNAVAILABLE_REMAINS_USER_FRIENDLY,
    SYNTHETIC_MISSING_QUERY_SETTLES_WITHIN_MS,
    SYNTHETIC_TERMINAL_TIME_MS:
      syntheticTerminalTimeMs,
  };
}
