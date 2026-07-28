import type { LocalCatalogArtworkCandidate } from '@/features/localCatalog/services/localCatalogArtwork.service';

import type { HomeVodItem } from './homeVod.service';

type HeroArtworkItem = Pick<
  HomeVodItem,
  'backdropUrl' | 'posterUrl' | 'artworkCandidates'
>;

function isSafeRemoteArtworkUrl(value?: string | null): value is string {
  const candidate = value?.trim();

  if (!candidate) {
    return false;
  }

  try {
    const parsedUrl = new URL(candidate);
    return (
      (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') &&
      !parsedUrl.username &&
      !parsedUrl.password
    );
  } catch {
    return false;
  }
}

export function getHorizontalHeroArtworkCandidates(
  item?: HeroArtworkItem | null,
) {
  if (!item) {
    return [];
  }

  const candidates = [
    item.backdropUrl,
    ...(item.artworkCandidates ?? [])
      .filter(
        (candidate) =>
          candidate.source === 'tmdb_backdrop' ||
          candidate.source === 'tvmaze_background',
      )
      .map((candidate) => candidate.url),
  ].filter(isSafeRemoteArtworkUrl);

  return Array.from(new Set(candidates));
}

export function getHorizontalHeroArtworkCandidateRecords(
  item?: HeroArtworkItem | null,
): LocalCatalogArtworkCandidate[] {
  const allowedUrls = new Set(getHorizontalHeroArtworkCandidates(item));

  return (item?.artworkCandidates ?? []).filter(
    (candidate) =>
      (candidate.source === 'tmdb_backdrop' ||
        candidate.source === 'tvmaze_background') &&
      allowedUrls.has(candidate.url),
  );
}

export function resolveHomeHeroArtworkUrl(
  item: HeroArtworkItem | null | undefined,
  mode: 'mobile' | 'horizontal',
) {
  if (mode === 'mobile') {
    return [item?.posterUrl, item?.backdropUrl].find(isSafeRemoteArtworkUrl);
  }

  return getHorizontalHeroArtworkCandidates(item)[0];
}

export function resolveMovieCategoryHeroArtworkUrl(
  item?: HeroArtworkItem | null,
) {
  return getHorizontalHeroArtworkCandidates(item)[0];
}

export function resolveMovieDetailHeroArtworkUrl(
  item?: HeroArtworkItem | null,
) {
  return getHorizontalHeroArtworkCandidates(item)[0];
}
