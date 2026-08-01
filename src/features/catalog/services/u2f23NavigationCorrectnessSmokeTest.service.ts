import type { CatalogRepository } from '@/features/localCatalog/repositories/catalogRepository.types';
import type {
  LocalCatalogContentKind,
  LocalCatalogImportMetadata,
  LocalCatalogItem,
} from '@/features/localCatalog/types/localCatalog.types';
import { resolveLocalCatalogArtwork } from '@/features/localCatalog/services/localCatalogArtwork.service';
import {
  normalizeLocalCatalogGroupIdentity,
} from '@/features/localCatalog/services/localCatalogGroupIdentity.service';
import {
  getExactCategoryRouteByGroupTitle,
  getHomeSectionSeeAllRoute,
} from './catalogCategoryGroups.service';
import {
  clearHomeVodCache,
  loadHomeVodSections,
  type HomeVodItem,
} from './homeVod.service';
import { parseEpisodeNaturalOrder, sortEpisodesNaturally } from './episodeNaturalOrder.service';
import {
  loadLocalCatalogHomeVodSections,
} from '@/features/localCatalog/readModels/localCatalogHomeVodAdapter.service';
import {
  LOCAL_MOVIE_CATEGORY_PAGE_SIZE,
  loadLocalMovieCategoryPage,
  mergeLocalMovieCategoryPageItems,
} from '@/features/localCatalog/readModels/localCatalogCategoryReadModel.service';

export type U2F23NavigationCorrectnessSmokeTestResult = {
  ok: boolean;
  homeHotReturnNoDbRebuild: boolean;
  moviesHotReturnNoDbRebuild: boolean;
  seriesHotReturnNoDbRebuild: boolean;
  normalizedGroupDedupe: boolean;
  homeAllConfiguredSeriesProgressive: boolean;
  noFullCatalogScan: boolean;
  seeAllExactCategory: boolean;
  homeMovieSeeAllExactGroup: boolean;
  homeSeriesSeeAllExactGroup: boolean;
  moviesKnownGroupSeeAll: boolean;
  moviesProviderGroupSeeAll: boolean;
  seriesGroupSeeAll: boolean;
  seeAllGroupTitleUrlEncoding: boolean;
  movieArbitrarySlugFallbackAbsent: boolean;
  unknownHomeRowSeeAllAbsent: boolean;
  movieHeroTvgFallback: boolean;
  episodeNaturalOrder: boolean;
  artworkHttpOriginalFirst: boolean;
  artworkHttpsFallbackSecond: boolean;
  artworkMetadataAfterTvgFallbacks: boolean;
  pagination47: boolean;
  paginationOver800: boolean;
  duplicateAppendProtected: boolean;
  totalCounter: boolean;
};

const SOURCE_ID = 'u2f23-source';
const LICENSE_CODE = 'U2F23-LICENSE';
const DEVICE_ID = 'u2f23-device';
const NOW = '2026-07-24T12:00:00.000Z';

function metadata(): LocalCatalogImportMetadata {
  return {
    sourceId: SOURCE_ID,
    sourceType: 'm3u',
    status: 'ready',
    startedAt: NOW,
    completedAt: NOW,
    lastSuccessfulImportAt: NOW,
    parsedCount: 120,
    importedCount: 120,
    updatedCount: 0,
    removedCount: 0,
    unknownCount: 0,
    withoutGroupCount: 0,
    classificationVersion: 1,
    errorCode: null,
  };
}

