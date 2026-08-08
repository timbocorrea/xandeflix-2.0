import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/providers/AuthProvider';
import { AppShell } from '../../../components/layout/AppShell';
import { MediaCard } from '../../../components/media/MediaCard';
import { FocusableButton } from '../../../components/tv/FocusableButton';
import { FOCUS_KEYS } from '@/lib/spatial/focusKeys';
import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';
import { usePlaylistRuntime } from '@/features/playlists/providers/PlaylistRuntimeProvider';

import {
  dedupeCatalogCategoryDefinitionGroups,
  getCatalogCategoryDefinition,
  getExactCategoryRouteByGroupTitle,
  type CatalogCategoryDefinition,
} from '../services/catalogCategoryGroups.service';

import {
  getCachedHomeVodCategoryItems,
  getCachedHomeVodSections,
  loadHomeVodCategoryItems,
  loadHomeVodSections,
  type HomeVodItem,
} from '../services/homeVod.service';
import {
  LOCAL_MOVIE_CATEGORY_PAGE_SIZE,
  loadLocalMovieCategoryPage,
  loadLocalMovieCategoryReadModel,
  mergeLocalMovieCategoryPageItems,
} from '../../localCatalog/readModels/localCatalogCategoryReadModel.service';
import {
  loadLocalCatalogSeriesDetailReadModel,
  type SeriesDetailEpisode,
} from '../../localCatalog/readModels/localCatalogSeriesDetailReadModel.service';
import {
  getSeriesCollectionKey,
  normalizeSeriesCollectionTitle,
} from '../../localCatalog/services/localCatalogSeriesIdentity.service';
import {
  readPresentationRouteCache,
  writePresentationRouteCache,
} from '../services/presentationRouteCache.service';
import { sortEpisodesNaturally } from '../services/episodeNaturalOrder.service';

import {
  enrichSeriesCardPosters,
  enrichSeriesDetailHeroItem,
  enrichSeriesHeroHighlights,
  hydrateSeriesDetailHeroFromCache,
  hydrateSeriesHeroHighlightsFromCache,
  hydrateSeriesHeroHighlightsFromPersistentCache,
  isSeriesCardPosterEnrichmentNeeded,
  shouldRequestSeriesDetailMetadata,
} from '../services/seriesHeroTmdb.service';
import {
  getHorizontalHeroArtworkCandidates,
  resolveMovieDetailHeroArtworkUrl,
} from '../services/heroArtworkPolicy.service';
import {
  createBoundedDiscoveryGenerationKey,
  createSanitizedDiscoveryFingerprint,
  moveDiscoveryHeroOutOfFirstSlot,
  resolveLocalCatalogDiscoverySnapshot,
} from '../services/localCatalogDiscoverySnapshot.service';
import {
  removeDiscoveryRuntimeSurfaceSnapshots,
  type DiscoveryRuntimeAccessScope,
} from '../services/discoveryRuntimePresentationStore.service';
import { useAutoRotatingHero } from '@/hooks/useAutoRotatingHero';
import { markDiscoveryPerformance } from '../services/discoveryPerformance.service';
import {
  readCachedSeriesEpisodes,
  storeCachedSeriesEpisodes,
} from '../services/seriesEpisodesCache.service';
import {
  getEpisodePlaybackProgressPercent,
  getEpisodeResumePositionMs,
  hasEpisodePlaybackProgress,
  type EpisodePlaybackProgressStatus,
} from '../services/episodePlaybackProgress.service';

const GRID_COLUMNS = 5;
const INITIAL_VISIBLE_ITEMS = 60;
const VISIBLE_ITEMS_INCREMENT = 40;
const CATEGORY_ITEM_LIMIT = 800;
const BOOTSTRAP_CATEGORY_ITEM_LIMIT = INITIAL_VISIBLE_ITEMS;
const CATEGORY_ITEM_FOCUS_PREFIX = 'category-grid-item';
const SERIES_DETAIL_HERO_FOCUS_KEY = 'series-detail-hero';
const SIMILAR_ITEM_FOCUS_PREFIX = 'series-similar-item';
const SERIES_HERO_HIGHLIGHT_LIMIT = 10;
const SERIES_HERO_CANDIDATE_SCAN_LIMIT = 500;
const SERIES_CATEGORY_ROW_VISIBLE_LIMIT = 15;
const MOVIES_CATEGORY_ROW_VISIBLE_LIMIT = 15;
const CATEGORY_ROW_SEE_ALL_CLASS_NAME =
  'shrink-0 rounded-full border border-white/25 bg-white/[0.09] px-2.5 py-1 font-black uppercase tracking-[0.07em] text-zinc-100 transition duration-100 data-[focused=true]:border-white data-[focused=true]:bg-white data-[focused=true]:text-black';
const CATEGORY_ROW_SEE_ALL_STYLE = {
  fontSize: '0.72rem',
  lineHeight: 1,
} as const;

type CatalogCategoryPageProps = {
  groupSlugOverride?: string;
};

type SelectedSeriesIdentity = {
  seriesKey: string | null;
  seriesTmdbId: string | null;
  seriesTmdbTitle: string | null;
  seriesTitle: string | null;
};

type SeriesNavigationState = {
  fromSeriesCategory?: boolean;
  fromSeriesDetail?: boolean;
  returnTo?: string;
  selectedSeriesItem?: HomeVodItem;
};

type EnrichedMovieDetailState = {
  item: HomeVodItem;
  requestIdentity: string;
};

const SERIES_LANDING_ITEMS_STORAGE_PREFIX = 'xandeflix:series-landing-items:v2:';
const SERIES_LANDING_ITEMS_TTL_MS = 12 * 60 * 60 * 1000;

type StoredSeriesLandingItemsEntry = {
  createdAt: number;
  items: HomeVodItem[];
};

function createSeriesLandingItemsCacheKey({
  licenseCode,
  deviceIdentifier,
}: {
  licenseCode: string;
  deviceIdentifier: string;
}) {
  return [
    licenseCode.trim().toUpperCase(),
    deviceIdentifier.trim(),
  ].join('::');
}

function cloneSeriesLandingItems(items: HomeVodItem[]) {
  return items.map((item) => {
    const clonedItem = { ...item };
    delete clonedItem.streamUrl;
    return clonedItem;
  });
}

function readStoredSeriesLandingItems({
  licenseCode,
  deviceIdentifier,
}: {
  licenseCode: string;
  deviceIdentifier: string;
}) {
  if (typeof window === 'undefined') {
    return [];
  }

  const cacheKey = createSeriesLandingItemsCacheKey({
    licenseCode,
    deviceIdentifier,
  });
  const storageKey = `${SERIES_LANDING_ITEMS_STORAGE_PREFIX}${cacheKey}`;

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return [];
    }

    const entry = JSON.parse(rawValue) as StoredSeriesLandingItemsEntry;

    if (!entry?.createdAt || !Array.isArray(entry.items)) {
      window.localStorage.removeItem(storageKey);
      return [];
    }

    if (Date.now() - entry.createdAt >= SERIES_LANDING_ITEMS_TTL_MS) {
      window.localStorage.removeItem(storageKey);
      return [];
    }

    return cloneSeriesLandingItems(entry.items);
  } catch {
    window.localStorage.removeItem(storageKey);
    return [];
  }
}

function writeStoredSeriesLandingItems({
  licenseCode,
  deviceIdentifier,
  items,
}: {
  licenseCode: string;
  deviceIdentifier: string;
  items: HomeVodItem[];
}) {
  if (typeof window === 'undefined' || items.length === 0) {
    return;
  }

  const cacheKey = createSeriesLandingItemsCacheKey({
    licenseCode,
    deviceIdentifier,
  });
  const storageKey = `${SERIES_LANDING_ITEMS_STORAGE_PREFIX}${cacheKey}`;

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        createdAt: Date.now(),
        items: cloneSeriesLandingItems(items),
      } satisfies StoredSeriesLandingItemsEntry),
    );
  } catch {
    // Cache local é otimização. Falha não deve impedir a página Séries.
  }
}


function getCategoryItemFocusKey(categorySlug: string, index: number) {
  return `${CATEGORY_ITEM_FOCUS_PREFIX}-${categorySlug}-${index}`;
}

function getSimilarItemFocusKey(categorySlug: string, index: number) {
  return `${SIMILAR_ITEM_FOCUS_PREFIX}-${categorySlug}-${index}`;
}

function getMovieSimilarItemFocusKey(movieFocusSlug: string, index: number) {
  return `movie-similar-${movieFocusSlug}-${index}`;
}

function readInitialCategoryItems(
  category: CatalogCategoryDefinition | null,
  seriesTmdbId: string | null,
  seriesTmdbTitle: string | null,
  seriesKey: string | null,
  seriesTitle: string | null,
  sourceId: string | null,
  isSeriesDetailPage: boolean,
) {
  if (!category) {
    return [];
  }

  const storedActivation = getStoredLicenseActivation();
  const licenseCode = storedActivation?.licenseCode?.trim();

  if (!licenseCode) {
    return [];
  }

  const deviceIdentifier =
    storedActivation?.deviceIdentifier || getOrCreateDeviceIdentifier();

  if (category.slug === 'movie-group') {
    const cachedMovieGroupItems = getCachedHomeVodCategoryItems({
      licenseCode,
      deviceIdentifier,
      sourceId: sourceId ?? undefined,
      groupTitles: category.groupTitles,
      limit: BOOTSTRAP_CATEGORY_ITEM_LIMIT,
      slug: category.slug,
    });

    return (cachedMovieGroupItems ?? []).filter(
      (item) => item.kind === 'movie',
    );
  }

  const matchesSeries = (item: HomeVodItem) => {
    if (!seriesKey && !seriesTmdbId && !seriesTmdbTitle && !seriesTitle) {
      return true;
    }

    return isItemOfSelectedSeries(item, {
      seriesKey,
      seriesTmdbId,
      seriesTmdbTitle,
      seriesTitle,
    });
  };

  const shouldUseStoredSeriesLandingItems =
    category.slug === 'series' &&
    !seriesKey &&
    !seriesTmdbId &&
    !seriesTmdbTitle &&
    !seriesTitle;

  if (shouldUseStoredSeriesLandingItems) {
    const storedSeriesLandingItems = readStoredSeriesLandingItems({
      licenseCode,
      deviceIdentifier,
    }).filter((item) => (!item.kind || item.kind === 'series') && matchesSeries(item));

    if (storedSeriesLandingItems.length > 0) {
      return storedSeriesLandingItems;
    }
  }

  const specificCachedEpisodes = readCachedSeriesEpisodes({
    licenseCode,
    deviceIdentifier,
    sourceId,
    seriesKey,
    groupTitles: category.groupTitles,
    tmdbId: seriesTmdbId,
    tmdbTitle: seriesTmdbTitle,
  });

  const filteredSpecificCachedEpisodes =
    specificCachedEpisodes.filter(matchesSeries);

  if (filteredSpecificCachedEpisodes.length > 0) {
    return filteredSpecificCachedEpisodes;
  }

  if (isSeriesDetailPage) {
    return [];
  }

  const cachedItems = getCachedHomeVodCategoryItems({
    licenseCode,
    deviceIdentifier,
    groupTitles: category.groupTitles,
    limit: BOOTSTRAP_CATEGORY_ITEM_LIMIT,
    slug: category.slug,
  });

  const filteredCategoryItems = (cachedItems ?? []).filter(matchesSeries);

  if (filteredCategoryItems.length > 0) {
    return filteredCategoryItems;
  }

  const cachedSections = getCachedHomeVodSections({
    licenseCode,
    deviceIdentifier,
  });

  const sectionItems = (cachedSections ?? [])
    .flatMap((section) => section.items)
    .filter((item) => {
      if (item.kind && item.kind !== 'series') {
        return false;
      }

      return matchesSeries(item);
    });

  return sectionItems;
}

function resolveVisibleCount(totalItems: number) {
  return Math.min(totalItems, INITIAL_VISIBLE_ITEMS);
}

function getSeriesDetailSeasonNumber(item?: HomeVodItem | null) {
  return (item as SeriesDetailEpisode | null | undefined)?.seasonNumber ?? null;
}

