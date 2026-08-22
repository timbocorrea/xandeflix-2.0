import type { HomeVodItem } from './homeVod.service';

export function isMovieDetailCatalogRoute({
  groupSlug,
  isSeriesGroupListPage,
  hasMovieIdentity,
}: {
  groupSlug: string | undefined;
  isSeriesGroupListPage: boolean;
  hasMovieIdentity: boolean;
}) {
  return (
    !isSeriesGroupListPage &&
    groupSlug === 'movie-detail' &&
    hasMovieIdentity
  );
}

export function isSeriesDetailCatalogRoute({
  groupSlug,
  isMovieDetailPage,
  isSeriesGroupListPage,
  hasSeriesGroupTitle,
  hasSeriesRouteIdentity,
}: {
  groupSlug: string | undefined;
  isMovieDetailPage: boolean;
  isSeriesGroupListPage: boolean;
  hasSeriesGroupTitle: boolean;
  hasSeriesRouteIdentity: boolean;
}) {
  return (
    !isMovieDetailPage &&
    !isSeriesGroupListPage &&
    hasSeriesGroupTitle &&
    (groupSlug === 'series-detail' || hasSeriesRouteIdentity)
  );
}

export function getMovieSimilarItemFocusKey(
  movieFocusSlug: string,
  index: number,
) {
  return `movie-similar-${movieFocusSlug}-${index}`;
}

export function shouldRunCategoryAutoFocus({
  hasCategory,
  visibleItemCount,
  isMovieDetailPage,
}: {
  hasCategory: boolean;
  visibleItemCount: number;
  isMovieDetailPage: boolean;
}) {
  return hasCategory && visibleItemCount > 0 && !isMovieDetailPage;
}

export function resolveSeriesDetailHeroItem({
  representative,
  selectedSeriesItem,
  selectedSeriesItemMatches,
}: {
  representative: HomeVodItem | null;
  selectedSeriesItem: HomeVodItem | null;
  selectedSeriesItemMatches: boolean;
}) {
  if (!selectedSeriesItem || !selectedSeriesItemMatches) {
    return representative;
  }

  if (!representative) {
    return selectedSeriesItem;
  }

  return {
    ...representative,
    overview: selectedSeriesItem.overview ?? representative.overview,
    posterUrl: selectedSeriesItem.posterUrl ?? representative.posterUrl,
    backdropUrl: selectedSeriesItem.backdropUrl ?? representative.backdropUrl,
    artworkCandidates:
      selectedSeriesItem.artworkCandidates ?? representative.artworkCandidates,
    tmdbId: selectedSeriesItem.tmdbId ?? representative.tmdbId,
    tmdbTitle: selectedSeriesItem.tmdbTitle ?? representative.tmdbTitle,
    tmdbGenres: selectedSeriesItem.tmdbGenres ?? representative.tmdbGenres,
    tmdbRating: selectedSeriesItem.tmdbRating ?? representative.tmdbRating,
    tmdbReleaseYear:
      selectedSeriesItem.tmdbReleaseYear ?? representative.tmdbReleaseYear,
  };
}