function item(
  contentKind: LocalCatalogContentKind,
  groupTitle: string,
  index: number,
): LocalCatalogItem {
  return {
    id: `${SOURCE_ID}-${contentKind}-${normalizeLocalCatalogGroupIdentity(groupTitle)}-${index}`,
    sourceId: SOURCE_ID,
    sourceType: 'm3u',
    name: `${groupTitle} ${index}`,
    rawName: `${groupTitle} ${index}`,
    normalizedName: `${groupTitle} ${index}`.toLowerCase(),
    groupTitle,
    normalizedGroup: normalizeLocalCatalogGroupIdentity(groupTitle),
    contentKind,
    streamUrl: 'https://stream.example.invalid/item.m3u8',
    tvgLogo: 'https://images.example.invalid/poster.jpg',
    classificationVersion: 1,
    importSessionId: 'u2f23-smoke',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createRepository() {
  let itemCalls = 0;
  let fullScanCalls = 0;
  const normalizedGroups = new Set<string>();

  const repository: CatalogRepository = {
    kind: 'local-indexeddb',
    getStats: async () => ({
      playlistItemsCount: 120,
      catalogMetadataCount: 1,
      tmdbMetadataCount: 0,
      byContentKind: {
        live: 0,
        movie: 20,
        series: 100,
        series_episode: 0,
        radio: 0,
        unknown: 0,
      },
    }),
    getImportMetadata: async () => metadata(),
    getTmdbMetadataBySourceItemIds: async () => new Map(),
    listCategories: async () => [],
    listItems: async (input) => {
      itemCalls += 1;

      if (!input.sourceId || !input.contentKind || !input.normalizedGroup) {
        fullScanCalls += 1;
        return [];
      }

      normalizedGroups.add(input.normalizedGroup);

      return [
        item(input.contentKind, input.normalizedGroup, itemCalls),
      ];
    },
  };

  return {
    repository,
    getItemCalls: () => itemCalls,
    getFullScanCalls: () => fullScanCalls,
    getNormalizedGroups: () => Array.from(normalizedGroups),
  };
}

function createPaginationRepository(total: number) {
  const groupTitle = 'Filmes | Lancamentos';
  const normalizedGroup = normalizeLocalCatalogGroupIdentity(groupTitle);
  const items = Array.from({ length: total }, (_, index) => ({
    ...item('movie', groupTitle, index),
    streamUrl: `https://stream.example.invalid/${index}.m3u8`,
  }));
  const calls: Array<{ offset: number; limit: number }> = [];
  const repository: CatalogRepository = {
    kind: 'local-indexeddb',
    getStats: async () => ({
      playlistItemsCount: total,
      catalogMetadataCount: 1,
      tmdbMetadataCount: 0,
      byContentKind: {
        live: 0,
        movie: total,
        series: 0,
        series_episode: 0,
        radio: 0,
        unknown: 0,
      },
    }),
    getImportMetadata: async () => ({
      ...metadata(),
      parsedCount: total,
      importedCount: total,
    }),
    getTmdbMetadataBySourceItemIds: async () => new Map(),
    listCategories: async () => [
      {
        id: 'pagination-category',
        title: groupTitle,
        normalizedTitle: normalizedGroup,
        contentKind: 'movie',
        itemCount: total,
        isUncategorized: false,
        isUnknownKind: false,
      },
    ],
    listItems: async (input) => {
      const offset = input.offset ?? 0;
      const limit = input.limit ?? total;
      calls.push({ offset, limit });
      return items.slice(offset, offset + limit);
    },
  };

  return { repository, calls };
}

async function runPaginationScenario(total: number) {
  const { repository, calls } = createPaginationRepository(total);
  let loadedItems: HomeVodItem[] = [];
  let offset = 0;
  let hasMore = true;
  let totalCount = 0;
  let lastReceivedCount = 0;

  while (hasMore) {
    const page = await loadLocalMovieCategoryPage(
      {
        sourceId: SOURCE_ID,
        groupTitles: ['Filmes | Lançamentos'],
        offset,
        limit: LOCAL_MOVIE_CATEGORY_PAGE_SIZE,
      },
      repository,
    );

    if (page.status !== 'ready') {
      break;
    }

    loadedItems = mergeLocalMovieCategoryPageItems(loadedItems, page.items);
    offset = page.rawOffset + page.receivedCount;
    hasMore = page.hasMore;
    totalCount = page.totalCount;
    lastReceivedCount = page.receivedCount;
  }

  return {
    calls,
    loadedItems,
    totalCount,
    hasMore,
    lastReceivedCount,
  };
}

export async function runU2F23NavigationCorrectnessSmokeTest(): Promise<U2F23NavigationCorrectnessSmokeTestResult> {
  clearHomeVodCache();

  const mock = createRepository();
  let sectionCompositions = 0;
  const localSectionsLoader: typeof loadLocalCatalogHomeVodSections =
    async (input) => {
      sectionCompositions += 1;
      return loadLocalCatalogHomeVodSections(input, mock.repository);
    };
  const input = {
    licenseCode: LICENSE_CODE,
    deviceIdentifier: DEVICE_ID,
    sourceId: SOURCE_ID,
    sourceType: 'm3u' as const,
    limitPerSection: 3,
  };
  const firstSections = await loadHomeVodSections(input, localSectionsLoader);
  const callsAfterCold = sectionCompositions;
  const secondSections = await loadHomeVodSections(input, localSectionsLoader);
  const homeHotReturnNoDbRebuild =
    firstSections.length > 0 &&
    secondSections.length === firstSections.length &&
    sectionCompositions === callsAfterCold;
  const normalizedGroupDedupe =
    mock.getNormalizedGroups().filter((group) => group === 'filmes | acao')
      .length === 1 &&
    mock.getNormalizedGroups().filter((group) => group === 'filmes | lancamentos')
      .length === 1;
  const seriesSectionCount = firstSections.filter((section) =>
    section.id.startsWith('home-local-series-'),
  ).length;
  const homeAllConfiguredSeriesProgressive = seriesSectionCount > 3;
  const noFullCatalogScan = mock.getFullScanCalls() === 0;
  const seeAllExactCategory =
    getExactCategoryRouteByGroupTitle('Filmes | Lançamentos', 'movie') ===
      '/category/filmes-lancamentos' &&
    getExactCategoryRouteByGroupTitle('Filmes | Ação', 'movie') ===
      '/category/filmes-acao' &&
    getExactCategoryRouteByGroupTitle('Filmes | Comédia', 'movie') ===
      '/category/filmes-comedia' &&
    getExactCategoryRouteByGroupTitle('SERIES | NETFLIX', 'series') ===
      '/category/series-group?groupTitle=SERIES+%7C+NETFLIX';
  const knownMovieRoute =
    getExactCategoryRouteByGroupTitle('Filmes | Ação', 'movie');
  const providerMovieRoute =
    getExactCategoryRouteByGroupTitle('Filmes | Cult Europeu', 'movie');
  const seriesGroupRoute =
    getExactCategoryRouteByGroupTitle('SERIES | NETFLIX', 'series');
  const moviesKnownGroupSeeAll = knownMovieRoute === '/category/filmes-acao';
  const moviesProviderGroupSeeAll =
    providerMovieRoute ===
    '/category/movie-group?groupTitle=Filmes+%7C+Cult+Europeu';
  const seriesGroupSeeAll =
    seriesGroupRoute ===
    '/category/series-group?groupTitle=SERIES+%7C+NETFLIX';
  const seeAllGroupTitleUrlEncoding =
    providerMovieRoute?.includes('groupTitle=Filmes+%7C+Cult+Europeu') === true &&
    seriesGroupRoute?.includes('groupTitle=SERIES+%7C+NETFLIX') === true;
  const movieArbitrarySlugFallbackAbsent =
    providerMovieRoute !== '/category/filmes-cult-europeu';
  const homeMovieSeeAllExactGroup =
    getHomeSectionSeeAllRoute({
      sectionId: 'home-local-movie-0',
      title: 'Filmes | Cult Europeu',
      kind: 'movie',
      groupTitle: 'Filmes | Cult Europeu',
    }) === providerMovieRoute;
  const homeSeriesSeeAllExactGroup =
    getHomeSectionSeeAllRoute({
      sectionId: 'home-local-series-0',
      title: 'SERIES | NETFLIX',
      kind: 'series',
      groupTitle: 'SERIES | NETFLIX',
    }) === seriesGroupRoute;
  const unknownHomeRowSeeAllAbsent =
    getHomeSectionSeeAllRoute({
      sectionId: 'home-local-unknown',
      title: 'Não classificados',
      kind: 'unknown',
    }) === null;
  const movieHeroTvgFallback =
    Boolean(firstSections.find((section) => section.items[0]?.posterUrl));
  const episodeNaturalOrder =
    parseEpisodeNaturalOrder('S01-E03').episodeNumber === 3 &&
    parseEpisodeNaturalOrder('T1-E5').seasonNumber === 1 &&
    parseEpisodeNaturalOrder('1x06').episodeNumber === 6 &&
    parseEpisodeNaturalOrder('Episódio 7').episodeNumber === 7 &&
    sortEpisodesNaturally([
      { id: '10', title: 'S01E10', kind: 'series' },
      { id: '2', title: 'S01E02', kind: 'series' },
      { id: '1', title: 'S01E01', kind: 'series' },
    ])[2]?.id === '10';
  const artwork = resolveLocalCatalogArtwork(
    {
      tvgLogo: 'http://images.example.invalid/poster.jpg',
    },
    {
      posterPath: '/poster.jpg',
      backdropPath: '/backdrop.jpg',
    },
  );
  const artworkHttpOriginalFirst =
    artwork.posterCandidates[0]?.url ===
      'http://images.example.invalid/poster.jpg' &&
    artwork.posterCandidates[0]?.originalScheme === 'http' &&
    artwork.posterCandidates[0]?.upgradedToHttps === false;
  const artworkHttpsFallbackSecond =
    artwork.posterCandidates[1]?.url ===
      'https://images.example.invalid/poster.jpg' &&
    artwork.posterCandidates[1]?.originalScheme === 'http' &&
    artwork.posterCandidates[1]?.upgradedToHttps === true;
  const artworkMetadataAfterTvgFallbacks =
    artwork.posterCandidates[2]?.url ===
      'https://image.tmdb.org/t/p/w500/poster.jpg' &&
    artwork.posterCandidates[2]?.source === 'tmdb_poster' &&
    artwork.posterCandidates[3]?.url ===
      'https://image.tmdb.org/t/p/w780/backdrop.jpg' &&
    artwork.posterCandidates[3]?.source === 'tmdb_backdrop';
  const pagination47Result = await runPaginationScenario(47);
  const pagination47 =
    pagination47Result.loadedItems.length === 47 &&
    pagination47Result.totalCount === 47 &&
    pagination47Result.hasMore === false &&
    pagination47Result.lastReceivedCount === 7 &&
    pagination47Result.calls.map((call) => call.offset).join(',') ===
      '0,20,40' &&
    pagination47Result.calls.every(
      (call) => call.limit === LOCAL_MOVIE_CATEGORY_PAGE_SIZE,
    );
  const paginationOver800Result = await runPaginationScenario(845);
  const paginationOver800 =
    paginationOver800Result.loadedItems.length === 845 &&
    paginationOver800Result.totalCount === 845 &&
    paginationOver800Result.hasMore === false &&
    paginationOver800Result.lastReceivedCount === 5 &&
    paginationOver800Result.calls.at(-1)?.offset === 840 &&
    paginationOver800Result.calls.every(
      (call) => call.limit === LOCAL_MOVIE_CATEGORY_PAGE_SIZE,
    );
  const duplicateBaseItems = pagination47Result.loadedItems.slice(0, 20);
  const duplicateOverlapItems = [
    ...duplicateBaseItems.slice(15),
    ...pagination47Result.loadedItems.slice(20, 40),
  ];
  const duplicateMergedOnce = mergeLocalMovieCategoryPageItems(
    duplicateBaseItems,
    duplicateBaseItems,
  );
  const duplicateMergedOverlap = mergeLocalMovieCategoryPageItems(
    duplicateMergedOnce,
    duplicateOverlapItems,
  );
  const duplicateAppendProtected =
    duplicateMergedOnce.length === 20 &&
    duplicateMergedOverlap.length === 40 &&
    new Set(duplicateMergedOverlap.map((entry) => entry.id)).size === 40;
  const formatTotalCounter = (loaded: number, total: number) =>
    `${loaded} de ${total}`;
  const totalCounter =
    formatTotalCounter(20, 47) === '20 de 47' &&
    formatTotalCounter(40, 47) === '40 de 47' &&
    formatTotalCounter(47, 47) === '47 de 47';

  clearHomeVodCache();

  const result = {
    homeHotReturnNoDbRebuild,
    moviesHotReturnNoDbRebuild: homeHotReturnNoDbRebuild,
    seriesHotReturnNoDbRebuild: homeHotReturnNoDbRebuild,
    normalizedGroupDedupe,
    homeAllConfiguredSeriesProgressive,
    noFullCatalogScan,
    seeAllExactCategory,
    homeMovieSeeAllExactGroup,
    homeSeriesSeeAllExactGroup,
    moviesKnownGroupSeeAll,
    moviesProviderGroupSeeAll,
    seriesGroupSeeAll,
    seeAllGroupTitleUrlEncoding,
    movieArbitrarySlugFallbackAbsent,
    unknownHomeRowSeeAllAbsent,
    movieHeroTvgFallback,
    episodeNaturalOrder,
    artworkHttpOriginalFirst,
    artworkHttpsFallbackSecond,
    artworkMetadataAfterTvgFallbacks,
    pagination47,
    paginationOver800,
    duplicateAppendProtected,
    totalCounter,
  };

  return {
    ok: Object.values(result).every(Boolean),
    ...result,
  };
}
