import {
  cacheAppBootstrapResultForSession,
  runAppBootstrap,
  type AppBootstrapResult,
} from '@/features/bootstrap/services/appBootstrap.service';
import { loadReadableLocalLiveChannels } from '@/features/live/services/localLiveCatalog.service';
import type { CatalogRepository } from '@/features/localCatalog/repositories/catalogRepository.types';
import { loadLocalCatalogHomeVodSections } from '@/features/localCatalog/readModels/localCatalogHomeVodAdapter.service';
import { isLocalCatalogReadable } from '@/features/localCatalog/services/localCatalogReadability.service';
import type {
  LocalCatalogContentKind,
  LocalCatalogImportMetadata,
  LocalCatalogItem,
} from '@/features/localCatalog/types/localCatalog.types';
import {
  mapLocalCatalogItemToHomeVodItem,
} from '@/features/localCatalog/readModels/localCatalogHomeVodAdapter.service';
import {
  clearHomeVodCache,
  loadHomeVodSections,
  type HomeVodSection,
} from './homeVod.service';

export type HomeHotReturnSmokeTestResult = {
  ok: boolean;
  coldHome: boolean;
  hotHome: boolean;
  cacheIsolation: boolean;
  homeMovies: boolean;
  homeSeries: boolean;
  liveNoRegression: boolean;
  readability: boolean;
  artworkMapping: boolean;
  missingArtworkFallback: boolean;
  validLocalContentPreserved: boolean;
  noAuthoritativeDemoFallback: boolean;
  confirmedEmptyPreserved: boolean;
  readErrorPropagated: boolean;
  categoryFullScanAvoided: boolean;
  bootstrapPreparationSkippedOnHotReturn: boolean;
};

const LICENSE_CODE = 'SMOKE-LICENSE';
const DEVICE_ID = 'smoke-device';
const SOURCE_A = 'source-a';
const SOURCE_B = 'source-b';
const LAST_SUCCESS = '2026-07-23T12:00:00.000Z';

function metadata(
  sourceId: string,
  status: LocalCatalogImportMetadata['status'] = 'ready',
): LocalCatalogImportMetadata {
  return {
    sourceId,
    sourceType: 'm3u',
    status,
    startedAt: LAST_SUCCESS,
    completedAt: status === 'importing' ? null : LAST_SUCCESS,
    lastSuccessfulImportAt: LAST_SUCCESS,
    parsedCount: status === 'ready' ? 20 : 0,
    importedCount: status === 'ready' ? 20 : 0,
    updatedCount: 0,
    removedCount: 0,
    unknownCount: 0,
    withoutGroupCount: 0,
    classificationVersion: 1,
    errorCode: status === 'failed' ? 'LOCAL_CATALOG_IMPORT_FAILED' : null,
  };
}

function item(
  sourceId: string,
  contentKind: LocalCatalogContentKind,
  groupTitle: string,
  withArtwork = true,
): LocalCatalogItem {
  return {
    id: `${sourceId}-${contentKind}-${groupTitle}`,
    sourceId,
    sourceType: 'm3u',
    name: `${contentKind} de teste`,
    rawName: `${contentKind} de teste`,
    normalizedName: `${contentKind} de teste`,
    groupTitle,
    normalizedGroup: groupTitle.toLowerCase(),
    contentKind,
    streamUrl: 'https://stream.example.invalid/item.m3u8',
    tvgLogo: withArtwork
      ? 'https://images.example.invalid/poster.jpg'
      : null,
    classificationVersion: 1,
    importSessionId: 'previous-success',
    createdAt: LAST_SUCCESS,
    updatedAt: LAST_SUCCESS,
  };
}

function createRepository() {
  let categoryCalls = 0;
  let itemCalls = 0;

  const repository: CatalogRepository = {
    kind: 'local-indexeddb',
    getImportMetadata: async (sourceId) => metadata(sourceId),
    getTmdbMetadataBySourceItemIds: async (sourceItemIds) =>
      new Map(
        sourceItemIds
          .filter((sourceItemId) => sourceItemId.includes('-series-'))
          .map((sourceItemId) => [
            sourceItemId,
            {
              id: `tmdb-${sourceItemId}`,
              sourceItemId,
              tmdbId: 123,
              title: 'Série enriquecida localmente',
              posterPath: '/secondary-poster.jpg',
              backdropPath: '/secondary-backdrop.jpg',
              matchStatus: 'matched' as const,
              updatedAt: LAST_SUCCESS,
            },
          ]),
      ),
    listCategories: async () => {
      categoryCalls += 1;
      return [];
    },
    listItems: async (input) => {
      itemCalls += 1;

      const groupTitle = input.groupTitle ?? input.normalizedGroup;

      if (!input.contentKind || !groupTitle) {
        return [];
      }

      return [
        item(
          input.sourceId,
          input.contentKind,
          groupTitle,
          input.contentKind !== 'series',
        ),
      ];
    },
    getStats: async () => ({
      playlistItemsCount: 3,
      catalogMetadataCount: 1,
      tmdbMetadataCount: 0,
      byContentKind: {
        live: 1,
        movie: 1,
        series: 1,
        series_episode: 0,
        radio: 0,
        unknown: 0,
      },
    }),
  };

  return {
    repository,
    getCategoryCalls: () => categoryCalls,
    getItemCalls: () => itemCalls,
  };
}