function normalizeSeriesIdentity(value?: string | null) {
  return normalizeSeriesCollectionTitle(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isItemOfSelectedSeries(
  item: HomeVodItem,
  {
    seriesKey,
    seriesTmdbId,
    seriesTmdbTitle,
    seriesTitle,
  }: SelectedSeriesIdentity,
) {
  const normalizedSeriesKey = normalizeSeriesIdentity(seriesKey);

  if (
    normalizedSeriesKey &&
    normalizeSeriesIdentity(getSeriesCollectionKey(item)) ===
      normalizedSeriesKey
  ) {
    return true;
  }

  if (
    seriesTmdbId &&
    item.tmdbId &&
    String(item.tmdbId).trim() === seriesTmdbId.trim()
  ) {
    return true;
  }

  const normalizedTmdbTitle = normalizeSeriesIdentity(seriesTmdbTitle);

  if (
    normalizedTmdbTitle &&
    normalizeSeriesIdentity(item.tmdbTitle) === normalizedTmdbTitle
  ) {
    return true;
  }

  const normalizedSeriesTitle = normalizeSeriesIdentity(seriesTitle);

  if (!normalizedSeriesTitle) {
    return false;
  }

  return [
    item.seriesKey,
    item.tmdbTitle,
    item.episodeTitle,
    item.title,
  ].some(
    (candidateTitle) =>
      normalizeSeriesIdentity(candidateTitle) === normalizedSeriesTitle,
  );
}

function createSeriesNavigationItem(item: HomeVodItem): HomeVodItem {
  return {
    id: item.id,
    title: item.title,
    episodeTitle: item.episodeTitle,
    subtitle: item.subtitle,
    overview: item.overview,
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl,
    artworkCandidates: item.artworkCandidates,
    groupTitle: item.groupTitle,
    tmdbId: item.tmdbId,
    tmdbTitle: item.tmdbTitle,
    tmdbGenres: item.tmdbGenres,
    tmdbRating: item.tmdbRating,
    tmdbReleaseYear: item.tmdbReleaseYear,
    seriesKey: item.seriesKey,
    episodeCount: item.episodeCount,
    isSeriesCollection: item.isSeriesCollection,
    kind: 'series',
  };
}

function createMovieNavigationItem(item: HomeVodItem): HomeVodItem {
  return {
    id: item.id,
    title: item.title,
    episodeTitle: item.episodeTitle,
    subtitle: item.subtitle,
    overview: item.overview,
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl,
    artworkCandidates: item.artworkCandidates,
    groupTitle: item.groupTitle,
    tmdbId: item.tmdbId,
    tmdbTitle: item.tmdbTitle,
    tmdbGenres: item.tmdbGenres,
    tmdbRating: item.tmdbRating,
    tmdbReleaseYear: item.tmdbReleaseYear,
    streamUrl: item.streamUrl,
    kind: 'movie',
  };
}

function createMovieDetailRequestIdentity(
  item: HomeVodItem,
  sourceId?: string | null,
) {
  return [
    sourceId?.trim() || 'without-source',
    item.id?.trim() || item.tmdbId?.trim() || item.tmdbTitle?.trim() || item.title,
  ].join('::');
}

function mergeSeriesHeroMetadata(
  representative: HomeVodItem,
  selectedSeriesItem: HomeVodItem | null,
) {
  if (!selectedSeriesItem) {
    return representative;
  }

  return {
    ...representative,
    overview: selectedSeriesItem.overview ?? representative.overview,
    posterUrl: selectedSeriesItem.posterUrl ?? representative.posterUrl,
    backdropUrl: selectedSeriesItem.backdropUrl ?? representative.backdropUrl,
    artworkCandidates:
      selectedSeriesItem.artworkCandidates ??
      representative.artworkCandidates,
    tmdbId: selectedSeriesItem.tmdbId ?? representative.tmdbId,
    tmdbTitle: selectedSeriesItem.tmdbTitle ?? representative.tmdbTitle,
    tmdbGenres: selectedSeriesItem.tmdbGenres ?? representative.tmdbGenres,
    tmdbRating: selectedSeriesItem.tmdbRating ?? representative.tmdbRating,
    tmdbReleaseYear:
      selectedSeriesItem.tmdbReleaseYear ?? representative.tmdbReleaseYear,
  };
}

function hasRepresentativeMetadataValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return Boolean(value);
}

function getRepresentativeScore(item: HomeVodItem): number {
  const metadata = item as HomeVodItem & {
    overview?: string | null;
    tmdbOverview?: string | null;
    tmdbRating?: number | string | null;
    tmdbVoteAverage?: number | string | null;
    tmdbReleaseYear?: number | string | null;
    releaseYear?: number | string | null;
    tmdbGenres?: string[] | string | null;
    genres?: string[] | string | null;
  };

  let score = 0;

  if (hasRepresentativeMetadataValue(item.posterUrl)) score += 1000;
  if (hasRepresentativeMetadataValue(item.backdropUrl)) score += 600;

  if (
    hasRepresentativeMetadataValue(metadata.tmdbOverview) ||
    hasRepresentativeMetadataValue(metadata.overview)
  ) {
    score += 300;
  }

  if (hasRepresentativeMetadataValue(item.tmdbTitle)) score += 120;
  if (hasRepresentativeMetadataValue(item.tmdbId)) score += 100;

  if (
    hasRepresentativeMetadataValue(metadata.tmdbRating) ||
    hasRepresentativeMetadataValue(metadata.tmdbVoteAverage)
  ) {
    score += 40;
  }

  if (
    hasRepresentativeMetadataValue(metadata.tmdbReleaseYear) ||
    hasRepresentativeMetadataValue(metadata.releaseYear)
  ) {
    score += 40;
  }

  if (
    hasRepresentativeMetadataValue(metadata.tmdbGenres) ||
    hasRepresentativeMetadataValue(metadata.genres)
  ) {
    score += 30;
  }

  return score;
}

function createSeriesCollectionItem(item: HomeVodItem, key: string): HomeVodItem {
  const collectionTitle =
    normalizeSeriesCollectionTitle(item.episodeTitle) ||
    normalizeSeriesCollectionTitle(item.title);

  return {
    ...item,
    title: collectionTitle || item.tmdbTitle || item.title,
    kind: 'series',
    seriesKey: key,
    isSeriesCollection: true,
  };
}

function getBestSeriesEpisodeRepresentative(items: HomeVodItem[]) {
  if (items.length === 0) {
    return null;
  }

  return items.reduce((bestItem, item) =>
    getRepresentativeScore(item) > getRepresentativeScore(bestItem)
      ? item
      : bestItem,
  );
}

function dedupeSeriesCollections(items: HomeVodItem[]) {
  const byCollection = new Map<string, HomeVodItem>();
  const episodeCounts = new Map<string, number>();

  for (const item of items) {
    const key = getSeriesCollectionKey(item);

    if (!key) {
      continue;
    }

    episodeCounts.set(key, (episodeCounts.get(key) ?? 0) + (item.episodeCount ?? 1));

    const existing = byCollection.get(key);
    const nextCollectionItem = createSeriesCollectionItem(item, key);

    if (!existing) {
      byCollection.set(key, nextCollectionItem);
      continue;
    }

    if (getRepresentativeScore(nextCollectionItem) > getRepresentativeScore(existing)) {
      byCollection.set(key, nextCollectionItem);
    }
  }

  return Array.from(byCollection.entries()).map(([key, item]) => ({
    ...item,
    episodeCount: episodeCounts.get(key) ?? item.episodeCount,
  }));
}

type SeriesCategorySection = {
  id: string;
  title: string;
  items: HomeVodItem[];
};

function slugifySeriesSectionId(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSeriesCategorySections(
  items: HomeVodItem[],
  orderedGroupTitles: string[],
): SeriesCategorySection[] {
  const orderByGroup = new Map(
    orderedGroupTitles.map((groupTitle, index) => [
      groupTitle.trim().toLowerCase(),
      index,
    ]),
  );

  const groupedItems = new Map<string, HomeVodItem[]>();

  for (const item of items) {
    const groupTitle = item.groupTitle?.trim() || 'Outras séries';
    const nextItems = groupedItems.get(groupTitle) ?? [];
    nextItems.push(item);
    groupedItems.set(groupTitle, nextItems);
  }

  return Array.from(groupedItems.entries())
    .sort(([leftGroup], [rightGroup]) => {
      const leftOrder =
        orderByGroup.get(leftGroup.trim().toLowerCase()) ??
        Number.MAX_SAFE_INTEGER;
      const rightOrder =
        orderByGroup.get(rightGroup.trim().toLowerCase()) ??
        Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return leftGroup.localeCompare(rightGroup, 'pt-BR', {
        sensitivity: 'base',
      });
    })
    .map(([groupTitle, groupItems]) => ({
      id: `series-row-${slugifySeriesSectionId(groupTitle) || 'outros'}`,
      title: groupTitle,
      items: groupItems.sort((left, right) =>
        left.title.localeCompare(right.title, 'pt-BR', {
          sensitivity: 'base',
        }),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

function getSeriesHeroItem(items: HomeVodItem[]) {
  return (
    items.find(
      (item) => getHorizontalHeroArtworkCandidates(item).length > 0,
    ) ??
    items.find((item) => Boolean(item.title?.trim())) ??
    null
  );
}

function getSeriesHeroOverview(item: HomeVodItem) {
  const metadata = item as HomeVodItem & {
    tmdbOverview?: string | null;
  };

  return metadata.tmdbOverview?.trim() || item.overview?.trim() || null;
}

function buildSeriesHeroHighlights(sections: SeriesCategorySection[]) {
  const uniqueHighlights = new Map<string, HomeVodItem>();

  for (const item of sections.flatMap((section) => section.items)) {
    const key = item.seriesKey || getSeriesCollectionKey(item);
    const currentHighlight = uniqueHighlights.get(key);

    if (
      !currentHighlight ||
      getRepresentativeScore(item) > getRepresentativeScore(currentHighlight)
    ) {
      uniqueHighlights.set(key, item);
    }
  }

  return hydrateSeriesHeroHighlightsFromCache(
    Array.from(uniqueHighlights.values()),
  )
    .sort((left, right) => {
      const backdropScore =
        Number(Boolean(right.backdropUrl)) - Number(Boolean(left.backdropUrl));

      if (backdropScore !== 0) {
        return backdropScore;
      }

      const posterScore =
        Number(Boolean(right.posterUrl)) - Number(Boolean(left.posterUrl));

      if (posterScore !== 0) {
        return posterScore;
      }

      const overviewScore =
        Number(Boolean(getSeriesHeroOverview(right))) -
        Number(Boolean(getSeriesHeroOverview(left)));

      if (overviewScore !== 0) {
        return overviewScore;
      }

      const episodeCountScore =
        (right.episodeCount ?? 0) - (left.episodeCount ?? 0);

      if (episodeCountScore !== 0) {
        return episodeCountScore;
      }

      const representativeScore =
        getRepresentativeScore(right) - getRepresentativeScore(left);

      if (representativeScore !== 0) {
        return representativeScore;
      }

      return left.title.localeCompare(right.title, 'pt-BR', {
        sensitivity: 'base',
      });
    })
    .slice(0, SERIES_HERO_CANDIDATE_SCAN_LIMIT);
}

function buildSeriesHeroMetadata(item: HomeVodItem) {
  return [
    item.tmdbReleaseYear,
    item.tmdbRating ? `Nota ${formatHeroRating(item.tmdbRating)}` : null,
    item.tmdbGenres,
    item.episodeCount ? `${item.episodeCount} episódio(s)` : null,
    item.groupTitle,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' | ');
}


type MoviesCategorySection = {
  id: string;
  title: string;
  items: HomeVodItem[];
};

function slugifyMoviesSectionId(value: string) {
  return slugifySeriesSectionId(value);
}

function buildMoviesCategorySections(
  items: HomeVodItem[],
  orderedGroupTitles: string[],
): MoviesCategorySection[] {
  const orderByGroup = new Map(
    orderedGroupTitles.map((groupTitle, index) => [
      groupTitle.trim().toLowerCase(),
      index,
    ]),
  );

  const groupedItems = new Map<string, HomeVodItem[]>();

  for (const item of items) {
    const groupTitle = item.groupTitle?.trim() || 'Não categorizados';
    const nextItems = groupedItems.get(groupTitle) ?? [];
    nextItems.push(item);
    groupedItems.set(groupTitle, nextItems);
  }

  return Array.from(groupedItems.entries())
    .sort(([leftGroup], [rightGroup]) => {
      const leftOrder =
        orderByGroup.get(leftGroup.trim().toLowerCase()) ??
        Number.MAX_SAFE_INTEGER;
      const rightOrder =
        orderByGroup.get(rightGroup.trim().toLowerCase()) ??
        Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return leftGroup.localeCompare(rightGroup, 'pt-BR', {
        sensitivity: 'base',
      });
    })
    .map(([groupTitle, groupItems]) => ({
      id: `movies-row-${slugifyMoviesSectionId(groupTitle) || 'outros'}`,
      title: groupTitle,
      items: groupItems.sort((left, right) =>
        left.title.localeCompare(right.title, 'pt-BR', {
          sensitivity: 'base',
        }),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

function getMovieHeroItem(items: HomeVodItem[]) {
  return (
    items.find(
      (item) => getHorizontalHeroArtworkCandidates(item).length > 0,
    ) ??
    items.find((item) => Boolean(item.title?.trim())) ??
    null
  );
}

function getMovieHeroOverview(item: HomeVodItem) {
  const metadata = item as HomeVodItem & {
    tmdbOverview?: string | null;
  };

  return metadata.tmdbOverview?.trim() || item.overview?.trim() || null;
}

function buildMovieHeroHighlights(sections: MoviesCategorySection[]) {
  const uniqueHighlights = new Map<string, HomeVodItem>();

  for (const item of sections.flatMap((section) => section.items)) {
    const key = item.tmdbId || item.tmdbTitle || item.title;
    const currentHighlight = uniqueHighlights.get(key);

    if (
      !currentHighlight ||
      getRepresentativeScore(item) > getRepresentativeScore(currentHighlight)
    ) {
      uniqueHighlights.set(key, item);
    }
  }

  return Array.from(uniqueHighlights.values())
    .sort((left, right) => {
      const backdropScore =
        Number(Boolean(right.backdropUrl)) - Number(Boolean(left.backdropUrl));

      if (backdropScore !== 0) {
        return backdropScore;
      }

      const posterScore =
        Number(Boolean(right.posterUrl)) - Number(Boolean(left.posterUrl));

      if (posterScore !== 0) {
        return posterScore;
      }

      const overviewScore =
        Number(Boolean(getMovieHeroOverview(right))) -
        Number(Boolean(getMovieHeroOverview(left)));

      if (overviewScore !== 0) {
        return overviewScore;
      }

      const representativeScore =
        getRepresentativeScore(right) - getRepresentativeScore(left);

      if (representativeScore !== 0) {
        return representativeScore;
      }

      return left.title.localeCompare(right.title, 'pt-BR', {
        sensitivity: 'base',
      });
    })
    .slice(0, SERIES_HERO_HIGHLIGHT_LIMIT);
}

function getFirstMovieGenre(item: HomeVodItem) {
  const rawGenres = item.tmdbGenres as unknown;

  const normalizedGenres = Array.isArray(rawGenres)
    ? rawGenres.join(' | ')
    : typeof rawGenres === 'string'
      ? rawGenres
      : null;

  return (
    normalizedGenres
      ?.split(/[|,]/)
      .map((genre) => genre.trim())
      .filter(Boolean)[0] ?? null
  );
}

function buildMovieHeroMetadata(item: HomeVodItem) {
  const firstGenre = getFirstMovieGenre(item);

  return [
    item.tmdbReleaseYear ? String(item.tmdbReleaseYear) : null,
    item.tmdbRating ? formatHeroRating(item.tmdbRating) : null,
    firstGenre,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' | ');
}

function buildMovieDetailMetadataItems(item: HomeVodItem) {
  const firstGenre = getFirstMovieGenre(item);
  const normalizedGenre = firstGenre?.trim().toLowerCase() ?? null;
  const normalizedGroupTitle = item.groupTitle?.trim().toLowerCase() ?? null;
  const shouldShowGroupTitle =
    Boolean(item.groupTitle?.trim()) &&
    normalizedGroupTitle !== normalizedGenre &&
    normalizedGroupTitle !== 'filmes';

  return [
    item.tmdbReleaseYear ? String(item.tmdbReleaseYear) : null,
    item.tmdbRating ? formatHeroRating(item.tmdbRating) : null,
    firstGenre,
    shouldShowGroupTitle ? item.groupTitle?.trim() ?? null : null,
  ].filter((value): value is string => Boolean(value));
}

function MovieCategoryHero({
  item,
  isLoading,
  totalItems,
  heroTotal,
  onPlayItem,
  onInfoItem,
  onButtonArrowPress,
}: {
  item: HomeVodItem | null;
  isLoading: boolean;
  totalItems: number;
  heroTotal: number;
  onPlayItem: (item: HomeVodItem, index: number) => void;
  onInfoItem: (item: HomeVodItem, index: number) => void;
  onButtonArrowPress: (
    direction: string,
    buttonPosition: 'play' | 'info',
  ) => boolean;
}) {
  const backgroundCandidates = useMemo(
    () => getHorizontalHeroArtworkCandidates(item),
    [item],
  );
  const backgroundCandidatesKey = backgroundCandidates.join('|');
  const [backgroundIndex, setBackgroundIndex] = useState(0);

  useEffect(() => {
    setBackgroundIndex(0);
  }, [backgroundCandidatesKey, item?.id]);

  const backgroundUrl = backgroundCandidates[backgroundIndex] ?? null;
  const metadata = item ? buildMovieHeroMetadata(item) : null;
  const overview =
    (item && getMovieHeroOverview(item)) ||
    'Filmes organizados por categorias liberadas para esta licença.';

  useLayoutEffect(() => {
    markDiscoveryPerformance('movies_hero_content_paint');
    const frameId = window.requestAnimationFrame(() => {
      markDiscoveryPerformance('movies_hero_image_paint');
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return (
    <section
      data-xf-hero-fingerprint={createSanitizedDiscoveryFingerprint(item?.id)}
      data-xf-hero-pool-size={heroTotal}
      data-xf-movie-category-hero="true"
      data-xf-hero-visual-fallback="gradient"
      data-nav-id={FOCUS_KEYS.CATALOG_HERO_SECTION}
      data-focus-key={FOCUS_KEYS.CATALOG_HERO_SECTION}
      data-xf-focus-key={FOCUS_KEYS.CATALOG_HERO_SECTION}
      style={
        backgroundUrl
          ? {
              aspectRatio: '16 / 7',
              height: 'auto',
            }
          : undefined
      }
      className="relative mb-6 box-border flex min-h-[min(72vh,620px)] w-full max-w-full min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(120deg,#18181b_0%,#09090b_48%,#000_100%)] px-5 py-5 shadow-2xl ring-0 ring-inset ring-transparent md:min-h-[22rem] md:px-7 md:py-6 lg:min-h-[25.5rem] xl:min-h-[28.5rem]"
    >
      {backgroundUrl ? (
        <img
          key={`movie-horizontal-${backgroundUrl}`}
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-100"
          loading="eager"
          decoding="async"
          fetchPriority="high"
          onLoad={() => markDiscoveryPerformance('movies_hero_remote_image_paint')}
          onError={() => {
            if (backgroundIndex + 1 < backgroundCandidates.length) {
              setBackgroundIndex((currentIndex) => currentIndex + 1);
            }
          }}
        />
      ) : null}

      <div
        data-xf-hero-radial-backdrop="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_18%_76%,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.58)_18%,rgba(0,0,0,0.36)_34%,rgba(0,0,0,0.16)_50%,rgba(0,0,0,0.06)_62%,rgba(0,0,0,0)_74%)]"
      />

      <div className="relative z-10 grid w-full gap-5">
        <div
          className="flex max-w-[54rem] flex-1 flex-col justify-end self-stretch pb-[clamp(0.35rem,0.9vh,0.85rem)]"
          style={{
            transform: 'scale(0.8)',
            transformOrigin: 'left bottom',
          }}
        >
          <p
            data-xf-hero-eyebrow="true"
            className="mb-3 text-[clamp(0.625rem,0.84vw,0.8rem)] font-black uppercase tracking-[0.35em] text-xf-red"
          >
            Filmes
          </p>

          <h1
            data-xf-hero-title="true"
            className="font-display text-[clamp(1.6rem,3vw,3.24rem)] font-black leading-[0.94] text-white"
            style={{
              fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
              letterSpacing: '0.035em',
            }}
          >
            {item?.title ?? 'Filmes'}
          </h1>

          {metadata ? (
            <p
              data-xf-hero-metadata="true"
              className="mt-1.5 max-w-xl text-[clamp(0.5rem,0.66vw,0.62rem)] font-bold uppercase tracking-[0.16em] text-white/90"
            >
              {metadata}
            </p>
          ) : null}

          <p
            data-xf-hero-description="true"
            className="mt-2 max-w-xl text-[clamp(0.62rem,0.82vw,0.77rem)] leading-[1.45] text-zinc-200"
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden',
            }}
          >
            {overview}
          </p>

          {item ? (
            <>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
                <FocusableButton
                  focusKey={FOCUS_KEYS.HERO_PLAY_BUTTON}
                  focusScrollTarget="closest-section"
                  focusScrollOptions={{
                    behavior: 'auto',
                    block: 'center',
                    inline: 'nearest',
                  }}
                  className="inline-flex min-h-[calc(var(--xf-action-height)*0.58)] items-center justify-center gap-1.5 rounded-[0.22rem] border border-white/40 bg-white/10 px-[calc(var(--xf-action-inline-padding)*0.48)] text-[clamp(0.58rem,0.76vw,0.7rem)] font-black text-white backdrop-blur-md transition-[background-color,color,border-color] duration-100 data-[focused=true]:border-white data-[focused=true]:bg-white data-[focused=true]:text-black"
                  onClick={() => onPlayItem(item, 0)}
                  onEnterPress={() => onPlayItem(item, 0)}
                  onArrowPress={(direction) =>
                    onButtonArrowPress(direction, 'play')
                  }
                >
                  Assistir agora
                </FocusableButton>

                <FocusableButton
                  focusKey={FOCUS_KEYS.HERO_INFO_BUTTON}
                  focusScrollTarget="closest-section"
                  focusScrollOptions={{
                    behavior: 'auto',
                    block: 'center',
                    inline: 'nearest',
                  }}
                  className="inline-flex min-h-[calc(var(--xf-action-height)*0.58)] items-center justify-center gap-1.5 rounded-[0.22rem] border border-white/40 bg-white/10 px-[calc(var(--xf-action-inline-padding)*0.48)] text-[clamp(0.58rem,0.76vw,0.7rem)] font-black text-white backdrop-blur-md transition-[background-color,color,border-color] duration-100 data-[focused=true]:border-white data-[focused=true]:bg-white data-[focused=true]:text-black"
                  onClick={() => onInfoItem(item, 0)}
                  onEnterPress={() => onInfoItem(item, 0)}
                  onArrowPress={(direction) =>
                    onButtonArrowPress(direction, 'info')
                  }
                >
                  Mais informações
                </FocusableButton>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[0.5rem] font-bold uppercase tracking-[0.18em] text-white/80">
                  {totalItems} filmes agrupados
                </span>
              </div>
            </>
          ) : isLoading ? (
            <div className="mt-5 inline-flex w-fit rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-zinc-300">
              Carregando filmes...
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SeriesCategoryHero({
  item,
  isLoading,
  totalItems,
  heroIndex,
  heroTotal,
  onOpenItem,
  onButtonArrowPress,
}: {
  item: HomeVodItem | null;
  isLoading: boolean;
  totalItems: number;
  heroIndex: number;
  heroTotal: number;
  onOpenItem: (item: HomeVodItem) => void;
  onButtonArrowPress: (
    direction: string,
    buttonPosition: 'play' | 'info',
  ) => boolean;
}) {
  const backgroundCandidates = useMemo(
    () => getHorizontalHeroArtworkCandidates(item),
    [item],
  );
  const backgroundCandidatesKey = backgroundCandidates.join('|');
  const [backgroundIndex, setBackgroundIndex] = useState(0);

  useEffect(() => {
    setBackgroundIndex(0);
  }, [backgroundCandidatesKey, item?.id]);

  const backgroundUrl = backgroundCandidates[backgroundIndex] ?? null;
  const metadata = item ? buildSeriesHeroMetadata(item) : null;
  const overview =
    (item && getSeriesHeroOverview(item)) ||
    'Séries, novelas, doramas e temporadas liberadas para esta licença.';

  useLayoutEffect(() => {
    markDiscoveryPerformance('series_hero_content_paint');
    const frameId = window.requestAnimationFrame(() => {
      markDiscoveryPerformance('series_hero_image_paint');
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return (
    <section
      data-xf-hero-fingerprint={createSanitizedDiscoveryFingerprint(item?.id)}
      data-xf-hero-pool-size={heroTotal}
      data-xf-series-category-hero="true"
      data-xf-hero-visual-fallback="gradient"
      data-nav-id={FOCUS_KEYS.CATALOG_HERO_SECTION}
      data-focus-key={FOCUS_KEYS.CATALOG_HERO_SECTION}
      data-xf-focus-key={FOCUS_KEYS.CATALOG_HERO_SECTION}
      style={
        backgroundUrl
          ? {
              aspectRatio: '16 / 7',
              height: 'auto',
            }
          : undefined
      }
      className="relative mb-6 box-border flex min-h-[18.75rem] w-full max-w-full min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(120deg,#18181b_0%,#09090b_48%,#000_100%)] px-5 py-5 shadow-2xl ring-0 ring-inset ring-transparent md:min-h-[22rem] md:px-7 md:py-6 lg:min-h-[25.5rem] xl:min-h-[28.5rem]"
    >
      {backgroundUrl ? (
        <img
          key={`series-horizontal-${backgroundUrl}`}
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-100"
          loading="eager"
          decoding="async"
          fetchPriority="high"
          onLoad={() => markDiscoveryPerformance('series_hero_remote_image_paint')}
          onError={() => {
            if (backgroundIndex + 1 < backgroundCandidates.length) {
              setBackgroundIndex((currentIndex) => currentIndex + 1);
            }
          }}
        />
      ) : null}

      <div
        data-xf-hero-radial-backdrop="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_18%_76%,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.58)_18%,rgba(0,0,0,0.36)_34%,rgba(0,0,0,0.16)_50%,rgba(0,0,0,0.06)_62%,rgba(0,0,0,0)_74%)]"
      />

      <div className="relative z-10 grid w-full gap-5">
        <div
          className="flex max-w-[54rem] flex-1 flex-col justify-end self-stretch pb-[clamp(0.35rem,0.9vh,0.85rem)]"
          style={{
            transform: 'scale(0.8)',
            transformOrigin: 'left bottom',
          }}
        >
          <p
            data-xf-hero-eyebrow="true"
            className="mb-3 text-[clamp(0.625rem,0.84vw,0.8rem)] font-black uppercase tracking-[0.35em] text-xf-red"
          >
            Séries / Novelas
          </p>

          <h1
            key={`series-hero-title-${heroIndex}-${item?.title ?? 'Séries'}`}
            data-xf-hero-title="true"
            className="font-display text-[clamp(1.6rem,3vw,3.24rem)] font-black leading-[0.94] text-white"
            style={{
              fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
              letterSpacing: '0.035em',
            }}
          >
            {item?.title ?? 'Séries'}
          </h1>

          {metadata ? (
            <p
              key={`series-hero-metadata-${heroIndex}-${metadata}`}
              data-xf-hero-metadata="true"
              className="mt-1.5 max-w-xl text-[clamp(0.5rem,0.66vw,0.62rem)] font-bold uppercase tracking-[0.16em] text-white/90"
            >
              {metadata}
            </p>
          ) : null}

          <p
            key={`series-hero-description-${heroIndex}-${overview}`}
            data-xf-hero-description="true"
            className="mt-2 max-w-xl text-[clamp(0.62rem,0.82vw,0.77rem)] leading-[1.45] text-zinc-200"
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden',
            }}
          >
            {overview}
          </p>

          {item ? (
            <>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
                <FocusableButton
                  focusKey={FOCUS_KEYS.HERO_PLAY_BUTTON}
                  focusScrollTarget="closest-section"
                  focusScrollOptions={{
                    behavior: 'auto',
                    block: 'center',
                    inline: 'nearest',
                  }}
                  className="inline-flex min-h-[calc(var(--xf-action-height)*0.58)] items-center justify-center gap-1.5 rounded-[0.22rem] border border-white/40 bg-white/10 px-[calc(var(--xf-action-inline-padding)*0.48)] text-[clamp(0.58rem,0.76vw,0.7rem)] font-black text-white backdrop-blur-md transition-[background-color,color,border-color] duration-100 data-[focused=true]:border-white data-[focused=true]:bg-white data-[focused=true]:text-black"
                  onClick={() => onOpenItem(item)}
                  onEnterPress={() => onOpenItem(item)}
                  onArrowPress={(direction) =>
                    onButtonArrowPress(direction, 'play')
                  }
                >
                  Assistir agora
                </FocusableButton>

                <FocusableButton
                  focusKey={FOCUS_KEYS.HERO_INFO_BUTTON}
                  focusScrollTarget="closest-section"
                  focusScrollOptions={{
                    behavior: 'auto',
                    block: 'center',
                    inline: 'nearest',
                  }}
                  className="inline-flex min-h-[calc(var(--xf-action-height)*0.58)] items-center justify-center gap-1.5 rounded-[0.22rem] border border-white/40 bg-white/10 px-[calc(var(--xf-action-inline-padding)*0.48)] text-[clamp(0.58rem,0.76vw,0.7rem)] font-black text-white backdrop-blur-md transition-[background-color,color,border-color] duration-100 data-[focused=true]:border-white data-[focused=true]:bg-white data-[focused=true]:text-black"
                  onClick={() => onOpenItem(item)}
                  onEnterPress={() => onOpenItem(item)}
                  onArrowPress={(direction) =>
                    onButtonArrowPress(direction, 'info')
                  }
                >
                  Mais informações
                </FocusableButton>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[0.5rem] font-bold uppercase tracking-[0.18em] text-white/80">
                  {totalItems} títulos agrupados
                </span>

                {heroTotal > 1
                  ? Array.from({ length: heroTotal }).map((_, index) => (
                      <span
                        key={`series-hero-indicator-${index}`}
                        className={
                          'h-1.5 rounded-full transition-all ' +
                          (index === heroIndex ? 'w-7 bg-white' : 'w-2.5 bg-white/35')
                        }
                        aria-hidden="true"
                      />
                    ))
                  : null}
              </div>
            </>
          ) : isLoading ? (
            <div className="mt-5 inline-flex w-fit rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-zinc-300">
              Carregando séries...
            </div>
          ) : null}
        </div>

      </div>
    </section>
  );
}

function formatHeroRating(value?: string) {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return numericValue.toFixed(1);
}

const EPISODE_WINDOW_SIZE = 12;

function getEpisodeWindowStart(activeIndex: number, total: number) {
  if (total <= EPISODE_WINDOW_SIZE) {
    return 0;
  }

  const halfWindow = Math.floor(EPISODE_WINDOW_SIZE / 2);
  const desiredStart = Math.max(0, activeIndex - halfWindow);

  return Math.min(desiredStart, total - EPISODE_WINDOW_SIZE);
}






type SeriesDetailHeroFrameProps = {
  disabled: boolean;
  children: ReactNode;
  onEnterPress: () => void;
  onArrowPress: (direction: string) => boolean;
};

function SeriesDetailHeroFrame({
  disabled,
  children,
  onEnterPress,
  onArrowPress,
}: SeriesDetailHeroFrameProps) {
  const { ref, focused } = useFocusable({
    focusKey: SERIES_DETAIL_HERO_FOCUS_KEY,
    onEnterPress,
    onArrowPress,
    focusable: !disabled,
  });

  useEffect(() => {
    if (focused && ref.current instanceof HTMLElement) {
      ref.current.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [focused, ref]);

  return (
    <section
      ref={ref}
      role="button"
      tabIndex={-1}
      className={
        'relative mb-5 overflow-hidden rounded-[0.9rem] border bg-zinc-950 px-4 py-4 shadow-2xl outline-none transition md:px-5 md:py-4 ' +
        (focused
          ? 'border-xf-red shadow-[0_0_0_0.18rem_rgba(229,9,20,0.30)]'
          : 'border-white/10')
      }
    >
      {children}
    </section>
  );
}

type SimilarSeriesCardProps = {
  item: HomeVodItem;
  focusKey: string;
  onEnterPress: () => void;
  onArrowPress: (direction: string) => boolean;
};

function SimilarSeriesCard({
  item,
  focusKey,
  onEnterPress,
  onArrowPress,
}: SimilarSeriesCardProps) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress,
    onArrowPress,
  });

  useEffect(() => {
    if (focused && ref.current instanceof HTMLElement) {
      ref.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [focused, ref]);

  return (
    <button
      ref={ref}
      type="button"
      className={
        'block w-full overflow-hidden rounded-[0.48rem] border bg-white/[0.035] text-left transition ' +
        (focused
          ? 'border-xf-red shadow-[0_0_0_0.16rem_rgba(229,9,20,0.32)]'
          : 'border-white/10')
      }
      onClick={onEnterPress}
    >
      {item.posterUrl ? (
        <img
          src={item.posterUrl}
          alt={item.title}
          className="aspect-[2/3] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="aspect-[2/3] bg-zinc-900" />
      )}
    </button>
  );
}

type EpisodePlaybackStatus = EpisodePlaybackProgressStatus;

type EpisodeListRowProps = {
  index: number;
  title: string;
  playbackStatus?: EpisodePlaybackStatus;
  progressPercent?: number;
  focusKey: string;
  onEnterPress: () => void;
  onArrowPress: (direction: string) => boolean;
};

function getEpisodePlaybackStatusLabel(status: EpisodePlaybackStatus) {
  if (status === 'played') {
    return 'Iniciado';
  }

  return 'Não iniciado';
}

function EpisodeListRow({
  index,
  title,
  playbackStatus = 'not-started',
  progressPercent = 0,
  focusKey,
  onEnterPress,
  onArrowPress,
}: EpisodeListRowProps) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress,
    onArrowPress,
  });

  useEffect(() => {
    if (focused && ref.current instanceof HTMLElement) {
      ref.current.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [focused, ref]);

  const statusLabel = getEpisodePlaybackStatusLabel(playbackStatus);
  const isStarted = playbackStatus === 'played';
  const safeProgressPercent = isStarted
    ? Math.min(100, Math.max(8, progressPercent))
    : 0;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={-1}
      className={
        'relative overflow-hidden grid grid-cols-[3.6rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[0.55rem] border px-3 py-2.5 transition ' +
        (focused
          ? 'border-xf-red bg-xf-red/15 shadow-[0_0_0_0.18rem_rgba(229,9,20,0.28)]'
          : isStarted
            ? 'border-blue-400/80 bg-blue-500/10 shadow-[0_0_0_0.08rem_rgba(96,165,250,0.28)]'
            : 'border-white/10 bg-white/[0.035]')
      }
    >
      <div className="flex h-9 w-12 items-center justify-center rounded-[0.4rem] border border-white/10 bg-black/35 text-[0.68rem] font-black text-white">
        {String(index + 1).padStart(2, '0')}
      </div>

      <h3 className="min-w-0 line-clamp-1 text-sm font-black leading-tight text-white md:text-base">
        {title}
      </h3>

      <p
        className={
          'shrink-0 rounded-full border px-2.5 py-1 text-[0.55rem] font-black uppercase tracking-[0.12em] ' +
          (isStarted
            ? 'border-blue-300/80 bg-blue-500/20 text-blue-100'
            : 'border-white/10 bg-black/30 text-zinc-300')
        }
      >
        {statusLabel}
      </p>

      {isStarted ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[0.12rem] bg-blue-950/60">
          <div
            className="h-full bg-blue-300/90"
            style={{ width: `${safeProgressPercent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function CatalogCategoryPage({
  groupSlugOverride,
}: CatalogCategoryPageProps = {}) {
  const { signOut } = useAuth();
  const {
    source: playlistSource,
    status: playlistStatus,
    localCatalogScopeKey,
    localCatalogGenerationId,
  } = usePlaylistRuntime();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const seriesGroupTitle = searchParams.get('groupTitle')?.trim() || null;
  const seriesTitle = searchParams.get('title')?.trim() || null;
  const seriesTmdbId = searchParams.get('tmdbId')?.trim() || null;
  const seriesTmdbTitle = searchParams.get('tmdbTitle')?.trim() || null;
  const seriesKey = searchParams.get('seriesKey')?.trim() || null;
  const movieTitle = searchParams.get('title')?.trim() || null;
  const movieTmdbId = searchParams.get('tmdbId')?.trim() || null;
  const movieTmdbTitle = searchParams.get('tmdbTitle')?.trim() || null;
  const navigationState = location.state as SeriesNavigationState | null;
  const movieNavigationState = location.state as {
    fromMoviesCategory?: boolean;
    fromMovieDetail?: boolean;
    returnTo?: string;
    selectedMovieItem?: HomeVodItem;
    movieSimilarSeedItems?: HomeVodItem[];
  } | null;
  const movieGroupTitle =
    searchParams.get('groupTitle')?.trim() ||
    movieNavigationState?.selectedMovieItem?.groupTitle ||
    null;
  const categoryDiscoveryScope: DiscoveryRuntimeAccessScope | null = useMemo(() => {
    const activation = getStoredLicenseActivation();

    if (
      !activation?.licenseCode?.trim() ||
      !activation.deviceIdentifier?.trim() ||
      !playlistSource?.sourceId?.trim()
    ) {
      return null;
    }

    return {
      licenseCode: activation.licenseCode,
      deviceIdentifier: activation.deviceIdentifier,
      sourceId: playlistSource.sourceId,
    };
  }, [playlistSource?.sourceId]);

  const isSeriesGroupListPage =
    (groupSlugOverride ?? params.groupSlug) === 'series-group' &&
    Boolean(seriesGroupTitle);
  const isMovieGroupListPage =
    (groupSlugOverride ?? params.groupSlug) === 'movie-group' &&
    Boolean(searchParams.get('groupTitle')?.trim());

  const isSeriesDetailPage =
    !isSeriesGroupListPage &&
    Boolean(
      seriesGroupTitle &&
        ((groupSlugOverride ?? params.groupSlug) === 'series-detail' ||
          seriesTmdbId ||
          seriesTmdbTitle ||
          seriesKey),
    );

  const isMovieDetailPage =
    !isSeriesGroupListPage &&
    (groupSlugOverride ?? params.groupSlug) === 'movie-detail' &&
    Boolean(movieTitle || movieTmdbId || movieTmdbTitle);

  const category = useMemo<CatalogCategoryDefinition | null>(() => {
    if (isSeriesGroupListPage && seriesGroupTitle) {
      return {
        slug: 'series-group',
        title: seriesGroupTitle,
        description: `Títulos disponíveis em ${seriesGroupTitle}.`,
        groupTitles: [seriesGroupTitle],
        path: '/category/series-group',
      } as CatalogCategoryDefinition;
    }

    if (isMovieGroupListPage && movieGroupTitle) {
      return {
        slug: 'movie-group',
        title: movieGroupTitle,
        description: `Títulos disponíveis em ${movieGroupTitle}.`,
        groupTitles: [movieGroupTitle],
        path: '/category/movie-group',
      } as CatalogCategoryDefinition;
    }

    const definition = getCatalogCategoryDefinition(
      groupSlugOverride ?? params.groupSlug,
    );

    if (definition) {
      return dedupeCatalogCategoryDefinitionGroups(definition);
    }

    if (isMovieDetailPage) {
      return {
        slug: 'movie-detail',
        title: movieTitle ?? movieTmdbTitle ?? 'Filme',
        description: 'Detalhes do filme selecionado.',
        groupTitles: [movieGroupTitle ?? 'Filmes'],
        path: '/category/movie-detail',
      } as CatalogCategoryDefinition;
    }

    if (!seriesGroupTitle) {
      return null;
    }

    return {
      slug: groupSlugOverride ?? params.groupSlug ?? 'series-detail',
      title: seriesTitle ?? seriesGroupTitle,
      description: 'Episodios disponiveis desta serie/novela.',
      groupTitles: [seriesGroupTitle],
      path: '/category/series-detail',
    } as CatalogCategoryDefinition;
  }, [
    groupSlugOverride,
    params.groupSlug,
    seriesGroupTitle,
    seriesTitle,
    isSeriesGroupListPage,
    isMovieGroupListPage,
    isMovieDetailPage,
    movieTitle,
    movieTmdbTitle,
    movieGroupTitle,
  ]);
  const isMovieSeeAllPage =
    !isMovieDetailPage &&
    !isSeriesDetailPage &&
    !isSeriesGroupListPage &&
    Boolean(
      category &&
        (category.slug === 'movie-group' ||
          category.slug.startsWith('filmes-')),
    );
  const initialItems = useMemo(() => {
    if (isMovieSeeAllPage) {
      return [];
    }

    const storedActivation = getStoredLicenseActivation();
    const licenseCode = storedActivation?.licenseCode?.trim();
    const deviceIdentifier =
      storedActivation?.deviceIdentifier || getOrCreateDeviceIdentifier();

    if (licenseCode && deviceIdentifier && !isSeriesDetailPage) {
      const cachedItems = readPresentationRouteCache<HomeVodItem[]>({
        licenseCode,
        deviceIdentifier,
        sourceId: playlistSource?.sourceId,
        route: `${location.pathname}${location.search}`,
      });

      if (cachedItems?.length) {
        return cachedItems;
      }
    }

    return readInitialCategoryItems(
      category,
      seriesTmdbId,
      seriesTmdbTitle,
      seriesKey,
      seriesTitle,
      playlistSource?.sourceId ?? null,
      isSeriesDetailPage,
    );
  }, [
    category,
    isMovieSeeAllPage,
    location.pathname,
    location.search,
    isSeriesDetailPage,
    playlistSource?.sourceId,
    seriesTmdbId,
    seriesTmdbTitle,
    seriesKey,
    seriesTitle,
  ]);

  const [items, setItems] = useState<HomeVodItem[]>(initialItems);
  const [visibleItemCount, setVisibleItemCount] = useState(
    resolveVisibleCount(initialItems.length),
  );
  const [episodeFocusIndex, setEpisodeFocusIndex] = useState(0);
  const [locallyEnrichedSeriesHeroHighlights, setLocallyEnrichedSeriesHeroHighlights] =
    useState<HomeVodItem[]>([]);
  const [locallyEnrichedMovieHeroHighlights, setLocallyEnrichedMovieHeroHighlights] =
    useState<HomeVodItem[]>([]);
  const [locallyEnrichedMovieDetailItem, setLocallyEnrichedMovieDetailItem] =
    useState<EnrichedMovieDetailState | null>(null);
  const [locallyEnrichedSeriesDetailHero, setLocallyEnrichedSeriesDetailHero] =
    useState<{ item: HomeVodItem; sourceId: string } | null>(null);
  const [seriesCardEnrichmentAttemptedIds, setSeriesCardEnrichmentAttemptedIds] =
    useState<string[]>([]);
  const [similarItems, setSimilarItems] = useState<HomeVodItem[]>([]);
  const [isLoading, setIsLoading] = useState(initialItems.length === 0);
  const [isSeriesDetailPreparing, setIsSeriesDetailPreparing] = useState(false);
  const [seriesDetailPollTick, setSeriesDetailPollTick] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [categoryRetryKey, setCategoryRetryKey] = useState(0);
  const [categoryTotalCount, setCategoryTotalCount] = useState(0);
  const [loadedCategoryRawOffset, setLoadedCategoryRawOffset] = useState(0);
  const [hasMoreCategoryItems, setHasMoreCategoryItems] = useState(false);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isProgressiveLoadArmed, setIsProgressiveLoadArmed] = useState(false);
  const categorySentinelRef = useRef<HTMLDivElement | null>(null);
  const categoryRequestGenerationRef = useRef(0);
  const categoryRequestedOffsetsRef = useRef(new Set<number>());
  const categoryLoadedItemIdsRef = useRef(new Set<string>());
  const categoryPendingRequestRef = useRef<Promise<boolean> | null>(null);
  const categoryAutoFocusIdentityRef = useRef('');

  const categoryRenderKey = useMemo(
    () =>
      [
        location.pathname,
        location.search,
        category?.slug ?? '',
        category?.title ?? '',
        category?.groupTitles.join('|') ?? '',
        isSeriesDetailPage ? 'series-detail' : '',
        isMovieDetailPage ? 'movie-detail' : '',
      ].join('::'),
    [
      location.pathname,
      location.search,
      category?.slug,
      category?.title,
      category?.groupTitles,
      isSeriesDetailPage,
      isMovieDetailPage,
    ],
  );

  useLayoutEffect(() => {
    setItems(initialItems);
    setVisibleItemCount(resolveVisibleCount(initialItems.length));
    setIsLoading(initialItems.length === 0);
    setIsSeriesDetailPreparing(false);
    setErrorMessage(null);
    setEpisodeFocusIndex(0);
    setSimilarItems([]);
    setLocallyEnrichedSeriesHeroHighlights([]);
    setLocallyEnrichedMovieHeroHighlights([]);
    setLocallyEnrichedMovieDetailItem(null);
    setSeriesCardEnrichmentAttemptedIds([]);
    setCategoryTotalCount(0);
    setLoadedCategoryRawOffset(0);
    setHasMoreCategoryItems(false);
    setIsLoadingNextPage(false);
    setIsProgressiveLoadArmed(false);
    categoryRequestGenerationRef.current += 1;
    categoryRequestedOffsetsRef.current.clear();
    categoryLoadedItemIdsRef.current.clear();
    categoryPendingRequestRef.current = null;
  }, [categoryRenderKey, initialItems]);

  function scrollSeriesHeroIntoSafeView() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const hero = document.querySelector<HTMLElement>(
      '[data-xf-series-category-hero="true"]',
    );

    if (!hero) {
      return;
    }

    hero.scrollIntoView({
      behavior: 'auto',
      block: 'start',
      inline: 'nearest',
    });

    const headerOffset = 96; // Ajustado para o tamanho real do header fixo
    window.scrollBy({
      top: -headerOffset,
      left: 0,
      behavior: 'auto',
    });
  }

  const currentSeriesIdentity = useMemo(
    () =>
      [
        seriesGroupTitle ?? '',
        seriesTmdbId ?? '',
        seriesTmdbTitle ?? '',
        seriesKey ?? '',
        seriesTitle ?? '',
      ].join('::'),
    [seriesGroupTitle, seriesTmdbId, seriesTmdbTitle, seriesKey, seriesTitle],
  );

  function pickSimilarCollectionsFromSections(
    sections: { items: HomeVodItem[] }[],
    currentHeroItem: HomeVodItem | null,
  ) {
    if (!currentHeroItem) {
      return [];
    }

    const heroKey =
      currentHeroItem.tmdbId ||
      currentHeroItem.tmdbTitle ||
      currentHeroItem.title;

    const byCollection = new Map<string, HomeVodItem>();

    for (const section of sections) {
      for (const item of section.items) {
        if (!item.posterUrl) {
          continue;
        }

        const key = item.tmdbId || item.tmdbTitle || item.title;

        if (!key || key === heroKey || byCollection.has(key)) {
          continue;
        }

        if (item.kind && item.kind !== 'series') {
          continue;
        }

        byCollection.set(key, item);
      }
    }

    return Array.from(byCollection.values()).slice(0, 8);
  }

  function filterSeriesEpisodes(nextItems: HomeVodItem[]) {
    if (!isSeriesDetailPage) {
      return nextItems;
    }

    return sortEpisodesNaturally(
      nextItems.filter(
        (item) =>
          item.isSeriesCollection !== true &&
          Boolean(item.streamUrl?.trim()) &&
          isItemOfSelectedSeries(item, {
            seriesKey,
            seriesTmdbId,
            seriesTmdbTitle,
            seriesTitle,
          }),
      ),
    );
  }

  function getMoviesLocalFirstMetricNowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function getMoviesLocalFirstMetricElapsedMs(startedAtMs: number) {
    return Math.max(0, Math.round(getMoviesLocalFirstMetricNowMs() - startedAtMs));
  }

  function countSanitizedMovieGroups(nextItems: HomeVodItem[]) {
    return new Set(
      nextItems
        .map((item) => item.groupTitle?.trim())
        .filter((groupTitle): groupTitle is string => Boolean(groupTitle)),
    ).size;
  }

  function logMoviesLocalFirstObservability({
    source,
    fallbackUsed,
    localCount,
    localGroupCount,
    configuredGroupCount,
    readTimeMs,
    fallbackCount,
    fallbackGroupCount,
  }: {
    source: 'local-first' | 'fallback';
    fallbackUsed: boolean;
    localCount: number;
    localGroupCount: number;
    configuredGroupCount: number;
    readTimeMs: number;
    fallbackCount?: number;
    fallbackGroupCount?: number;
  }) {
    console.info('[XANDEFLIX_MOVIES_LOCAL_FIRST_OBSERVABILITY]', {
      source,
      fallbackUsed,
      localCount,
      localGroupCount,
      configuredGroupCount,
      readTimeMs,
      fallbackCount,
      fallbackGroupCount,
    });
  }

  async function loadLocalFirstMovieCategoryItemsByGroup({
    sourceId,
  }: {
    sourceId?: string;
  }): Promise<HomeVodItem[]> {
    if (!sourceId?.trim()) {
      return [];
    }

    try {
      const localResult = await loadLocalMovieCategoryReadModel({
        sourceId,
        scopeKey: localCatalogScopeKey ?? undefined,
        totalLimit: CATEGORY_ITEM_LIMIT,
      });

      if (localResult.status !== 'ready') {
        throw new Error('LOCAL_MOVIE_CATEGORY_UNAVAILABLE');
      }

      return localResult.items;
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      console.warn('[XANDEFLIX_MOVIES_LOCAL_FIRST_LOAD_ERROR]', { errorName });
      throw error;
    }
  }

  const loadNextMovieCategoryPage = useCallback(() => {
    if (categoryPendingRequestRef.current) {
      return categoryPendingRequestRef.current;
    }

    const sourceId = playlistSource?.sourceId?.trim();
    const requestedOffset = loadedCategoryRawOffset;

    if (
      !isMovieSeeAllPage ||
      !category ||
      !sourceId ||
      !hasMoreCategoryItems ||
      categoryRequestedOffsetsRef.current.has(requestedOffset)
    ) {
      return Promise.resolve(false);
    }

    const requestGeneration = categoryRequestGenerationRef.current;
    categoryRequestedOffsetsRef.current.add(requestedOffset);
    setIsLoadingNextPage(true);

    const request = loadLocalMovieCategoryPage({
      sourceId,
      scopeKey: localCatalogScopeKey ?? undefined,
      groupTitles: category.groupTitles,
      offset: requestedOffset,
      limit: LOCAL_MOVIE_CATEGORY_PAGE_SIZE,
    })
      .then((page) => {
        if (
          requestGeneration !== categoryRequestGenerationRef.current ||
          page.status !== 'ready'
        ) {
          return false;
        }

        const appendedItems = page.items.filter(
          (item) => !categoryLoadedItemIdsRef.current.has(item.id),
        );
        for (const item of appendedItems) {
          categoryLoadedItemIdsRef.current.add(item.id);
        }
        setItems((currentItems) => {
          return mergeLocalMovieCategoryPageItems(
            currentItems,
            appendedItems,
          );
        });
        setLoadedCategoryRawOffset(page.rawOffset + page.receivedCount);
        setCategoryTotalCount(page.totalCount);
        setHasMoreCategoryItems(page.hasMore);
        console.info('[XANDEFLIX_SEE_ALL_LOCAL_PAGE]', {
          requestedOffset,
          receivedCount: page.receivedCount,
          appendedCount: appendedItems.length,
          loadedCount: categoryLoadedItemIdsRef.current.size,
          totalCount: page.totalCount,
          hasMore: page.hasMore,
        });
        return page.receivedCount > 0;
      })
      .catch((error) => {
        categoryRequestedOffsetsRef.current.delete(requestedOffset);
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        console.warn('[XANDEFLIX_SEE_ALL_LOCAL_PAGE_ERROR]', {
          requestedOffset,
          errorName,
        });
        return false;
      })
      .finally(() => {
        if (requestGeneration === categoryRequestGenerationRef.current) {
          setIsLoadingNextPage(false);
          categoryPendingRequestRef.current = null;
        }
      });

    categoryPendingRequestRef.current = request;
    return request;
  }, [
    category,
    hasMoreCategoryItems,
    isMovieSeeAllPage,
    loadedCategoryRawOffset,
    localCatalogScopeKey,
    playlistSource?.sourceId,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function loadCategoryItems() {
      setIsLoading(initialItems.length === 0);
      setErrorMessage(null);

      if (!category) {
        setErrorMessage('Categoria nao encontrada.');
        setIsLoading(false);
        return;
      }

      if (
        !isMovieDetailPage &&
        !isSeriesDetailPage &&
        !playlistSource?.sourceId?.trim()
      ) {
        if (playlistStatus === 'empty') {
          setItems([]);
          setVisibleItemCount(0);
          setIsLoading(false);
        } else if (initialItems.length > 0) {
          setItems(initialItems);
          setVisibleItemCount(resolveVisibleCount(initialItems.length));
          setIsLoading(false);
        } else if (playlistStatus === 'error') {
          setErrorMessage('Nao foi possivel acessar o catalogo local agora.');
          setIsLoading(false);
        } else if (
          playlistStatus !== 'idle' &&
          playlistStatus !== 'loading'
        ) {
          setErrorMessage(
            'A fonte local autorizada nao esta disponivel agora.',
          );
          setIsLoading(false);
        }
        return;
      }

      try {
        const storedActivation = getStoredLicenseActivation();
        const licenseCode = storedActivation?.licenseCode?.trim();

        if (!licenseCode) {
          setItems([]);
          setVisibleItemCount(0);
          setErrorMessage(
            'Nao foi possivel validar a licenca para carregar esta categoria.',
          );
          return;
        }

        const deviceIdentifier =
          storedActivation?.deviceIdentifier || getOrCreateDeviceIdentifier();

        if (isMovieSeeAllPage) {
          const sourceId = playlistSource?.sourceId?.trim();

          if (!sourceId) {
            setItems([]);
            setCategoryTotalCount(0);
            setHasMoreCategoryItems(false);
            setErrorMessage('Catalogo local indisponivel para esta categoria.');
            return;
          }

          const requestGeneration =
            categoryRequestGenerationRef.current + 1;
          categoryRequestGenerationRef.current = requestGeneration;
          categoryRequestedOffsetsRef.current.clear();
          categoryRequestedOffsetsRef.current.add(0);
          categoryLoadedItemIdsRef.current.clear();
          categoryPendingRequestRef.current = null;
          setItems([]);
          setVisibleItemCount(0);
          setCategoryTotalCount(0);
          setLoadedCategoryRawOffset(0);
          setHasMoreCategoryItems(false);
          setIsLoadingNextPage(false);

          const page = await loadLocalMovieCategoryPage({
            sourceId,
            scopeKey: localCatalogScopeKey ?? undefined,
            groupTitles: category.groupTitles,
            offset: 0,
            limit: LOCAL_MOVIE_CATEGORY_PAGE_SIZE,
          });

          if (
            !isMounted ||
            requestGeneration !== categoryRequestGenerationRef.current
          ) {
            return;
          }

          if (page.status !== 'ready') {
            setErrorMessage(
              page.status === 'not_found'
                ? 'Categoria nao encontrada no catalogo local.'
                : 'Catalogo local indisponivel para esta categoria.',
            );
            return;
          }

          const initialPageItems = mergeLocalMovieCategoryPageItems(
            [],
            page.items,
          );
          categoryLoadedItemIdsRef.current = new Set(
            initialPageItems.map((item) => item.id),
          );
          setItems(initialPageItems);
          setVisibleItemCount(initialPageItems.length);
          setCategoryTotalCount(page.totalCount);
          setLoadedCategoryRawOffset(page.rawOffset + page.receivedCount);
          setHasMoreCategoryItems(page.hasMore);
          console.info('[XANDEFLIX_SEE_ALL_LOCAL_PAGE]', {
            requestedOffset: 0,
            receivedCount: page.receivedCount,
            appendedCount: initialPageItems.length,
            loadedCount: initialPageItems.length,
            totalCount: page.totalCount,
            hasMore: page.hasMore,
          });
          return;
        }

        const cachedItems = getCachedHomeVodCategoryItems({
          licenseCode,
          deviceIdentifier,
          sourceId: playlistSource?.sourceId,
          groupTitles: category.groupTitles,
          limit: BOOTSTRAP_CATEGORY_ITEM_LIMIT,
          slug: category.slug,
        });

        const cachedGroupTitleCount =
          category.slug === 'filmes'
            ? new Set(
                (cachedItems ?? [])
                  .map((item) => item.groupTitle?.trim())
                  .filter((groupTitle): groupTitle is string => Boolean(groupTitle)),
              ).size
            : 0;
        const shouldUseCachedItems =
          !isSeriesDetailPage &&
          Boolean(cachedItems?.length) &&
          (category.slug !== 'filmes' || cachedGroupTitleCount > 1);

        if (shouldUseCachedItems && cachedItems) {
          const filteredCachedItems = filterSeriesEpisodes(cachedItems);
          const nextCachedItems =
            category.slug === 'series' || category.slug === 'series-group'
              ? dedupeSeriesCollections(filteredCachedItems)
              : category.slug === 'movie-group'
                ? filteredCachedItems.filter((item) => item.kind === 'movie')
              : filteredCachedItems;

          setItems(nextCachedItems);
          setVisibleItemCount(resolveVisibleCount(nextCachedItems.length));
          setIsLoading(nextCachedItems.length === 0);
        } else if (initialItems.length === 0) {
          setItems([]);
          setVisibleItemCount(0);
        }

        const localSeriesDetail =
          isSeriesDetailPage && playlistSource?.sourceId && seriesKey
              ? await loadLocalCatalogSeriesDetailReadModel({
                  sourceId: playlistSource.sourceId,
                  scopeKey: localCatalogScopeKey,
                  seriesKey,
                })
            : null;
        const seriesDetailPreparing =
          localSeriesDetail?.status === 'index_building';
        setIsSeriesDetailPreparing(seriesDetailPreparing);
        const nextItems =
          (localSeriesDetail?.status === 'ready'
            ? localSeriesDetail.episodes
            : seriesDetailPreparing
              ? []
              : undefined) ??
          (category.slug === 'filmes'
            ? await (async () => {
                const localReadStartedAtMs = getMoviesLocalFirstMetricNowMs();
                const localItems = await loadLocalFirstMovieCategoryItemsByGroup({
                  sourceId:
                    playlistSource?.sourceType === 'm3u'
                      ? playlistSource.sourceId
                      : undefined,
                });
                const localReadTimeMs = getMoviesLocalFirstMetricElapsedMs(localReadStartedAtMs);

                if (localItems.length > 0) {
                  logMoviesLocalFirstObservability({
                    source: 'local-first',
                    fallbackUsed: false,
                    localCount: localItems.length,
                    localGroupCount: countSanitizedMovieGroups(localItems),
                    configuredGroupCount: category.groupTitles.length,
                    readTimeMs: localReadTimeMs,
                  });

                  return localItems;
                }

                logMoviesLocalFirstObservability({
                  source: 'local-first',
                  fallbackUsed: false,
                  localCount: 0,
                  localGroupCount: 0,
                  configuredGroupCount: category.groupTitles.length,
                  readTimeMs: localReadTimeMs,
                });

                return [];
              })()
            : await loadHomeVodCategoryItems({
                licenseCode,
                deviceIdentifier,
                sourceId: playlistSource?.sourceId,
                scopeKey: localCatalogScopeKey ?? undefined,
                groupTitles: category.groupTitles,
                limit: CATEGORY_ITEM_LIMIT,
                slug: category.slug,
                propagateReadError: true,
              }));

        if (!isMounted) {
          return;
        }

        const filteredNextItems = filterSeriesEpisodes(nextItems);
        const nextCategoryItems =
          category.slug === 'series' || category.slug === 'series-group'
            ? dedupeSeriesCollections(filteredNextItems)
            : category.slug === 'movie-group'
              ? filteredNextItems.filter((item) => item.kind === 'movie')
            : filteredNextItems;

        if (isSeriesDetailPage && !seriesDetailPreparing) {
          storeCachedSeriesEpisodes(
            {
              licenseCode,
              deviceIdentifier,
              sourceId: playlistSource?.sourceId,
              seriesKey,
              groupTitles: category.groupTitles,
              tmdbId: seriesTmdbId,
              tmdbTitle: seriesTmdbTitle,
            },
            filteredNextItems,
          );
        }

        setItems(nextCategoryItems);
        setVisibleItemCount(resolveVisibleCount(nextCategoryItems.length));

        if (!isSeriesDetailPage) {
          writePresentationRouteCache(
            {
              licenseCode,
              deviceIdentifier,
              sourceId: playlistSource?.sourceId,
              route: `${location.pathname}${location.search}`,
            },
            nextCategoryItems,
          );
        }
      } catch (error) {
        console.warn('[XANDEFLIX_CATEGORY_LOAD_ERROR]', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });

        if (isMounted) {
          const hasFallbackItems = initialItems.length > 0;

          setErrorMessage(
            hasFallbackItems
              ? null
              : 'Nao foi possivel carregar esta categoria agora. Tente novamente em instantes.',
          );

          if (!hasFallbackItems) {
            setItems([]);
            setVisibleItemCount(0);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCategoryItems();

    return () => {
      isMounted = false;
    };
  }, [
    category,
    categoryRetryKey,
    initialItems,
    isMovieDetailPage,
    isMovieSeeAllPage,
    isSeriesDetailPage,
    seriesTmdbId,
    seriesTmdbTitle,
    seriesKey,
    seriesTitle,
    playlistSource?.sourceId,
    playlistSource?.sourceType,
    localCatalogScopeKey,
    playlistStatus,
    seriesDetailPollTick,
  ]);

  useEffect(() => {
    if (!isSeriesDetailPage || !isSeriesDetailPreparing) return;
    const timer = window.setInterval(
      () => setSeriesDetailPollTick((value) => value + 1),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [isSeriesDetailPage, isSeriesDetailPreparing]);

  const seriesDetailItems = useMemo(() => {
    if (!isSeriesDetailPage) {
      return items;
    }

    return filterSeriesEpisodes(items);
  }, [
    isSeriesDetailPage,
    items,
    seriesKey,
    seriesTmdbId,
    seriesTmdbTitle,
    seriesTitle,
  ]);

  const visibleItems = useMemo(
    () =>
      isMovieSeeAllPage || isSeriesGroupListPage
        ? seriesDetailItems
        : seriesDetailItems.slice(0, visibleItemCount),
    [
      isMovieSeeAllPage,
      isSeriesGroupListPage,
      seriesDetailItems,
      visibleItemCount,
    ],
  );

  useEffect(() => {
    if (!isMovieSeeAllPage || isProgressiveLoadArmed) {
      return;
    }

    const armProgressiveLoad = () => setIsProgressiveLoadArmed(true);

    window.addEventListener('touchstart', armProgressiveLoad, { passive: true });
    window.addEventListener('wheel', armProgressiveLoad, { passive: true });
    return () => {
      window.removeEventListener('touchstart', armProgressiveLoad);
      window.removeEventListener('wheel', armProgressiveLoad);
    };
  }, [isMovieSeeAllPage, isProgressiveLoadArmed]);

  useEffect(() => {
    const sentinel = categorySentinelRef.current;

    if (
      !isMovieSeeAllPage ||
      !isProgressiveLoadArmed ||
      !hasMoreCategoryItems ||
      !sentinel ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNextMovieCategoryPage();
        }
      },
      { rootMargin: '480px 0px' },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [
    hasMoreCategoryItems,
    isMovieSeeAllPage,
    isProgressiveLoadArmed,
    loadNextMovieCategoryPage,
    visibleItems.length,
  ]);

  const heroItem = useMemo(() => {
    if (!isSeriesDetailPage) {
      return null;
    }

    const representative = getBestSeriesEpisodeRepresentative(seriesDetailItems);

    if (!representative) {
      return null;
    }

    const selectedSeriesItem =
      navigationState?.selectedSeriesItem &&
      isItemOfSelectedSeries(navigationState.selectedSeriesItem, {
        seriesKey,
        seriesTmdbId,
        seriesTmdbTitle,
        seriesTitle,
      })
        ? navigationState.selectedSeriesItem
        : null;

    return mergeSeriesHeroMetadata(representative, selectedSeriesItem);
  }, [
    isSeriesDetailPage,
    navigationState?.selectedSeriesItem,
    seriesDetailItems,
    seriesKey,
    seriesTmdbId,
    seriesTmdbTitle,
    seriesTitle,
  ]);
  const cachedSeriesDetailHero = useMemo(
    () =>
      heroItem
        ? hydrateSeriesDetailHeroFromCache(heroItem)
        : null,
    [heroItem],
  );
  const effectiveSeriesDetailHero =
    locallyEnrichedSeriesDetailHero &&
    cachedSeriesDetailHero &&
    locallyEnrichedSeriesDetailHero.sourceId === playlistSource?.sourceId &&
    getSeriesCollectionKey(locallyEnrichedSeriesDetailHero.item) ===
      getSeriesCollectionKey(cachedSeriesDetailHero)
      ? locallyEnrichedSeriesDetailHero.item
      : cachedSeriesDetailHero;
  const movieDetailCandidates = useMemo(() => {
    if (!isMovieDetailPage) {
      return [];
    }

    const byCandidate = new Map<string, HomeVodItem>();

    function addCandidate(item?: HomeVodItem | null) {
      if (!item) {
        return;
      }

      const key = String(item.id || item.tmdbId || item.tmdbTitle || item.title);

      if (!key || byCandidate.has(key)) {
        return;
      }

      byCandidate.set(key, item);
    }

    addCandidate(movieNavigationState?.selectedMovieItem);

    for (const item of items) {
      addCandidate(item);
    }

    for (const item of movieNavigationState?.movieSimilarSeedItems ?? []) {
      addCandidate(item);
    }

    return Array.from(byCandidate.values());
  }, [
    isMovieDetailPage,
    items,
    movieNavigationState?.movieSimilarSeedItems,
    movieNavigationState?.selectedMovieItem,
  ]);

  const movieDetailItem = useMemo(() => {
    if (!isMovieDetailPage) {
      return null;
    }

    const normalizeMovieValue = (value?: string | null) =>
      value
        ?.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase() ?? '';

    const requestedTmdbId = normalizeMovieValue(movieTmdbId);
    const requestedTmdbTitle = normalizeMovieValue(movieTmdbTitle);
    const requestedTitle = normalizeMovieValue(movieTitle);

    const matchedItem = movieDetailCandidates.find((item) => {
      if (requestedTmdbId && normalizeMovieValue(item.tmdbId) === requestedTmdbId) {
        return true;
      }

      if (
        requestedTmdbTitle &&
        normalizeMovieValue(item.tmdbTitle) === requestedTmdbTitle
      ) {
        return true;
      }

      if (!requestedTitle) {
        return false;
      }

      return (
        normalizeMovieValue(item.tmdbTitle) === requestedTitle ||
        normalizeMovieValue(item.title) === requestedTitle
      );
    });

    return matchedItem ?? movieNavigationState?.selectedMovieItem ?? items[0] ?? null;
  }, [
    isMovieDetailPage,
    items,
    movieDetailCandidates,
    movieNavigationState?.selectedMovieItem,
    movieTitle,
    movieTmdbId,
    movieTmdbTitle,
  ]);
  const movieDetailRequestIdentity = movieDetailItem
    ? createMovieDetailRequestIdentity(
        movieDetailItem,
        playlistSource?.sourceId,
      )
    : null;
  const effectiveMovieDetailItem =
    locallyEnrichedMovieDetailItem &&
    locallyEnrichedMovieDetailItem.requestIdentity === movieDetailRequestIdentity
      ? locallyEnrichedMovieDetailItem.item
      : movieDetailItem;

  const movieDetailFocusSlug = movieDetailItem
    ? `movie-detail-${
        String(
          movieDetailItem.id ||
            movieDetailItem.tmdbId ||
            movieDetailItem.tmdbTitle ||
            movieDetailItem.title,
        )
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80)
          .toLowerCase() || 'item'
      }`
    : 'movie-detail';

  const isSeriesCategoryPage = !isSeriesDetailPage && category?.slug === 'series';
  const isMoviesCategoryPage = !isSeriesDetailPage && category?.slug === 'filmes';
  const movieDetailMetadataItems = effectiveMovieDetailItem
    ? buildMovieDetailMetadataItems(effectiveMovieDetailItem)
    : [];
  const movieSimilarItems = useMemo(() => {
    if (!isMovieDetailPage || !movieDetailItem) {
      return [];
    }

    const currentKey =
      movieDetailItem.tmdbId || movieDetailItem.tmdbTitle || movieDetailItem.title;

    const byMovie = new Map<string, HomeVodItem>();

    const sourceItems = movieDetailCandidates;

    for (const item of sourceItems) {
      if (!item.posterUrl) {
        continue;
      }

      if (item.kind && item.kind !== 'movie') {
        continue;
      }

      const key = item.tmdbId || item.tmdbTitle || item.title;

      if (!key || key === currentKey || byMovie.has(key)) {
        continue;
      }

      byMovie.set(key, item);
    }

    return Array.from(byMovie.values()).slice(0, 12);
  }, [
    isMovieDetailPage,
    movieDetailCandidates,
    movieDetailItem,
  ]);


  const canonicalSeriesCategorySections = useMemo(() => {
    if (!isSeriesCategoryPage) {
      return [];
    }

    const groupedItems = dedupeSeriesCollections(items);

    return buildSeriesCategorySections(groupedItems, category?.groupTitles ?? []);
  }, [category?.groupTitles, isSeriesCategoryPage, items]);

  const canonicalMoviesCategorySections = useMemo(() => {
    if (!isMoviesCategoryPage) {
      return [];
    }

    return buildMoviesCategorySections(items, category?.groupTitles ?? []);
  }, [category?.groupTitles, isMoviesCategoryPage, items]);
  const categoryDiscoveryGenerationKey = useMemo(
    () =>
      createBoundedDiscoveryGenerationKey({
        sourceId: playlistSource?.sourceId ?? 'local-source',
        activeGenerationId: localCatalogGenerationId,
        candidates: items,
      }),
    [items, localCatalogGenerationId, playlistSource?.sourceId],
  );
  const categoryDiscoverySurfaceKey = isMoviesCategoryPage
    ? 'movies'
    : isSeriesCategoryPage
      ? 'series'
      : null;
  const latestCategoryDiscoveryGenerationRef = useRef(
    categoryDiscoveryGenerationKey,
  );
  latestCategoryDiscoveryGenerationRef.current =
    categoryDiscoveryGenerationKey;

  useEffect(() => {
    const generationAtEntry = latestCategoryDiscoveryGenerationRef.current;

    return () => {
      if (
        categoryDiscoveryScope &&
        categoryDiscoverySurfaceKey &&
        latestCategoryDiscoveryGenerationRef.current !== generationAtEntry
      ) {
        removeDiscoveryRuntimeSurfaceSnapshots(
          categoryDiscoveryScope,
          categoryDiscoverySurfaceKey,
        );
      }
    };
  }, [categoryDiscoveryScope, categoryDiscoverySurfaceKey]);

  const seriesCategorySectionsBase = useMemo(() => {
    if (!categoryDiscoveryScope) {
      return canonicalSeriesCategorySections;
    }

    return canonicalSeriesCategorySections.map((section) => ({
      ...section,
      items: resolveLocalCatalogDiscoverySnapshot({
        scope: categoryDiscoveryScope,
        surfaceKey: 'series',
        sectionKey: `row:${section.id}`,
        generationKey: categoryDiscoveryGenerationKey,
        candidates: section.items,
        slotCount: section.items.length,
        historyKind: 'CATEGORY_DISCOVERY_WINDOW',
        historyItemCount: Math.min(5, section.items.length),
        isArtworkReady: (item) => Boolean(item.posterUrl?.trim()),
      }).items,
    }));
  }, [
    canonicalSeriesCategorySections,
    categoryDiscoveryGenerationKey,
    categoryDiscoveryScope,
  ]);
  const moviesCategorySectionsBase = useMemo(() => {
    if (!categoryDiscoveryScope) {
      return canonicalMoviesCategorySections;
    }

    return canonicalMoviesCategorySections.map((section) => ({
      ...section,
      items: resolveLocalCatalogDiscoverySnapshot({
        scope: categoryDiscoveryScope,
        surfaceKey: 'movies',
        sectionKey: `row:${section.id}`,
        generationKey: categoryDiscoveryGenerationKey,
        candidates: section.items,
        slotCount: section.items.length,
        historyKind: 'CATEGORY_DISCOVERY_WINDOW',
        historyItemCount: Math.min(5, section.items.length),
        isArtworkReady: (item) => Boolean(item.posterUrl?.trim()),
      }).items,
    }));
  }, [
    canonicalMoviesCategorySections,
    categoryDiscoveryGenerationKey,
    categoryDiscoveryScope,
  ]);

  const movieHeroHighlights = useMemo(() => {
    const candidates = buildMovieHeroHighlights(moviesCategorySectionsBase);

    if (!categoryDiscoveryScope) {
      return candidates;
    }

    return resolveLocalCatalogDiscoverySnapshot({
      scope: categoryDiscoveryScope,
      surfaceKey: 'movies',
      sectionKey: 'hero',
      generationKey: categoryDiscoveryGenerationKey,
      candidates,
      slotCount: candidates.length,
      historyKind: 'MOVIES_HERO',
      isArtworkReady: (item) =>
        getHorizontalHeroArtworkCandidates(item).length > 0,
    }).items;
  }, [
    categoryDiscoveryGenerationKey,
    categoryDiscoveryScope,
    moviesCategorySectionsBase,
  ]);
  const effectiveMovieHeroHighlights = useMemo(() => {
    if (
      locallyEnrichedMovieHeroHighlights.length !== movieHeroHighlights.length ||
      locallyEnrichedMovieHeroHighlights.some(
        (item, index) => item.id !== movieHeroHighlights[index]?.id,
      )
    ) {
      return movieHeroHighlights;
    }

    return locallyEnrichedMovieHeroHighlights;
  }, [locallyEnrichedMovieHeroHighlights, movieHeroHighlights]);
  const movieHeroPresentationItems = effectiveMovieHeroHighlights;

  const movieHeroItem = useMemo(() => {
    if (!isMoviesCategoryPage) {
      return null;
    }

    return getMovieHeroItem(
      moviesCategorySectionsBase.flatMap((section) => section.items),
    );
  }, [isMoviesCategoryPage, moviesCategorySectionsBase]);

  const movieHeroRotation = useAutoRotatingHero({
    poolIds: movieHeroPresentationItems.map((item) => item.id),
    heroSelector: '[data-xf-movie-category-hero="true"]',
  });
  const activeMovieHeroItem =
    movieHeroPresentationItems[movieHeroRotation.activeIndex] ?? movieHeroItem;

  useEffect(() => {
    if (!isMoviesCategoryPage || movieHeroHighlights.length === 0) {
      return;
    }

    let isCancelled = false;

    void import('../services/movieHeroMetadata.service').then(
      ({ enrichMovieHeroItems }) =>
        enrichMovieHeroItems(movieHeroHighlights, {
          sourceId: playlistSource?.sourceId,
          limit: 5,
        }).then((enrichedItems) => {
          if (!isCancelled) {
            setLocallyEnrichedMovieHeroHighlights(enrichedItems);
          }
        }),
    );

    return () => {
      isCancelled = true;
    };
  }, [
    isMoviesCategoryPage,
    movieHeroHighlights,
    playlistSource?.sourceId,
  ]);

  const movieDetailBackdropUrl = resolveMovieDetailHeroArtworkUrl(
    effectiveMovieDetailItem,
  );
  const movieDetailPosterUrl = effectiveMovieDetailItem?.posterUrl;

  useEffect(() => {
    if (!isMovieDetailPage || !movieDetailItem) {
      return;
    }

    let isCancelled = false;

    const requestIdentity = createMovieDetailRequestIdentity(
      movieDetailItem,
      playlistSource?.sourceId,
    );

    void import('../services/movieHeroMetadata.service').then(
      ({ enrichMovieDetailItem }) =>
        enrichMovieDetailItem(movieDetailItem, {
          sourceId: playlistSource?.sourceId,
        }).then((enrichedItem) => {
          if (!isCancelled) {
            setLocallyEnrichedMovieDetailItem({
              item: enrichedItem,
              requestIdentity,
            });
          }
        }),
    ).catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [
    isMovieDetailPage,
    movieDetailItem,
    playlistSource?.sourceId,
  ]);

  useEffect(() => {
    if (
      !isSeriesCategoryPage ||
      isLoading ||
      items.length === 0 ||
      seriesCategorySectionsBase.length === 0
    ) {
      return;
    }

    const storedActivation = getStoredLicenseActivation();
    const licenseCode = storedActivation?.licenseCode?.trim();

    if (!licenseCode) {
      return;
    }

    const deviceIdentifier =
      storedActivation?.deviceIdentifier || getOrCreateDeviceIdentifier();

    writeStoredSeriesLandingItems({
      licenseCode,
      deviceIdentifier,
      items,
    });
  }, [isSeriesCategoryPage, isLoading, items, seriesCategorySectionsBase.length]);

  const seriesHeroCandidates = useMemo(() => {
    const hydratedCandidates = hydrateSeriesHeroHighlightsFromCache(
      buildSeriesHeroHighlights(seriesCategorySectionsBase),
    );
    const horizontalCandidates = hydratedCandidates.filter(
      (item) => getHorizontalHeroArtworkCandidates(item).length > 0,
    );
    return [
      ...horizontalCandidates,
      ...hydratedCandidates.filter(
        (item) => getHorizontalHeroArtworkCandidates(item).length === 0,
      ),
    ];
  }, [seriesCategorySectionsBase]);
  const [persistentlyHydratedSeriesHeroHighlights, setPersistentlyHydratedSeriesHeroHighlights] =
    useState<HomeVodItem[]>([]);
  useEffect(() => {
    if (!isSeriesCategoryPage || seriesHeroCandidates.length === 0) {
      setPersistentlyHydratedSeriesHeroHighlights([]);
      return;
    }

    let isCancelled = false;
    void hydrateSeriesHeroHighlightsFromPersistentCache(
      seriesHeroCandidates,
      { sourceId: playlistSource?.sourceId },
    ).then((hydratedItems) => {
      if (!isCancelled) {
        setPersistentlyHydratedSeriesHeroHighlights(hydratedItems);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [
    isSeriesCategoryPage,
    playlistSource?.sourceId,
    seriesHeroCandidates,
  ]);
  const persistentSeriesHeroCandidates = useMemo(() => {
    if (
      persistentlyHydratedSeriesHeroHighlights.length !== seriesHeroCandidates.length ||
      persistentlyHydratedSeriesHeroHighlights.some(
        (item, index) => item.id !== seriesHeroCandidates[index]?.id,
      )
    ) {
      return seriesHeroCandidates;
    }

    return persistentlyHydratedSeriesHeroHighlights;
  }, [persistentlyHydratedSeriesHeroHighlights, seriesHeroCandidates]);
  const seriesHeroHighlights = useMemo(() => {
    const horizontalCandidates = persistentSeriesHeroCandidates.filter(
      (item) => getHorizontalHeroArtworkCandidates(item).length > 0,
    );
    const candidates = [
      ...horizontalCandidates,
      ...persistentSeriesHeroCandidates.filter(
        (item) => getHorizontalHeroArtworkCandidates(item).length === 0,
      ),
    ].slice(0, SERIES_HERO_HIGHLIGHT_LIMIT);

    if (!categoryDiscoveryScope) {
      return candidates;
    }

    return resolveLocalCatalogDiscoverySnapshot({
      scope: categoryDiscoveryScope,
      surfaceKey: 'series',
      sectionKey: 'hero',
      generationKey: categoryDiscoveryGenerationKey,
      candidates,
      slotCount: candidates.length,
      historyKind: 'SERIES_HERO',
      isArtworkReady: (item) =>
        getHorizontalHeroArtworkCandidates(item).length > 0,
    }).items;
  }, [
    categoryDiscoveryGenerationKey,
    categoryDiscoveryScope,
    persistentSeriesHeroCandidates,
  ]);
  const effectiveSeriesHeroHighlights = useMemo(() => {
    if (
      locallyEnrichedSeriesHeroHighlights.length !== seriesHeroHighlights.length ||
      locallyEnrichedSeriesHeroHighlights.some(
        (item, index) => item.id !== seriesHeroHighlights[index]?.id,
      )
    ) {
      return seriesHeroHighlights;
    }

    return locallyEnrichedSeriesHeroHighlights;
  }, [locallyEnrichedSeriesHeroHighlights, seriesHeroHighlights]);
  const seriesHeroPresentationItems = effectiveSeriesHeroHighlights;
  const seriesHeroItem = useMemo(() => {
    if (!isSeriesCategoryPage) {
      return null;
    }

    return getSeriesHeroItem(
      seriesCategorySectionsBase.flatMap((section) => section.items),
    );
  }, [isSeriesCategoryPage, seriesCategorySectionsBase]);
  const seriesHeroRotation = useAutoRotatingHero({
    poolIds: seriesHeroPresentationItems.map((item) => item.id),
    heroSelector: '[data-xf-series-category-hero="true"]',
  });
  const activeSeriesHeroIndex = seriesHeroRotation.activeIndex;
  const activeSeriesHeroItem =
    seriesHeroPresentationItems[activeSeriesHeroIndex] ?? seriesHeroItem;
  const seriesCollectionCount = seriesCategorySectionsBase.reduce(
    (total, section) => total + section.items.length,
    0,
  );
  const moviesCategorySections = useMemo(
    () =>
      moveDiscoveryHeroOutOfFirstSlot(
        moviesCategorySectionsBase,
        movieHeroPresentationItems.map((item) => item.id),
      ),
    [movieHeroPresentationItems, moviesCategorySectionsBase],
  );
  const seriesCategorySections = useMemo(
    () =>
      moveDiscoveryHeroOutOfFirstSlot(
        seriesCategorySectionsBase,
        seriesHeroPresentationItems.map((item) => item.id),
      ),
    [seriesHeroPresentationItems, seriesCategorySectionsBase],
  );
  const categoryFirstPaintKey = isMoviesCategoryPage
    ? 'movies'
    : isSeriesCategoryPage
      ? 'series'
      : null;
  const [fullyPaintedCategoryKey, setFullyPaintedCategoryKey] =
    useState<string | null>(null);

  useEffect(() => {
    if (!categoryFirstPaintKey) {
      return;
    }

    let timeoutId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => {
        setFullyPaintedCategoryKey(categoryFirstPaintKey);
      }, 50);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [categoryFirstPaintKey]);

  const visibleMoviesCategorySections =
    fullyPaintedCategoryKey === 'movies'
      ? moviesCategorySections
      : moviesCategorySections.slice(0, 1);
  const visibleSeriesCategorySections =
    fullyPaintedCategoryKey === 'series'
      ? seriesCategorySections
      : seriesCategorySections.slice(0, 1);

  useEffect(() => {
    if (!isSeriesCategoryPage || seriesHeroHighlights.length === 0) {
      setLocallyEnrichedSeriesHeroHighlights([]);
      return;
    }

    let isCancelled = false;

    void enrichSeriesHeroHighlights(seriesHeroHighlights, {
      sourceId: playlistSource?.sourceId,
    }).then(
      (enrichedHighlights) => {
        if (!isCancelled) {
          setLocallyEnrichedSeriesHeroHighlights(enrichedHighlights);
        }
      },
    );

    return () => {
      isCancelled = true;
    };
  }, [
    isSeriesCategoryPage,
    playlistSource?.sourceId,
    seriesHeroHighlights,
  ]);

  useEffect(() => {
    if (
      !isSeriesCategoryPage ||
      seriesCardEnrichmentAttemptedIds.length >= 18
    ) {
      return;
    }

    const attemptedIds = new Set(seriesCardEnrichmentAttemptedIds);
    const candidates = seriesCategorySections
      .flatMap((section) => section.items)
      .filter(
        (item) =>
          !attemptedIds.has(item.id) &&
          isSeriesCardPosterEnrichmentNeeded(item),
      )
      .slice(0, 18 - attemptedIds.size);

    if (candidates.length === 0) {
      return;
    }

    let isCancelled = false;

    void enrichSeriesCardPosters(candidates, {
      sourceId: playlistSource?.sourceId,
      limit: candidates.length,
    }).then((enrichedItems) => {
      if (isCancelled) {
        return;
      }

      setSeriesCardEnrichmentAttemptedIds((currentIds) => [
        ...currentIds,
        ...candidates.map((item) => item.id),
      ]);
      const enrichedById = new Map(
        enrichedItems.map((item) => [item.id, item]),
      );
      setItems((currentItems) => {
        let didChange = false;
        const nextItems = currentItems.map((item) => {
          const enrichedItem = enrichedById.get(item.id);

          if (!enrichedItem || enrichedItem === item) {
            return item;
          }

          didChange = true;
          return enrichedItem;
        });

        return didChange ? nextItems : currentItems;
      });
    }).catch(() => {
      if (!isCancelled) {
        setSeriesCardEnrichmentAttemptedIds((currentIds) => [
          ...currentIds,
          ...candidates.map((item) => item.id),
        ]);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [
    isSeriesCategoryPage,
    playlistSource?.sourceId,
    seriesCardEnrichmentAttemptedIds,
    seriesCategorySections,
  ]);

  useEffect(() => {
    if (!isSeriesDetailPage) {
      return;
    }

    void loadSimilarCollections(heroItem);
  }, [heroItem, isSeriesDetailPage]);

  useEffect(() => {
    if (
      !shouldRequestSeriesDetailMetadata({
        isSeriesDetailPage,
        item: cachedSeriesDetailHero,
        sourceId: playlistSource?.sourceId,
      }) ||
      !cachedSeriesDetailHero ||
      !playlistSource?.sourceId
    ) {
      return;
    }

    let isCancelled = false;
    const sourceId = playlistSource.sourceId;

    void enrichSeriesDetailHeroItem(cachedSeriesDetailHero, {
      sourceId,
    })
      .then((enrichedItem) => {
        if (!isCancelled) {
          setLocallyEnrichedSeriesDetailHero({
            item: enrichedItem,
            sourceId,
          });
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [
    cachedSeriesDetailHero,
    isSeriesDetailPage,
    playlistSource?.sourceId,
  ]);

  const episodeWindowStart = isSeriesDetailPage
    ? getEpisodeWindowStart(episodeFocusIndex, seriesDetailItems.length)
    : 0;

  const episodeWindowItems = isSeriesDetailPage
    ? seriesDetailItems.slice(
        episodeWindowStart,
        episodeWindowStart + EPISODE_WINDOW_SIZE,
      )
    : visibleItems;




  useEffect(() => {
    if (!category || visibleItems.length === 0) {
      return;
    }

    const autoFocusIdentity = `${categoryRenderKey}::${currentSeriesIdentity}`;

    if (categoryAutoFocusIdentityRef.current === autoFocusIdentity) {
      return;
    }

    const timer = window.setTimeout(() => {
      categoryAutoFocusIdentityRef.current = autoFocusIdentity;

      if (isSeriesDetailPage) {
        setFocus(SERIES_DETAIL_HERO_FOCUS_KEY);
        return;
      }

      if (isSeriesCategoryPage && seriesCategorySections[0]?.items.length) {
        scrollSeriesHeroIntoSafeView();
        setFocus(FOCUS_KEYS.HERO_PLAY_BUTTON);
        return;
      }

      if (isMoviesCategoryPage && moviesCategorySections[0]?.items.length) {
        scrollSeriesHeroIntoSafeView();
        setFocus(FOCUS_KEYS.HERO_PLAY_BUTTON);
        return;
      }

      setFocus(getCategoryItemFocusKey(category.slug, 0));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    category,
    categoryRenderKey,
    currentSeriesIdentity,
    isSeriesCategoryPage,
    isSeriesDetailPage,
    seriesCategorySections,
    visibleItems.length,
  ]);

  useEffect(() => {
    if (!isLoading && visibleItems.length > 0 && category && isSeriesGroupListPage) {
      const timer = window.setTimeout(() => {
        setFocus(getCategoryItemFocusKey(category.slug, 0));
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isLoading, visibleItems.length, category, isSeriesGroupListPage]);

  useEffect(() => {
    function goBackToHome() {
      const navigationState = location.state as
        | {
            fromSeriesDetail?: boolean;
            fromSeriesCategory?: boolean;
            fromMoviesCategory?: boolean;
            fromMovieDetail?: boolean;
            fromCatalogSeeAll?: boolean;
            returnTo?: string;
          }
        | null;

      const isSeriesNavigationPage = isSeriesDetailPage || isSeriesGroupListPage;
      const isMovieNavigationPage = isMovieDetailPage || isMovieGroupListPage;
      const shouldUseReturnTo =
        isSeriesNavigationPage ||
        isMovieNavigationPage ||
        navigationState?.fromMoviesCategory ||
        navigationState?.fromCatalogSeeAll;

      if (
        shouldUseReturnTo &&
        navigationState?.returnTo
      ) {
        navigate(navigationState.returnTo, { replace: true });
        return;
      }

      if (isMovieNavigationPage) {
        navigate('/category/filmes', { replace: true });
        return;
      }

      if (isSeriesNavigationPage && window.history.length > 1) {
        navigate(-1);
        return;
      }

      if (isSeriesGroupListPage) {
        navigate('/category/series');
        return;
      }

      navigate('/');
    }

    function handleBackNavigation(event: KeyboardEvent) {
      if (
        event.key !== 'Backspace' &&
        event.key !== 'Escape' &&
        event.key !== 'BrowserBack'
      ) {
        return;
      }

      event.preventDefault();
      goBackToHome();
    }

    window.addEventListener('keydown', handleBackNavigation);

    let isActive = true;
    let capacitorBackButtonListener: {
      remove: () => Promise<void>;
    } | null = null;

    void CapacitorApp.addListener(
      'backButton',
      () => {
        if (!isActive) {
          return;
        }

        goBackToHome();
      },
    ).then((listener) => {
      if (!isActive) {
        void listener.remove();
        return;
      }

      capacitorBackButtonListener = listener;
    });

    return () => {
      isActive = false;
      window.removeEventListener('keydown', handleBackNavigation);

      if (capacitorBackButtonListener) {
        void capacitorBackButtonListener.remove();
      }
    };
  }, [
    navigate,
    location,
    isSeriesDetailPage,
    isSeriesGroupListPage,
    isMovieDetailPage,
    isMovieGroupListPage,
  ]);

  function resolveEpisodeTitle(item: HomeVodItem, index: number) {
    return item.episodeTitle || item.title || `Episodio ${index + 1}`;
  }

  function getEpisodePlaybackIdentity(item: HomeVodItem, index: number) {
    const episodeTitle = resolveEpisodeTitle(item, index);

    return {
      episodeId: item.id,
      streamUrl: item.streamUrl,
      title: episodeTitle,
      seriesTitle,
      seriesGroupTitle,
      seriesTmdbId,
      seriesTmdbTitle,
      episodeIndex: index,
    };
  }

  function resolveEpisodePlaybackStatus(
    item: HomeVodItem,
    index: number,
  ): EpisodePlaybackStatus {
    return hasEpisodePlaybackProgress(getEpisodePlaybackIdentity(item, index))
      ? 'played'
      : 'not-started';
  }

  function resolveEpisodePlaybackProgressPercent(
    item: HomeVodItem,
    index: number,
  ) {
    return getEpisodePlaybackProgressPercent(
      getEpisodePlaybackIdentity(item, index),
    );
  }

  async function loadSimilarCollections(currentHeroItem: HomeVodItem | null) {
    if (!currentHeroItem) {
      setSimilarItems([]);
      return;
    }

    try {
      const activation = getStoredLicenseActivation();
      const deviceIdentifier = getOrCreateDeviceIdentifier();

      if (!activation?.licenseCode || !deviceIdentifier) {
        setSimilarItems([]);
        return;
      }

      const input = {
        licenseCode: activation.licenseCode,
        deviceIdentifier,
        sourceId: playlistSource?.sourceId,
      };

      const cachedSections = getCachedHomeVodSections(input) ?? [];
      const cachedSimilarItems = pickSimilarCollectionsFromSections(
        cachedSections,
        currentHeroItem,
      );

      if (cachedSimilarItems.length > 0) {
        setSimilarItems(cachedSimilarItems);
      }

      const loadedSections = await loadHomeVodSections(input);
      const loadedSimilarItems = pickSimilarCollectionsFromSections(
        loadedSections,
        currentHeroItem,
      );

      setSimilarItems(loadedSimilarItems);
    } catch (error) {
      console.warn('[XANDEFLIX_SERIES_SIMILAR_ERROR]', error);
      setSimilarItems([]);
    }
  }

  function openSimilarItem(item: HomeVodItem) {
    if (!item.groupTitle) {
      return;
    }

    const params = new URLSearchParams({
      groupTitle: item.groupTitle,
      title: item.tmdbTitle ?? item.title,
    });

    if (item.tmdbId) {
      params.set('tmdbId', item.tmdbId);
    }

    if (item.tmdbTitle) {
      params.set('tmdbTitle', item.tmdbTitle);
    }

    if (item.seriesKey) {
      params.set('seriesKey', item.seriesKey);
    }

    navigate(`/category/series-detail?${params.toString()}`, {
      state: {
        fromSeriesDetail: true,
        returnTo: `${location.pathname}${location.search}`,
        selectedSeriesItem: createSeriesNavigationItem(item),
      },
    });
  }

  function handleSimilarCardArrowPress(direction: string, index: number) {
    if (!category) {
      return false;
    }

    const similarColumns = 3;
    const isFirstColumn = index % similarColumns === 0;
    const isLastColumn = index % similarColumns === similarColumns - 1;
    const lastIndex = similarItems.length - 1;

    if (direction === 'left') {
      if (!isFirstColumn) {
        setFocus(getSimilarItemFocusKey(category.slug, index - 1));
        return false;
      }

      const previousRowLastIndex = index - 1;

      if (previousRowLastIndex >= 0) {
        setFocus(getSimilarItemFocusKey(category.slug, previousRowLastIndex));
        return false;
      }

      const safeEpisodeIndex = Math.min(
        Math.max(episodeFocusIndex, episodeWindowStart),
        Math.max(
          episodeWindowStart,
          episodeWindowStart + episodeWindowItems.length - 1,
        ),
      );

      setEpisodeFocusIndex(safeEpisodeIndex);
      setFocus(getCategoryItemFocusKey(category.slug, safeEpisodeIndex));
      return false;
    }

    if (direction === 'right') {
      if (!isLastColumn) {
        const nextIndex = Math.min(index + 1, lastIndex);

        if (nextIndex !== index) {
          setFocus(getSimilarItemFocusKey(category.slug, nextIndex));
        }

        return false;
      }

      const nextRowFirstIndex = index + 1;

      if (nextRowFirstIndex <= lastIndex) {
        setFocus(getSimilarItemFocusKey(category.slug, nextRowFirstIndex));
      }

      return false;
    }

    if (direction === 'up') {
      const previousRowIndex = index - similarColumns;

      if (previousRowIndex >= 0) {
        setFocus(getSimilarItemFocusKey(category.slug, previousRowIndex));
        return false;
      }

      setFocus(SERIES_DETAIL_HERO_FOCUS_KEY);
      return false;
    }

    if (direction === 'down') {
      const nextRowIndex = index + similarColumns;

      if (nextRowIndex <= lastIndex) {
        setFocus(getSimilarItemFocusKey(category.slug, nextRowIndex));
      }

      return false;
    }

    return false;
  }

  function openSeriesCollection(item: HomeVodItem) {
    const params = new URLSearchParams({
      groupTitle: item.groupTitle ?? category?.groupTitles[0] ?? '',
      title: item.tmdbTitle ?? item.title,
    });

    if (item.seriesKey) {
      params.set('seriesKey', item.seriesKey);
    }

    if (item.tmdbId) {
      params.set('tmdbId', item.tmdbId);
    }

    if (item.tmdbTitle) {
      params.set('tmdbTitle', item.tmdbTitle);
    }

    navigate(`/category/series-detail?${params.toString()}`, {
      state: {
        fromSeriesCategory: true,
        returnTo: `${location.pathname}${location.search}`,
        selectedSeriesItem: createSeriesNavigationItem(item),
      },
    });
  }

  function openSeriesGroupPage(section: SeriesCategorySection) {
    const params = new URLSearchParams({
      groupTitle: section.title,
    });

    navigate(`/category/series-group?${params.toString()}`, {
      state: {
        fromSeriesCategory: true,
        returnTo: `${location.pathname}${location.search}`,
      },
    });
  }

  function openMovieGroupPage(section: MoviesCategorySection) {
    const route = getExactCategoryRouteByGroupTitle(section.title, 'movie');

    if (!route) {
      return;
    }

    navigate(route, {
      state: {
        fromMoviesCategory: true,
        returnTo: `${location.pathname}${location.search}`,
      },
    });
  }

  function openMovieDetail(item: HomeVodItem) {
    const params = new URLSearchParams({
      title: item.tmdbTitle ?? item.title,
    });

    if (item.tmdbId) {
      params.set('tmdbId', item.tmdbId);
    }

    if (item.tmdbTitle) {
      params.set('tmdbTitle', item.tmdbTitle);
    }

    if (item.groupTitle) {
      params.set('groupTitle', item.groupTitle);
    }

    navigate(`/category/movie-detail?${params.toString()}`, {
      state: {
        fromMoviesCategory: true,
        returnTo: `${location.pathname}${location.search}`,
        selectedMovieItem: createMovieNavigationItem(item),
        movieSimilarSeedItems: (() => {
          const seedSourceItems = isMovieDetailPage
            ? [movieDetailItem, ...movieSimilarItems, ...items].filter(
                (candidate): candidate is HomeVodItem => Boolean(candidate),
              )
            : items;

          const selectedMovieKey = item.tmdbId || item.tmdbTitle || item.title || item.id;
          const seenMovieKeys = new Set<string>();
          const seedItems: HomeVodItem[] = [];

          for (const candidate of seedSourceItems) {
            const candidateKey =
              candidate.tmdbId || candidate.tmdbTitle || candidate.title || candidate.id;

            if (
              !candidateKey ||
              candidate.id === item.id ||
              candidateKey === selectedMovieKey ||
              seenMovieKeys.has(candidateKey)
            ) {
              continue;
            }

            seenMovieKeys.add(candidateKey);
            seedItems.push(createMovieNavigationItem(candidate));

            if (seedItems.length >= 24) {
              break;
            }
          }

          return seedItems;
        })(),
      },
    });
  }


  function openCategoryItem(item: HomeVodItem, index: number) {
    const shouldOpenSeriesDetail =
      category?.slug === 'series' ||
      category?.slug === 'series-group' ||
      item.isSeriesCollection ||
      Boolean(item.seriesKey);

    if (shouldOpenSeriesDetail) {
      openSeriesCollection(item);
      return;
    }

    if (category?.slug === 'filmes' || isMovieSeeAllPage) {
      openMovieDetail(item);
      return;
    }

    openEpisode(item, index);
  }

  function openEpisode(item: HomeVodItem, index: number) {
    spatialDebug('catalog-grid', 'Abrir episodio:', item.title);

    if (!item.streamUrl) {
      return;
    }

    const episodeTitle = resolveEpisodeTitle(item, index);
    const resumePositionMs = getEpisodeResumePositionMs({
      episodeId: item.id,
      streamUrl: item.streamUrl,
      title: episodeTitle,
      seriesTitle,
      seriesGroupTitle,
      seriesTmdbId,
      seriesTmdbTitle,
      episodeIndex: index,
    });

    const params = new URLSearchParams({
      src: item.streamUrl,
      title: episodeTitle,
      episodeId: item.id,
      episodeIndex: String(index),
      startPositionMs: String(resumePositionMs),
      direct: '1',
    });

    if (seriesTitle) {
      params.set('seriesTitle', seriesTitle);
    }

    if (seriesGroupTitle) {
      params.set('seriesGroupTitle', seriesGroupTitle);
    }

    if (seriesTmdbId) {
      params.set('seriesTmdbId', seriesTmdbId);
    }

    if (seriesTmdbTitle) {
      params.set('seriesTmdbTitle', seriesTmdbTitle);
    }

    navigate(`/player?${params.toString()}`);
  }

  // FASE 4: foco inicial do detalhe de filme
  useEffect(() => {
    if (!isMovieDetailPage || !movieDetailItem) {
      return;
    }

    const focusMovieHero = () => {
      scrollSeriesHeroIntoSafeView();
      setFocus(SERIES_DETAIL_HERO_FOCUS_KEY);
    };

    const firstFocusTimer = window.setTimeout(focusMovieHero, 120);
    const secondFocusTimer = window.setTimeout(focusMovieHero, 420);

    return () => {
      window.clearTimeout(firstFocusTimer);
      window.clearTimeout(secondFocusTimer);
    };
  }, [isMovieDetailPage, movieDetailItem?.id, location.key, setFocus]);

  function handleMovieDetailHeroArrowPress(
    direction: string,
    buttonPosition: 'hero' | 'play' | 'trailer' = 'hero',
  ) {
    if (direction === 'left') {
      if (buttonPosition === 'trailer') {
        setFocus('movie-detail-play');
        return false;
      }
      setFocus(FOCUS_KEYS.SIDEBAR_HOME);
      return false;
    }

    if (direction === 'right') {
      if (buttonPosition === 'hero') {
        setFocus('movie-detail-play');
        return false;
      }

      if (buttonPosition === 'play') {
        setFocus('movie-detail-trailer');
        return false;
      }
      return false;
    }

    if (direction === 'up' && buttonPosition === 'trailer') {
      setFocus('movie-detail-play');
      return false;
    }

    if (direction === 'down') {
      if (buttonPosition === 'play') {
        setFocus('movie-detail-trailer');
        return false;
      }

      if (movieSimilarItems.length > 0) {
        setFocus(getMovieSimilarItemFocusKey(movieDetailFocusSlug, 0));
        return false;
      }
    }

    return false;
  }

  function playMovieDetailItem() {
    if (!movieDetailItem) {
      return;
    }

    openEpisode(movieDetailItem, 0);
  }

  function handleSeriesHeroArrowPress(direction: string) {
    if (!category) {
      return false;
    }

    if (direction === 'down' && items.length > 0) {
      setEpisodeFocusIndex(0);

      if (isSeriesCategoryPage && seriesCategorySections[0]?.items.length) {
        setFocus(getCategoryItemFocusKey(seriesCategorySections[0].id, 0));
        return false;
      }

      setFocus(getCategoryItemFocusKey(category.slug, 0));
      return false;
    }

    if (direction === 'left') {
      setFocus(FOCUS_KEYS.SIDEBAR_HOME);
      return false;
    }

    return false;
  }

  function focusFirstSeriesCategoryRow() {
    const firstSection = seriesCategorySections[0];

    if (!firstSection?.items.length) {
      return false;
    }

    setFocus(getCategoryItemFocusKey(firstSection.id, 0));
    return false;
  }

  function focusFirstMoviesCategoryRow() {
    const firstSection = moviesCategorySections[0];

    if (!firstSection?.items.length) {
      return false;
    }

    setFocus(getCategoryItemFocusKey(firstSection.id, 0));
    return false;
  }

  function handleMoviesCategoryHeroButtonArrowPress(
    direction: string,
    buttonPosition: 'play' | 'info',
  ) {
    if (direction === 'down') {
      return focusFirstMoviesCategoryRow();
    }

    if (direction === 'left') {
      setFocus(
        buttonPosition === 'info'
          ? FOCUS_KEYS.HERO_PLAY_BUTTON
          : FOCUS_KEYS.SIDEBAR_HOME,
      );
      return false;
    }

    if (direction === 'right') {
      if (buttonPosition === 'play') {
        setFocus(FOCUS_KEYS.HERO_INFO_BUTTON);
      }

      return false;
    }

    return false;
  }

  function handleMoviesCategoryRowCardArrowPress(
    direction: string,
    sectionIndex: number,
    itemIndex: number,
  ) {
    const section = moviesCategorySections[sectionIndex];

    if (!section) {
      return false;
    }

    const visibleItemsCount = Math.min(
      MOVIES_CATEGORY_ROW_VISIBLE_LIMIT,
      section.items.length,
    );

    if (direction === 'left') {
      if (itemIndex === 0) {
        setFocus(FOCUS_KEYS.SIDEBAR_HOME);
        return false;
      }

      setFocus(getCategoryItemFocusKey(section.id, itemIndex - 1));
      return false;
    }

    if (direction === 'right') {
      const nextIndex = itemIndex + 1;

      if (nextIndex >= visibleItemsCount) {
        setFocus(`movies-row-btn-${section.id}`);
        return false;
      }

      setFocus(getCategoryItemFocusKey(section.id, nextIndex));
      return false;
    }

    if (direction === 'up') {
      if (sectionIndex === 0) {
        window.setTimeout(() => {
          scrollSeriesHeroIntoSafeView();
          setFocus(FOCUS_KEYS.HERO_PLAY_BUTTON);
        }, 0);
        return false;
      }

      const previousSection = moviesCategorySections[sectionIndex - 1];
      const previousVisibleCount = Math.min(
        MOVIES_CATEGORY_ROW_VISIBLE_LIMIT,
        previousSection.items.length,
      );
      const previousIndex = Math.min(
        itemIndex,
        Math.max(0, previousVisibleCount - 1),
      );

      setFocus(getCategoryItemFocusKey(previousSection.id, previousIndex));
      return false;
    }

    if (direction === 'down') {
      const nextSection = moviesCategorySections[sectionIndex + 1];

      if (!nextSection) {
        return false;
      }

      const nextVisibleCount = Math.min(
        MOVIES_CATEGORY_ROW_VISIBLE_LIMIT,
        nextSection.items.length,
      );
      const nextIndex = Math.min(
        itemIndex,
        Math.max(0, nextVisibleCount - 1),
      );

      setFocus(getCategoryItemFocusKey(nextSection.id, nextIndex));
      return false;
    }

    return false;
  }

  function handleMoviesRowButtonArrowPress(
    direction: string,
    sectionIndex: number,
  ) {
    const section = moviesCategorySections[sectionIndex];

    if (!section) {
      return false;
    }

    const visibleItemsCount = Math.min(
      MOVIES_CATEGORY_ROW_VISIBLE_LIMIT,
      section.items.length,
    );

    if (direction === 'left') {
      setFocus(getCategoryItemFocusKey(section.id, visibleItemsCount - 1));
      return false;
    }

    if (direction === 'up') {
      if (sectionIndex === 0) {
        window.setTimeout(() => {
          scrollSeriesHeroIntoSafeView();
          setFocus(FOCUS_KEYS.HERO_PLAY_BUTTON);
        }, 0);
        return false;
      }

      const previousSection = moviesCategorySections[sectionIndex - 1];
      const previousVisibleCount = Math.min(
        MOVIES_CATEGORY_ROW_VISIBLE_LIMIT,
        previousSection.items.length,
      );
      setFocus(
        getCategoryItemFocusKey(
          previousSection.id,
          previousVisibleCount - 1,
        ),
      );
      return false;
    }

    if (direction === 'down') {
      const nextSection = moviesCategorySections[sectionIndex + 1];

      if (!nextSection) {
        return false;
      }

      const nextVisibleCount = Math.min(
        MOVIES_CATEGORY_ROW_VISIBLE_LIMIT,
        nextSection.items.length,
      );
      setFocus(
        getCategoryItemFocusKey(nextSection.id, nextVisibleCount - 1),
      );
      return false;
    }

    return false;
  }

  function handleSeriesCategoryHeroButtonArrowPress(
    direction: string,
    buttonPosition: 'play' | 'info',
  ) {
    if (direction === 'down') {
      return focusFirstSeriesCategoryRow();
    }

    if (direction === 'left') {
      setFocus(
        buttonPosition === 'info'
          ? FOCUS_KEYS.HERO_PLAY_BUTTON
          : FOCUS_KEYS.SIDEBAR_HOME,
      );
      return false;
    }

    if (direction === 'right') {
      if (buttonPosition === 'play') {
        setFocus(FOCUS_KEYS.HERO_INFO_BUTTON);
      }

      return false;
    }

    return false;
  }

  function revealMoreItems(targetIndex: number) {
    if (!category || targetIndex >= items.length) {
      return false;
    }

    if (targetIndex >= visibleItemCount) {
      setVisibleItemCount((currentCount) =>
        Math.min(
          items.length,
          Math.max(targetIndex + 1, currentCount + VISIBLE_ITEMS_INCREMENT),
        ),
      );
    }

    window.setTimeout(() => {
      setFocus(getCategoryItemFocusKey(category.slug, targetIndex));
    }, 50);

    return false;
  }

  function handleSeriesCategoryRowCardArrowPress(
    direction: string,
    sectionIndex: number,
    itemIndex: number,
  ) {
    const section = seriesCategorySections[sectionIndex];

    if (!section) {
      return false;
    }

    const visibleItemsCount = Math.min(SERIES_CATEGORY_ROW_VISIBLE_LIMIT, section.items.length);

    if (direction === 'left') {
      if (itemIndex === 0) {
        setFocus(FOCUS_KEYS.SIDEBAR_HOME);
        return false;
      }

      setFocus(getCategoryItemFocusKey(section.id, itemIndex - 1));
      return false;
    }

    if (direction === 'right') {
      const nextIndex = itemIndex + 1;

      if (nextIndex >= visibleItemsCount) {
        setFocus(`series-row-btn-${section.id}`);
        return false;
      }

      setFocus(getCategoryItemFocusKey(section.id, nextIndex));
      return false;
    }

    if (direction === 'up') {
      if (sectionIndex === 0) {
        window.setTimeout(() => {
          scrollSeriesHeroIntoSafeView();
          setFocus(FOCUS_KEYS.HERO_PLAY_BUTTON);
        }, 0);
        return false;
      }

      const previousSection = seriesCategorySections[sectionIndex - 1];
      const previousVisibleCount = Math.min(SERIES_CATEGORY_ROW_VISIBLE_LIMIT, previousSection.items.length);
      const previousIndex = Math.min(
        itemIndex,
        Math.max(0, previousVisibleCount - 1),
      );

      setFocus(getCategoryItemFocusKey(previousSection.id, previousIndex));
      return false;
    }

    if (direction === 'down') {
      const nextSection = seriesCategorySections[sectionIndex + 1];

      if (!nextSection) {
        return false;
      }

      const nextVisibleCount = Math.min(SERIES_CATEGORY_ROW_VISIBLE_LIMIT, nextSection.items.length);
      const nextIndex = Math.min(
        itemIndex,
        Math.max(0, nextVisibleCount - 1),
      );

      setFocus(getCategoryItemFocusKey(nextSection.id, nextIndex));
      return false;
    }

    return false;
  }

  function handleSeriesRowButtonArrowPress(
    direction: string,
    sectionIndex: number,
  ) {
    const section = seriesCategorySections[sectionIndex];
    if (!section) {
      return false;
    }

    const visibleItemsCount = Math.min(SERIES_CATEGORY_ROW_VISIBLE_LIMIT, section.items.length);

    if (direction === 'left') {
      setFocus(getCategoryItemFocusKey(section.id, visibleItemsCount - 1));
      return false;
    }

    if (direction === 'up') {
      if (sectionIndex === 0) {
        window.setTimeout(() => {
          scrollSeriesHeroIntoSafeView();
          setFocus(FOCUS_KEYS.HERO_PLAY_BUTTON);
        }, 0);
        return false;
      }

      const previousSection = seriesCategorySections[sectionIndex - 1];
      const previousVisibleCount = Math.min(SERIES_CATEGORY_ROW_VISIBLE_LIMIT, previousSection.items.length);
      setFocus(getCategoryItemFocusKey(previousSection.id, previousVisibleCount - 1));
      return false;
    }

    if (direction === 'down') {
      const nextSection = seriesCategorySections[sectionIndex + 1];
      if (!nextSection) {
        return false;
      }

      const nextVisibleCount = Math.min(SERIES_CATEGORY_ROW_VISIBLE_LIMIT, nextSection.items.length);
      setFocus(getCategoryItemFocusKey(nextSection.id, nextVisibleCount - 1));
      return false;
    }

    return false;
  }

  function handleMovieSimilarCardArrowPress(direction: string, index: number) {
    if (!category) {
      return false;
    }

    const lastIndex = movieSimilarItems.length - 1;

    if (direction === 'left') {
      if (index === 0) {
        setFocus(FOCUS_KEYS.SIDEBAR_HOME);
        return false;
      }

      setFocus(getMovieSimilarItemFocusKey(movieDetailFocusSlug, index - 1));
      return false;
    }

    if (direction === 'right') {
      if (index >= lastIndex) {
        return false;
      }

      setFocus(getMovieSimilarItemFocusKey(movieDetailFocusSlug, index + 1));
      return false;
    }

    if (direction === 'up') {
      setFocus(SERIES_DETAIL_HERO_FOCUS_KEY);
      return false;
    }

    if (direction === 'down') {
      return false;
    }

    return false;
  }


  function handleCategoryCardArrowPress(direction: string, index: number) {
    if (!category) {
      return false;
    }

    if (
      isMovieSeeAllPage &&
      hasMoreCategoryItems &&
      index >= Math.max(0, items.length - GRID_COLUMNS * 2)
    ) {
      void loadNextMovieCategoryPage();
    }

    if (isSeriesDetailPage) {
      if (direction === 'left') {
        setFocus(FOCUS_KEYS.SIDEBAR_HOME);
        return false;
      }

      if (direction === 'up') {
        if (index === 0) {
          setEpisodeFocusIndex(0);
          setFocus(SERIES_DETAIL_HERO_FOCUS_KEY);
          return false;
        }

        const previousIndex = index - 1;
        setEpisodeFocusIndex(previousIndex);
        setFocus(getCategoryItemFocusKey(category.slug, previousIndex));
        return false;
      }

      if (direction === 'right' && similarItems.length > 0) {
        setFocus(getSimilarItemFocusKey(category.slug, 0));
        return false;
      }

      if (direction === 'down') {
        const nextIndex = index + 1;

        if (nextIndex >= seriesDetailItems.length) {
          return false;
        }

        setEpisodeFocusIndex(nextIndex);
        setFocus(getCategoryItemFocusKey(category.slug, nextIndex));
        return false;
      }

      return false;
    }

    const isFirstColumn = index % GRID_COLUMNS === 0;
    const isLastColumn = index % GRID_COLUMNS === GRID_COLUMNS - 1;
    const previousRowIndex = index - GRID_COLUMNS;
    const nextRowIndex = index + GRID_COLUMNS;

    if (direction === 'left') {
      if (isFirstColumn) {
        setFocus(FOCUS_KEYS.SIDEBAR_HOME);
        return false;
      }

      setFocus(getCategoryItemFocusKey(category.slug, index - 1));
      return false;
    }

    if (direction === 'right') {
      const nextIndex = index + 1;

      if (
        !isLastColumn &&
        nextIndex >= items.length &&
        isMovieSeeAllPage &&
        hasMoreCategoryItems
      ) {
        void loadNextMovieCategoryPage().then((pageLoaded) => {
          if (pageLoaded && nextIndex < categoryLoadedItemIdsRef.current.size) {
            setFocus(getCategoryItemFocusKey(category.slug, nextIndex));
          }
        });
        return false;
      }

      if (isLastColumn || nextIndex >= items.length) {
        return false;
      }

      return revealMoreItems(nextIndex);
    }

    if (direction === 'up') {
      if (previousRowIndex < 0) {
        return false;
      }

      setFocus(getCategoryItemFocusKey(category.slug, previousRowIndex));
      return false;
    }

    if (direction === 'down') {
      if (nextRowIndex >= items.length) {
        if (isMovieSeeAllPage && hasMoreCategoryItems) {
          void loadNextMovieCategoryPage().then((pageLoaded) => {
            if (
              pageLoaded &&
              nextRowIndex < categoryLoadedItemIdsRef.current.size
            ) {
              setFocus(
                getCategoryItemFocusKey(category.slug, nextRowIndex),
              );
            }
          });
          return false;
        }

        // Se a próxima linha existe, mas está incompleta e não tem esta coluna,
        // vamos focar no último elemento disponível dessa próxima linha!
        const totalRows = Math.ceil(items.length / GRID_COLUMNS);
        const currentRow = Math.floor(index / GRID_COLUMNS);
        const nextRow = currentRow + 1;

        if (nextRow < totalRows) {
          const lastIndex = items.length - 1;
          return revealMoreItems(lastIndex);
        }
        return false;
      }

      return revealMoreItems(nextRowIndex);
    }

    return false;
  }

  function retryCategoryLoad() {
    setCategoryRetryKey((currentKey) => currentKey + 1);
  }

  return (
    <AppShell
      onSignOut={() => {
        void signOut()
          .catch(() => undefined)
          .finally(() => {
            navigate('/login', { replace: true });
          });
      }}
      mainClassName="xf-tv-safe-main px-3 pb-24 md:px-7 md:pb-9 lg:px-8 xl:px-10"
    >
      <main className="mx-auto w-full max-w-[1920px]">
        {isMovieDetailPage && effectiveMovieDetailItem ? (
          <SeriesDetailHeroFrame
            disabled={!effectiveMovieDetailItem.streamUrl}
            onEnterPress={playMovieDetailItem}
            onArrowPress={handleMovieDetailHeroArrowPress}
          >
            <div className="relative -mx-4 -mt-4 overflow-hidden bg-black md:absolute md:inset-0 md:m-0 md:rounded-[0.9rem]">
              <div className="relative aspect-video w-full bg-zinc-950 md:absolute md:inset-0 md:h-full md:aspect-auto">
                {movieDetailBackdropUrl ? (
                  <img
                    src={movieDetailBackdropUrl}
                    alt={
                      effectiveMovieDetailItem.tmdbTitle ??
                      effectiveMovieDetailItem.title
                    }
                    className="h-full w-full object-cover opacity-95 md:opacity-80"
                    loading="eager"
                  />
                ) : movieDetailPosterUrl ? (
                  <img
                    src={movieDetailPosterUrl}
                    alt={
                      effectiveMovieDetailItem.tmdbTitle ??
                      effectiveMovieDetailItem.title
                    }
                    className="h-full w-full object-contain opacity-95 md:opacity-85"
                    loading="eager"
                  />
                ) : (
                  <div className="h-full w-full bg-zinc-950" />
                )}

                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black via-black/55 to-transparent md:h-32 md:via-black/70" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/65 to-transparent md:h-full md:bg-gradient-to-r md:from-black md:via-black/72 md:to-transparent" />

                <button
                  type="button"
                  aria-label="Voltar"
                  className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-3xl font-light leading-none text-white backdrop-blur-sm md:left-5 md:top-5"
                  onClick={() => navigate(-1)}
                >
                  ←
                </button>

              </div>
            </div>

            <div className="relative z-10 px-1 pb-1 pt-4 text-left md:flex md:min-h-[25.5rem] md:max-w-[52rem] md:flex-col md:justify-end md:px-2 md:pb-3 md:pt-20 xl:min-h-[28.5rem]">
              <h1 className="text-[1.58rem] font-black leading-[1.02] tracking-[-0.04em] text-white md:max-w-[46rem] md:text-[clamp(1.9rem,3.2vw,3.25rem)] md:leading-[0.96]">
                {effectiveMovieDetailItem.tmdbTitle ??
                  effectiveMovieDetailItem.title}
              </h1>

              {movieDetailMetadataItems.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.86rem] font-bold text-zinc-300 md:mt-2 md:text-[0.72rem]">
                  {movieDetailMetadataItems.map((metadataItem, metadataIndex) => (
                    <span
                      key={metadataItem}
                      className={
                        metadataIndex === 1
                          ? 'rounded-[0.18rem] bg-yellow-700/85 px-1.5 py-0.5 text-black'
                          : undefined
                      }
                    >
                      {metadataItem}
                    </span>
                  ))}
                </div>
              ) : null}


              <p className="mt-4 text-[0.86rem] font-normal leading-snug text-zinc-200 md:mt-3 md:max-w-3xl md:text-[clamp(0.66rem,0.86vw,0.78rem)] md:leading-relaxed">
                {getMovieHeroOverview(effectiveMovieDetailItem) ??
                  effectiveMovieDetailItem.overview ??
                  'Detalhes indisponiveis para este filme.'}
              </p>

              <div className="mt-3 grid gap-2 md:flex md:w-fit md:gap-2">
                <FocusableButton
                  focusKey={'movie-detail-play'}
                  disabled={!effectiveMovieDetailItem.streamUrl}
                  className="flex min-h-[2.65rem] w-full items-center justify-center gap-2 rounded-[0.28rem] border border-white bg-white px-3.5 py-2.5 text-[0.86rem] font-black text-black transition data-[focused=true]:scale-[1.02] md:min-h-[calc(var(--xf-action-height)*0.5)] md:w-auto md:px-[calc(var(--xf-action-inline-padding)*0.42)] md:text-[clamp(0.52rem,0.68vw,0.64rem)]"
                  onClick={playMovieDetailItem}
                  onEnterPress={playMovieDetailItem}
                  onArrowPress={(direction) =>
                    handleMovieDetailHeroArrowPress(direction, 'play')
                  }
                >
                  <span className="text-base leading-none md:text-sm">▶</span>
                  Assistir agora
                </FocusableButton>

                <FocusableButton
                  focusKey={'movie-detail-trailer'}
                  className="flex min-h-[2.65rem] w-full items-center justify-center gap-2 rounded-[0.28rem] border border-white/10 bg-white/15 px-3.5 py-2.5 text-[0.86rem] font-black text-white transition data-[focused=true]:border-white data-[focused=true]:bg-white data-[focused=true]:text-black md:min-h-[calc(var(--xf-action-height)*0.5)] md:w-auto md:px-[calc(var(--xf-action-inline-padding)*0.42)] md:text-[clamp(0.52rem,0.68vw,0.64rem)]"
                  onClick={() => undefined}
                  onEnterPress={() => undefined}
                  onArrowPress={(direction) =>
                    handleMovieDetailHeroArrowPress(direction, 'trailer')
                  }
                >
                  Trailer
                </FocusableButton>
              </div>

            </div>
          </SeriesDetailHeroFrame>
        ) : isSeriesDetailPage && effectiveSeriesDetailHero ? (
          <SeriesDetailHeroFrame
            disabled={seriesDetailItems.length === 0}
            onEnterPress={() => {
              if (seriesDetailItems[0]) {
                openEpisode(seriesDetailItems[0], 0);
              }
            }}
            onArrowPress={handleSeriesHeroArrowPress}
          >
            <div
              className="absolute inset-0 bg-cover bg-center opacity-35 blur-[1px]"
              style={{
                backgroundImage:
                  effectiveSeriesDetailHero.backdropUrl ||
                  effectiveSeriesDetailHero.posterUrl
                  ? `linear-gradient(90deg, rgba(0,0,0,0.92), rgba(0,0,0,0.62), rgba(0,0,0,0.88)), url(${effectiveSeriesDetailHero.backdropUrl ?? effectiveSeriesDetailHero.posterUrl})`
                  : undefined,
              }}
            />
            <div className="relative grid gap-4 md:grid-cols-[9.5rem_1fr] md:items-center">
              <div className="overflow-hidden rounded-[0.65rem] border border-white/10 bg-white/5 shadow-xl">
                {effectiveSeriesDetailHero.posterUrl ? (
                  <img
                    src={effectiveSeriesDetailHero.posterUrl}
                    alt={category?.title ?? effectiveSeriesDetailHero.title}
                    className="aspect-[2/3] h-full w-full object-cover"
                    loading="eager"
                  />
                ) : (
                  <div className="aspect-[2/3] bg-zinc-900" />
                )}
              </div>

              <div className="max-w-4xl pb-1">
                <p className="text-[0.58rem] font-black uppercase tracking-[0.28em] text-xf-red">
                  Serie / Novela
                </p>
                <h1 className="mt-1 text-[1.25rem] font-black tracking-[-0.04em] text-white md:text-[1.65rem]">
                  {category?.title ?? effectiveSeriesDetailHero.title}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.58rem] font-bold text-zinc-200">
                  {effectiveSeriesDetailHero.tmdbReleaseYear ? (
                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1">
                      {effectiveSeriesDetailHero.tmdbReleaseYear}
                    </span>
                  ) : null}

                  {effectiveSeriesDetailHero.tmdbRating ? (
                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1">
                      Nota {formatHeroRating(effectiveSeriesDetailHero.tmdbRating)}
                    </span>
                  ) : null}

                  {effectiveSeriesDetailHero.tmdbGenres ? (
                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1">
                      {effectiveSeriesDetailHero.tmdbGenres}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 max-w-3xl line-clamp-3 text-[0.78rem] font-semibold leading-relaxed text-zinc-200 md:text-sm">
                  {effectiveSeriesDetailHero.overview ??
                    category?.description ??
                    'Episodios disponiveis para esta serie/novela.'}
                </p>

                <div className="mt-3 rounded-[0.6rem] border border-white/10 bg-black/25 px-3 py-2">
                  <p className="text-[0.58rem] font-black uppercase tracking-[0.22em] text-xf-red">
                    Elenco
                  </p>
                  <p className="mt-1 line-clamp-1 text-[0.72rem] font-semibold text-zinc-200">
                    Informacao de elenco indisponivel nesta fonte.
                  </p>
                </div>
              </div>
            </div>
          </SeriesDetailHeroFrame>
        ) : (
          <>
            {isSeriesCategoryPage && (activeSeriesHeroItem || isLoading) ? (
              <SeriesCategoryHero
                item={activeSeriesHeroItem}
                isLoading={isLoading}
                totalItems={seriesCollectionCount}
                heroIndex={activeSeriesHeroIndex}
                heroTotal={seriesHeroPresentationItems.length}
                onOpenItem={openSeriesCollection}
                onButtonArrowPress={handleSeriesCategoryHeroButtonArrowPress}
              />
            ) : isMoviesCategoryPage && (activeMovieHeroItem || isLoading) ? (
              <MovieCategoryHero
                item={activeMovieHeroItem}
                isLoading={isLoading}
                totalItems={items.length}
                heroTotal={movieHeroPresentationItems.length}
                onPlayItem={openEpisode}
                onInfoItem={(item) => openMovieDetail(item)}
                onButtonArrowPress={handleMoviesCategoryHeroButtonArrowPress}
              />
            ) : (
              <header className="mb-6">
                <p className="text-[0.58rem] font-black uppercase tracking-[0.32em] text-xf-red">
                  {category?.slug === 'series-group' ? 'Séries / Novelas' : 'Catalogo'}
                </p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h1 className="text-[1.7rem] font-black tracking-[-0.03em] text-white md:text-[2.35rem]">
                    {category?.title ?? 'Categoria'}
                  </h1>
                  {isMovieSeeAllPage ? (
                    <span
                      className="text-sm font-black text-zinc-300 md:text-base"
                      data-xf-category-total={categoryTotalCount}
                    >
                      {categoryTotalCount.toLocaleString('pt-BR')} filmes
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 max-w-3xl text-sm font-semibold text-zinc-300">
                  {isMovieSeeAllPage
                    ? (
                        <span
                          data-xf-category-loaded={items.length}
                          data-xf-category-progress="true"
                        >
                          Exibindo {items.length.toLocaleString('pt-BR')} de{' '}
                          {categoryTotalCount.toLocaleString('pt-BR')}
                        </span>
                      )
                    : category?.slug === 'series-group'
                    ? `Ver todos · ${items.length} títulos agrupados`
                    : category?.description ?? 'Categoria indisponivel neste momento.'}
                </p>
              </header>
            )}
          </>
        )}

        {isMovieDetailPage ? (
          <section className="space-y-4 pb-12">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-lg font-black tracking-[-0.03em] text-white">
                Títulos semelhantes
              </h2>
            </div>

            {movieSimilarItems.length > 0 ? (
              <div className="xf-carousel-row flex gap-[0.35rem] overflow-x-auto overflow-y-visible pb-5 pr-10 scroll-auto">
                {movieSimilarItems.map((item, index) => (
                  <MediaCard
                    key={`${movieDetailFocusSlug}-${item.id}`}
                    title={item.title}
                    subtitle={item.subtitle}
                    posterUrl={item.posterUrl}
                    artworkCandidates={item.artworkCandidates}
                    kind={item.kind}
                    eagerLoad={index < 10}
                    index={index}
                    focusKey={getMovieSimilarItemFocusKey(movieDetailFocusSlug, index)}
                    onEnterPress={() => {
                      setFocus(SERIES_DETAIL_HERO_FOCUS_KEY);
                      openMovieDetail(item);
                    }}
                    onArrowPress={(direction: string) =>
                      handleMovieSimilarCardArrowPress(direction, index)
                    }
                    focusScrollOptions={{
                      behavior: 'auto',
                      block: 'center',
                      inline: 'nearest',
                    }}
                    hideTextOverlay
                    sizeScale="large"
                  />
                ))}
              </div>
            ) : (
              <section className="rounded-[0.65rem] border border-white/10 bg-white/[0.035] px-4 py-5">
                <p className="text-sm font-semibold text-zinc-400">
                  Sem sugestões semelhantes nesta fonte.
                </p>
              </section>
            )}
          </section>
        ) : isSeriesDetailPreparing ? (
          <section className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-zinc-300">
              Preparando episódios...
            </p>
          </section>
        ) : errorMessage && visibleItems.length === 0 ? (
          <section
            data-xf-category-state="error"
            className="rounded-[0.18rem] border border-red-500/30 bg-red-500/10 px-6 py-10 text-center"
          >
            <p className="text-sm font-semibold text-red-100">{errorMessage}</p>
            <FocusableButton
              focusKey="category-retry"
              onClick={retryCategoryLoad}
              onEnterPress={retryCategoryLoad}
              className="mt-5 rounded-[0.18rem] bg-xf-red px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white"
            >
              Tentar novamente
            </FocusableButton>
          </section>
        ) : isLoading && visibleItems.length === 0 ? (
          <section
            data-xf-category-state="loading"
            className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-10 text-center"
          >
            <p className="text-sm font-semibold text-zinc-300">
              Carregando categoria...
            </p>
          </section>
        ) : visibleItems.length === 0 ? (
          <section
            data-xf-category-state="empty"
            className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-10 text-center"
          >
            <p className="text-sm font-semibold text-zinc-300">
              Nenhum conteudo encontrado nesta categoria.
            </p>
          </section>
        ) : (
          isSeriesDetailPage ? (
            <section className="flex w-full flex-nowrap items-start gap-4 pb-12">
              <div className="min-w-0">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <h2 className="text-lg font-black tracking-[-0.03em] text-white">
                    Episodios
                    <span className="ml-2 text-sm font-bold text-zinc-400">
                      {seriesDetailItems.length}
                    </span>
                  </h2>

                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                    {seriesDetailItems.length > 0
                      ? `${episodeWindowStart + 1}-${Math.min(
                          episodeWindowStart + EPISODE_WINDOW_SIZE,
                          seriesDetailItems.length,
                        )} de ${seriesDetailItems.length}`
                      : '0 de 0'}
                  </p>
                </div>

                <div className="h-[58vh] overflow-hidden rounded-[0.75rem] border border-white/5 bg-black/10 p-2">
                  <div className="space-y-2">
                    {episodeWindowItems.map((item, windowIndex) => {
                      const absoluteIndex = episodeWindowStart + windowIndex;
                      const seasonNumber = getSeriesDetailSeasonNumber(item);
                      const previousSeasonNumber = getSeriesDetailSeasonNumber(
                        seriesDetailItems[absoluteIndex - 1],
                      );
                      const showSeasonHeading =
                        windowIndex === 0 ||
                        seasonNumber !== previousSeasonNumber;

                      return (
                        <div key={item.id}>
                          {showSeasonHeading ? (
                            <p className="mb-2 mt-3 px-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-400 first:mt-0">
                              {seasonNumber === null
                                ? 'Outros episódios'
                                : `Temporada ${seasonNumber}`}
                            </p>
                          ) : null}
                          <EpisodeListRow
                            index={absoluteIndex}
                            title={resolveEpisodeTitle(item, absoluteIndex)}
                            playbackStatus={resolveEpisodePlaybackStatus(
                              item,
                              absoluteIndex,
                            )}
                            progressPercent={resolveEpisodePlaybackProgressPercent(
                              item,
                              absoluteIndex,
                            )}
                            focusKey={getCategoryItemFocusKey(
                              category?.slug ?? 'category',
                              absoluteIndex,
                            )}
                            onEnterPress={() => openCategoryItem(item, absoluteIndex)}
                            onArrowPress={(direction: string) =>
                              handleCategoryCardArrowPress(
                                direction,
                                absoluteIndex,
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <aside className="w-[24rem] shrink-0 self-start">
                <h2 className="mb-4 text-lg font-black tracking-[-0.03em] text-white">
                  Semelhantes
                </h2>

                {similarItems.length > 0 ? (
                  <div className="grid w-full grid-cols-3 gap-2">
                    {similarItems.map((item, index) => (
                      <SimilarSeriesCard
                        key={item.id}
                        item={item}
                        focusKey={getSimilarItemFocusKey(
                          category?.slug ?? 'series-detail',
                          index,
                        )}
                        onEnterPress={() => openSimilarItem(item)}
                        onArrowPress={(direction: string) =>
                          handleSimilarCardArrowPress(direction, index)
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[0.65rem] border border-white/10 bg-white/[0.035] px-4 py-5">
                    <p className="text-sm font-semibold text-zinc-400">
                      Sem sugestoes semelhantes nesta fonte.
                    </p>
                  </div>
                )}
              </aside>
            </section>
          ) : isSeriesCategoryPage ? (
            <section className="space-y-7 pb-12">
              {visibleSeriesCategorySections.map((section, sectionIndex) => (
                <section key={section.id} className="min-w-0">
                  <div className="mb-0 flex items-end justify-between gap-2">
                    <div>
                      <h2 className="text-[0.72rem] font-black uppercase tracking-[0.055em] text-white/90 md:text-[0.78rem] lg:text-[0.82rem]">
                        {section.title}
                      </h2>
                    </div>

                    <FocusableButton
                      focusKey={`series-row-btn-${section.id}`}
                      className={CATEGORY_ROW_SEE_ALL_CLASS_NAME}
                      style={CATEGORY_ROW_SEE_ALL_STYLE}
                      onClick={() => openSeriesGroupPage(section)}
                      onEnterPress={() => openSeriesGroupPage(section)}
                      onArrowPress={(direction) =>
                        handleSeriesRowButtonArrowPress(direction, sectionIndex)
                      }
                    >
                      Ver todos
                    </FocusableButton>
                  </div>

                  <div className="xf-carousel-row flex gap-[0.2rem] overflow-x-auto overflow-y-visible pb-5 pr-10 scroll-auto md:gap-[0.25rem] lg:gap-[0.25rem]">
                    {section.items
                      .slice(
                        0,
                        fullyPaintedCategoryKey === 'series'
                          ? SERIES_CATEGORY_ROW_VISIBLE_LIMIT
                          : Math.min(6, SERIES_CATEGORY_ROW_VISIBLE_LIMIT),
                      )
                      .map((item, itemIndex) => (
                      <MediaCard
                        key={item.id}
                        title={item.title}
                        subtitle={
                          item.episodeCount
                            ? `${item.episodeCount} episódio(s)`
                            : item.subtitle
                        }
                        posterUrl={item.posterUrl}
                        artworkCandidates={item.artworkCandidates}
                        kind={item.kind}
                        eagerLoad={sectionIndex === 0 && itemIndex < 8}
                        performanceSurface={
                          sectionIndex === 0 && itemIndex === 0
                            ? 'series'
                            : undefined
                        }
                        index={itemIndex}
                        focusKey={getCategoryItemFocusKey(section.id, itemIndex)}
                        onEnterPress={() => openSeriesCollection(item)}
                        onArrowPress={(direction: string) =>
                          handleSeriesCategoryRowCardArrowPress(
                            direction,
                            sectionIndex,
                            itemIndex,
                          )
                        }
                        focusScrollOptions={{
                          behavior: 'auto',
                          block: 'center',
                          inline: 'nearest',
                        }}
                        hideTextOverlay
                        sizeScale="large"
                      />
                      ))}
                  </div>
                </section>
              ))}
            </section>
          ) : isMoviesCategoryPage ? (
            <section className="space-y-7 pb-12">
              {visibleMoviesCategorySections.map((section, sectionIndex) => (
                <section key={section.id} className="min-w-0">
                  <div className="mb-0 flex items-end justify-between gap-2">
                    <div>
                      <h2 className="text-[0.72rem] font-black uppercase tracking-[0.055em] text-white/90 md:text-[0.78rem] lg:text-[0.82rem]">
                        {section.title}
                      </h2>
                    </div>

                    <FocusableButton
                      focusKey={`movies-row-btn-${section.id}`}
                      className={CATEGORY_ROW_SEE_ALL_CLASS_NAME}
                      style={CATEGORY_ROW_SEE_ALL_STYLE}
                      onClick={() => openMovieGroupPage(section)}
                      onEnterPress={() => openMovieGroupPage(section)}
                      onArrowPress={(direction) =>
                        handleMoviesRowButtonArrowPress(direction, sectionIndex)
                      }
                    >
                      Ver todos
                    </FocusableButton>
                  </div>

                  <div className="xf-carousel-row flex gap-[0.2rem] overflow-x-auto overflow-y-visible pb-5 pr-10 scroll-auto md:gap-[0.25rem] lg:gap-[0.25rem]">
                    {section.items
                      .slice(
                        0,
                        fullyPaintedCategoryKey === 'movies'
                          ? MOVIES_CATEGORY_ROW_VISIBLE_LIMIT
                          : Math.min(6, MOVIES_CATEGORY_ROW_VISIBLE_LIMIT),
                      )
                      .map((item, itemIndex) => (
                      <MediaCard
                        key={item.id}
                        title={item.title}
                        subtitle={item.subtitle}
                        posterUrl={item.posterUrl}
                        artworkCandidates={item.artworkCandidates}
                        kind={item.kind}
                        eagerLoad={sectionIndex === 0 && itemIndex < 8}
                        performanceSurface={
                          sectionIndex === 0 && itemIndex === 0
                            ? 'movies'
                            : undefined
                        }
                        index={itemIndex}
                        focusKey={getCategoryItemFocusKey(section.id, itemIndex)}
                        onEnterPress={() => openCategoryItem(item, itemIndex)}
                        onArrowPress={(direction: string) =>
                          handleMoviesCategoryRowCardArrowPress(
                            direction,
                            sectionIndex,
                            itemIndex,
                          )
                        }
                        focusScrollOptions={{
                          behavior: 'auto',
                          block: 'center',
                          inline: 'nearest',
                        }}
                        hideTextOverlay
                        sizeScale="large"
                      />
                      ))}
                  </div>
                </section>
              ))}
            </section>

          ) : (
            <section className="grid grid-cols-5 gap-[0.25rem] pb-12">
              {visibleItems.map((item, index) => (
                <MediaCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  posterUrl={item.posterUrl}
                  artworkCandidates={item.artworkCandidates}
                  kind={item.kind}
                  eagerLoad={index < 12}
                  index={index}
                  focusKey={getCategoryItemFocusKey(
                    category?.slug ?? 'category',
                    index,
                  )}
                  onEnterPress={() => openCategoryItem(item, index)}
                  onArrowPress={(direction: string) =>
                    handleCategoryCardArrowPress(direction, index)
                  }
                  focusScrollOptions={{
                    behavior: 'auto',
                    block: 'center',
                    inline: 'nearest',
                  }}
                />
              ))}
              {isMovieSeeAllPage ? (
                <div
                  ref={categorySentinelRef}
                  className="col-span-5 h-px w-full"
                  aria-hidden="true"
                  data-xf-category-has-more={hasMoreCategoryItems}
                  data-xf-category-loading-next={isLoadingNextPage}
                />
              ) : null}
              {isMovieSeeAllPage && isLoadingNextPage ? (
                <p className="col-span-5 py-3 text-center text-xs font-bold text-zinc-500">
                  Carregando mais titulos...
                </p>
              ) : null}
            </section>
          )
        )}
      </main>
    </AppShell>
  );
}
