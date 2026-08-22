import {
  getMovieSimilarItemFocusKey,
  isMovieDetailCatalogRoute,
  isSeriesDetailCatalogRoute,
  resolveSeriesDetailHeroItem,
  shouldRunCategoryAutoFocus,
} from './catalogDetailFocusPolicy';

export type FocusLatencyCloseoutSmokeTestResult = {
  ok: boolean;
  MOVIE_DETAIL_INITIAL_FOCUS_REGRESSION: boolean;
  MOVIE_DETAIL_CATEGORY_AUTOFOCUS_REGRESSION: boolean;
  MOVIE_DETAIL_DOWN_TO_SIMILARS_REGRESSION: boolean;
  SERIES_DETAIL_NO_BLOCKING_BACKGROUND_INDEX_REGRESSION: boolean;
  UTF8_UI_STRING_INTEGRITY: boolean;
  MOVIES_SINGLE_FOCUS_REGRESSION: 'NOT_APPLICABLE_UNPROVEN';
  errorCode?: string;
};

export function runFocusLatencyCloseoutSmokeTest(): FocusLatencyCloseoutSmokeTestResult {
  const movieDetail = isMovieDetailCatalogRoute({
    groupSlug: 'movie-detail',
    isSeriesGroupListPage: false,
    hasMovieIdentity: true,
  });
  const movieDoesNotBecomeSeriesDetail = !isSeriesDetailCatalogRoute({
    groupSlug: 'movie-detail',
    isMovieDetailPage: movieDetail,
    isSeriesGroupListPage: false,
    hasSeriesGroupTitle: true,
    hasSeriesRouteIdentity: true,
  });
  const firstSimilarTarget = getMovieSimilarItemFocusKey('movie-focus', 0);
  const movieCategoryAutofocusSkipped = !shouldRunCategoryAutoFocus({
    hasCategory: true,
    visibleItemCount: 1,
    isMovieDetailPage: true,
  });
  const utf8UiStrings = [
    'Mais informações',
    'Títulos semelhantes',
    '←',
    '▶',
    'Séries',
    'licença',
    'não',
    'catálogo',
    'disponível',
    'episódios',
    'sugestões',
  ];
  const mojibakePattern = /[\u00c3\u00c2]|\u00e2(?:\u2020|\u2013|\u2022)/u;
  const utf8UiStringIntegrity = utf8UiStrings.every(
    (value) => !mojibakePattern.test(value),
  );
  const selectedSeriesItem = {
    id: 'series-collection',
    title: 'A Bruxa do Bem',
    posterUrl: 'https://images.invalid/series.jpg',
    kind: 'series' as const,
    isSeriesCollection: true,
  };
  const immediateHero = resolveSeriesDetailHeroItem({
    representative: null,
    selectedSeriesItem,
    selectedSeriesItemMatches: true,
  });

  const result: FocusLatencyCloseoutSmokeTestResult = {
    ok:
      movieDetail &&
      movieDoesNotBecomeSeriesDetail &&
      firstSimilarTarget === 'movie-similar-movie-focus-0' &&
      immediateHero?.id === selectedSeriesItem.id &&
      movieCategoryAutofocusSkipped &&
      utf8UiStringIntegrity,
    MOVIE_DETAIL_INITIAL_FOCUS_REGRESSION:
      movieDetail && movieDoesNotBecomeSeriesDetail,
    MOVIE_DETAIL_CATEGORY_AUTOFOCUS_REGRESSION: movieCategoryAutofocusSkipped,
    MOVIE_DETAIL_DOWN_TO_SIMILARS_REGRESSION:
      firstSimilarTarget === 'movie-similar-movie-focus-0',
    SERIES_DETAIL_NO_BLOCKING_BACKGROUND_INDEX_REGRESSION:
      immediateHero?.id === selectedSeriesItem.id,
    UTF8_UI_STRING_INTEGRITY: utf8UiStringIntegrity,
    MOVIES_SINGLE_FOCUS_REGRESSION: 'NOT_APPLICABLE_UNPROVEN',
  };

  return result;
}