export async function runHomeHotReturnSmokeTest(): Promise<HomeHotReturnSmokeTestResult> {
  clearHomeVodCache();
  const mock = createRepository();
  let compositions = 0;
  const localSectionsLoader: typeof loadLocalCatalogHomeVodSections =
    async (input) => {
      compositions += 1;
      return loadLocalCatalogHomeVodSections(input, mock.repository);
    };
  const inputA = {
    licenseCode: LICENSE_CODE,
    deviceIdentifier: DEVICE_ID,
    sourceId: SOURCE_A,
    sourceType: 'm3u' as const,
    limitPerSection: 4,
  };
  const inputB = { ...inputA, sourceId: SOURCE_B };
  const firstSections = await loadHomeVodSections(inputA, localSectionsLoader);
  const callsAfterCold = compositions;
  const secondSections = await loadHomeVodSections(inputA, localSectionsLoader);
  const callsAfterHot = compositions;
  const sourceBSections = await loadHomeVodSections(inputB, localSectionsLoader);
  const coldHome = firstSections.length > 0 && callsAfterCold === 1;
  const hotHome =
    secondSections.length === firstSections.length &&
    callsAfterHot === callsAfterCold;
  const cacheIsolation =
    compositions === callsAfterHot + 1 &&
    sourceBSections.every((section) =>
      section.items.every((entry) => entry.id.startsWith(SOURCE_B)),
    );
  const homeMovies = firstSections.some((section) =>
    section.items.some((entry) => entry.kind === 'movie'),
  );
  const homeSeries = firstSections.some((section) =>
    section.items.some((entry) => entry.kind === 'series'),
  );
  const categoryFullScanAvoided =
    mock.getCategoryCalls() === 0 && mock.getItemCalls() > 0;
  const liveItem = item(SOURCE_A, 'live', 'Ao Vivo');
  const liveRepository: CatalogRepository = {
    ...mock.repository,
    getImportMetadata: async () => metadata(SOURCE_A, 'canceled'),
    listItems: async () => [liveItem],
  };
  const liveChannels = await loadReadableLocalLiveChannels(
    SOURCE_A,
    liveRepository,
  );
  const liveNoRegression =
    liveChannels?.length === 1 && liveChannels[0]?.id === liveItem.id;
  const readability = (
    ['importing', 'failed', 'canceled'] as const
  ).every((status) => isLocalCatalogReadable(metadata(SOURCE_A, status)));
  const artworkItem = item(SOURCE_A, 'movie', 'Filmes | Ação');
  const artworkViewModel = mapLocalCatalogItemToHomeVodItem(artworkItem);
  const missingArtworkViewModel = mapLocalCatalogItemToHomeVodItem(
    item(SOURCE_A, 'series', 'Séries', false),
  );
  const artworkMapping =
    artworkViewModel.posterUrl === artworkItem.tvgLogo &&
    firstSections.some((section) =>
      section.items.some(
        (entry) =>
          entry.kind === 'series' &&
          entry.posterUrl ===
            'https://image.tmdb.org/t/p/w500/secondary-poster.jpg' &&
          entry.backdropUrl ===
            'https://image.tmdb.org/t/p/w780/secondary-backdrop.jpg',
      ),
    );
  const missingArtworkFallback =
    missingArtworkViewModel.posterUrl === undefined;
  const validLocalContentPreserved = homeMovies && homeSeries;
  const confirmedEmptySections = await loadHomeVodSections(
    {
      ...inputA,
      sourceId: 'source-confirmed-empty',
      preferFresh: true,
    },
    async () => [],
  );
  const confirmedEmptyPreserved = confirmedEmptySections.length === 0;
  const noAuthoritativeDemoFallback = confirmedEmptySections.length === 0;
  let readErrorPropagated = false;

  try {
    await loadHomeVodSections(
      {
        ...inputA,
        sourceId: 'source-read-error',
        preferFresh: true,
        propagateReadError: true,
      },
      async () => {
        throw new Error('LOCAL_CATALOG_SMOKE_READ_FAILURE');
      },
    );
  } catch (error) {
    readErrorPropagated =
      error instanceof Error &&
      error.message === 'LOCAL_CATALOG_SMOKE_READ_FAILURE';
  }

  let sourceLoads = 0;
  const cachedBootstrapResult: AppBootstrapResult = {
    licenseCode: LICENSE_CODE,
    deviceIdentifier: DEVICE_ID,
    sourceId: SOURCE_A,
    homeSections: firstSections as HomeVodSection[],
    livePreviewChannels: [],
    movieItems: [],
    seriesItems: [],
    preloadedImages: 0,
    failedImages: 0,
    warnings: [],
  };

  cacheAppBootstrapResultForSession(cachedBootstrapResult);
  const hotBootstrapResult = await runAppBootstrap({
    licenseCode: LICENSE_CODE,
    deviceIdentifier: DEVICE_ID,
    runtime: {
      currentChannelsCount: 0,
      currentStatus: 'ready',
      currentSourceId: SOURCE_A,
      loadFromSource: async () => {
        sourceLoads += 1;
      },
      loadFromChannels: () => undefined,
      clearRuntime: () => undefined,
    },
  });
  const bootstrapPreparationSkippedOnHotReturn =
    sourceLoads === 0 && hotBootstrapResult.sourceId === SOURCE_A;
  const assertions = {
    coldHome,
    hotHome,
    cacheIsolation,
    homeMovies,
    homeSeries,
    liveNoRegression,
    readability,
    artworkMapping,
    missingArtworkFallback,
    validLocalContentPreserved,
    noAuthoritativeDemoFallback,
    confirmedEmptyPreserved,
    readErrorPropagated,
    categoryFullScanAvoided,
    bootstrapPreparationSkippedOnHotReturn,
  };

  clearHomeVodCache();

  return {
    ok: Object.values(assertions).every(Boolean),
    ...assertions,
  };
}
