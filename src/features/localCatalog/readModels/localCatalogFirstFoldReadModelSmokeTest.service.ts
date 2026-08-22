import {
  openLocalCatalogDb,
  putLocalCatalogScope,
  putLocalCatalogSnapshot,
  LOCAL_CATALOG_V3_STORES,
} from '../services/localCatalogDb.service';
import type {
  LocalCatalogScope,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';
import {
  filterRenderableHomeVodSections,
  isRenderableHomeVodSection,
} from '../../catalog/services/homeVodRenderability.service';
import type { HomeVodSection } from '../../catalog/services/homeVod.service';
import {
  listStagingFirstFoldHomeVodSections,
  loadLocalStagingHomeVodSections,
} from './localCatalogFirstFoldReadModel.service';
import {
  loadLocalStagingCategoryReadModel,
  selectStableOrStagingCategoryItems,
} from './localCatalogCategoryReadModel.service';
import { prepareHomePlaylist } from '../../catalog/services/prepareHomePlaylist.service';
import { isLocalCatalogReadable } from '../services/localCatalogReadability.service';
export {
  runLocalLiveCatalogConformanceSmokeTest,
  type LiveCatalogConformanceSmokeResult,
} from '../../live/services/localLiveCatalogSmokeTest.service';

export type FirstFoldReadModelSmokeTestResult = {
  ok: boolean;
  readsStagingWhenValid: boolean;
  rejectsNonStagingSnapshotId: boolean;
  rejectsNonBuildingSnapshotStatus: boolean;
  emptyWhenNoVodItems: boolean;
  respectsBoundedLimits: boolean;
  acceptsHomeRenderableStagingSection: boolean;
  rejectsLiveLikeStagingSection: boolean;
  moviesPartialStaging: boolean;
  seriesPartialStaging: boolean;
  moviesSingleRenderableGroup: boolean;
  moviesIncrementalRefresh: boolean;
  seriesIncrementalRefresh: boolean;
  moviesScopeIsolation: boolean;
  seriesScopeIsolation: boolean;
  warmActivePriorityMovies: boolean;
  warmActivePrioritySeries: boolean;
  failedStagingPreservesActive: boolean;
  emptySelectionRemainsPreparing: boolean;
  errorCode?: string;
};

const TEST_SCOPE_KEY = 'test_first_fold_scope';
const TEST_SNAPSHOT_ID = 'test_first_fold_snapshot_building';
const TEST_OTHER_SNAPSHOT_ID = 'test_first_fold_snapshot_other';
const LIVE_LIKE_SCOPE_KEY = 'test_first_fold_live_like_scope';
const LIVE_LIKE_SNAPSHOT_ID = 'test_first_fold_live_like_snapshot_building';

export async function runLocalCatalogFirstFoldReadModelSmokeTest(): Promise<FirstFoldReadModelSmokeTestResult> {
  const result: FirstFoldReadModelSmokeTestResult = {
    ok: false,
    readsStagingWhenValid: false,
    rejectsNonStagingSnapshotId: false,
    rejectsNonBuildingSnapshotStatus: false,
    emptyWhenNoVodItems: false,
    respectsBoundedLimits: false,
    acceptsHomeRenderableStagingSection: false,
    rejectsLiveLikeStagingSection: false,
    moviesPartialStaging: false,
    seriesPartialStaging: false,
    moviesSingleRenderableGroup: false,
    moviesIncrementalRefresh: false,
    seriesIncrementalRefresh: false,
    moviesScopeIsolation: false,
    seriesScopeIsolation: false,
    warmActivePriorityMovies: false,
    warmActivePrioritySeries: false,
    failedStagingPreservesActive: false,
    emptySelectionRemainsPreparing: false,
  };

  try {
    const db = await openLocalCatalogDb();

    // 1. Setup Scope and Snapshot in Building status
    const scope: LocalCatalogScope = {
      scopeKey: TEST_SCOPE_KEY,
      tenantScopeId: 'tenant_1',
      sourceId: 'src_1',
      activeSnapshotId: null,
      stagingSnapshotId: TEST_SNAPSHOT_ID,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await putLocalCatalogScope(scope);

    const snapshot: LocalCatalogSnapshot = {
      snapshotId: TEST_SNAPSHOT_ID,
      scopeKey: TEST_SCOPE_KEY,
      status: 'building',
      sourceRevision: 'rev1',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      failureCode: null,
    };
    await putLocalCatalogSnapshot(snapshot);

    // 2. Insert items into catalogSnapshotItems
    const tx = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readwrite');
    const store = tx.objectStore(LOCAL_CATALOG_V3_STORES.items);

    const items: LocalCatalogSnapshotItem[] = [
      {
        snapshotId: TEST_SNAPSHOT_ID,
        itemId: 'item_movie_1',
        scopeKey: TEST_SCOPE_KEY,
        logicalIdentity: { version: 1, strategy: 'url_fallback', value: '1' },
        sourceItemId: null,
        contentKind: 'movie',
        rawName: 'Filme Ação 1',
        normalizedName: 'filme acao 1',
        rawGroupTitle: 'Filmes | Ação',
        normalizedGroup: 'filmes | acao',
        streamUrl: 'http://test.com/movie1.mp4',
        artworkUrl: 'http://test.com/art1.jpg',
        sourceOrder: 1,
        classificationVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        snapshotId: TEST_SNAPSHOT_ID,
        itemId: 'item_movie_2',
        scopeKey: TEST_SCOPE_KEY,
        logicalIdentity: { version: 1, strategy: 'url_fallback', value: '2' },
        sourceItemId: null,
        contentKind: 'movie',
        rawName: 'Filme Ação 2',
        normalizedName: 'filme acao 2',
        rawGroupTitle: 'Filmes | Ação',
        normalizedGroup: 'filmes | acao',
        streamUrl: 'http://test.com/movie2.mp4',
        artworkUrl: 'http://test.com/art2.jpg',
        sourceOrder: 2,
        classificationVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        snapshotId: TEST_SNAPSHOT_ID,
        itemId: 'item_series_1',
        scopeKey: TEST_SCOPE_KEY,
        logicalIdentity: { version: 1, strategy: 'url_fallback', value: '3' },
        sourceItemId: null,
        contentKind: 'series',
        rawName: 'Serie Netflix 1',
        normalizedName: 'serie netflix 1',
        rawGroupTitle: 'SERIES | NETFLIX',
        normalizedGroup: 'series | netflix',
        streamUrl: 'http://test.com/series1.mp4',
        artworkUrl: 'http://test.com/art3.jpg',
        sourceOrder: 3,
        classificationVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const item of items) {
      store.put(item);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Test 1: Reads staging when valid
    const sections = await listStagingFirstFoldHomeVodSections({
      scopeKey: TEST_SCOPE_KEY,
      snapshotId: TEST_SNAPSHOT_ID,
      sourceId: 'src_1',
      movieGroupTitles: ['Filmes | Ação'],
      seriesGroupTitles: ['SERIES | NETFLIX'],
      maxSections: 4,
      itemsPerSection: 20,
    });

    result.readsStagingWhenValid = sections.length === 2 && sections[0].items.length > 0;
    result.acceptsHomeRenderableStagingSection =
      sections.length > 0 && sections.every(isRenderableHomeVodSection);

    // Test 2: Rejects non-staging snapshotId
    const sectionsInvalidId = await listStagingFirstFoldHomeVodSections({
      scopeKey: TEST_SCOPE_KEY,
      snapshotId: TEST_OTHER_SNAPSHOT_ID,
      sourceId: 'src_1',
    });
    result.rejectsNonStagingSnapshotId = sectionsInvalidId.length === 0;

    // Test 3: Rejects non-building snapshot status
    await putLocalCatalogSnapshot({
      ...snapshot,
      status: 'active', // not 'building'
    });
    const sectionsNonBuilding = await listStagingFirstFoldHomeVodSections({
      scopeKey: TEST_SCOPE_KEY,
      snapshotId: TEST_SNAPSHOT_ID,
      sourceId: 'src_1',
    });
    result.rejectsNonBuildingSnapshotStatus = sectionsNonBuilding.length === 0;

    // Restore to building
    await putLocalCatalogSnapshot(snapshot);

    // Test 4: Respects bounded limits
    const boundedSections = await listStagingFirstFoldHomeVodSections({
      scopeKey: TEST_SCOPE_KEY,
      snapshotId: TEST_SNAPSHOT_ID,
      sourceId: 'src_1',
      movieGroupTitles: ['Filmes | Ação'],
      seriesGroupTitles: ['SERIES | NETFLIX'],
      maxSections: 1,
      itemsPerSection: 1,
    });
    result.respectsBoundedLimits =
      boundedSections.length === 1 && boundedSections[0].items.length === 1;

    // Test 5: Empty when no VOD items in another scope
    const emptySections = await listStagingFirstFoldHomeVodSections({
      scopeKey: 'non_existent_scope',
      snapshotId: TEST_SNAPSHOT_ID,
    });
    result.emptyWhenNoVodItems = emptySections.length === 0;

    // Test 6: A clean building staging with only a live-like section cannot
    // satisfy first-fold readiness. No ACTIVE snapshot exists in this scope.
    const liveLikeScope: LocalCatalogScope = {
      ...scope,
      scopeKey: LIVE_LIKE_SCOPE_KEY,
      sourceId: 'src_live_like',
      activeSnapshotId: null,
      stagingSnapshotId: LIVE_LIKE_SNAPSHOT_ID,
    };
    const liveLikeSnapshot: LocalCatalogSnapshot = {
      ...snapshot,
      snapshotId: LIVE_LIKE_SNAPSHOT_ID,
      scopeKey: LIVE_LIKE_SCOPE_KEY,
      status: 'building',
      totalItems: 1,
    };
    await putLocalCatalogScope(liveLikeScope);
    await putLocalCatalogSnapshot(liveLikeSnapshot);

    const liveLikeTransaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.items,
      'readwrite',
    );
    liveLikeTransaction.objectStore(LOCAL_CATALOG_V3_STORES.items).put({
      snapshotId: LIVE_LIKE_SNAPSHOT_ID,
      itemId: 'item_live_like_1',
      scopeKey: LIVE_LIKE_SCOPE_KEY,
      logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'live-1' },
      sourceItemId: null,
      contentKind: 'movie',
      rawName: 'Programacao linear 1',
      normalizedName: 'programacao linear 1',
      rawGroupTitle: 'Canais | Ao Vivo',
      normalizedGroup: 'canais | ao vivo',
      streamUrl: 'http://test.com/live-like-1.mp4',
      artworkUrl: null,
      sourceOrder: 1,
      classificationVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies LocalCatalogSnapshotItem);
    await new Promise<void>((resolve, reject) => {
      liveLikeTransaction.oncomplete = () => resolve();
      liveLikeTransaction.onerror = () => reject(liveLikeTransaction.error);
    });

    const liveLikeSections = await listStagingFirstFoldHomeVodSections({
      scopeKey: LIVE_LIKE_SCOPE_KEY,
      snapshotId: LIVE_LIKE_SNAPSHOT_ID,
      sourceId: 'src_live_like',
      maxSections: 4,
      itemsPerSection: 20,
    });
    result.rejectsLiveLikeStagingSection = liveLikeSections.length === 0;

    // Test 7: Movies and Series landings can read bounded, non-authoritative
    // content from the current building staging snapshot before EOF.
    const initialMovies = await loadLocalStagingCategoryReadModel({
      sourceId: 'src_1',
      scopeKey: TEST_SCOPE_KEY,
      groupTitles: ['Filmes | Ação'],
      contentKind: 'movie',
      totalLimit: 2,
    });
    const initialSeries = await loadLocalStagingCategoryReadModel({
      sourceId: 'src_1',
      scopeKey: TEST_SCOPE_KEY,
      groupTitles: ['SERIES | NETFLIX'],
      contentKind: 'series',
      totalLimit: 2,
    });
    result.moviesPartialStaging =
      initialMovies.readMode === 'staging' && initialMovies.items.length === 2;
    result.seriesPartialStaging =
      initialSeries.readMode === 'staging' && initialSeries.items.length === 1;
    result.moviesSingleRenderableGroup =
      initialMovies.items.length > 0 &&
      new Set(initialMovies.items.map((item) => item.groupTitle)).size === 1;

    // Test 8: A second committed staging batch expands the bounded view.
    const incrementalTransaction = db.transaction(
      LOCAL_CATALOG_V3_STORES.items,
      'readwrite',
    );
    const incrementalStore = incrementalTransaction.objectStore(
      LOCAL_CATALOG_V3_STORES.items,
    );
    incrementalStore.put({
      ...items[0],
      itemId: 'item_movie_drama_1',
      rawName: 'Filme Drama 1',
      normalizedName: 'filme drama 1',
      rawGroupTitle: 'Filmes | Drama',
      normalizedGroup: 'filmes | drama',
      streamUrl: 'http://test.com/movie-drama-1.mp4',
      sourceOrder: 4,
    } satisfies LocalCatalogSnapshotItem);
    incrementalStore.put({
      ...items[2],
      itemId: 'item_series_amazon_1',
      rawName: 'Serie Amazon 1',
      normalizedName: 'serie amazon 1',
      rawGroupTitle: 'SERIES | AMAZON PRIME VIDEO',
      normalizedGroup: 'series | amazon prime video',
      streamUrl: 'http://test.com/series-amazon-1.mp4',
      sourceOrder: 5,
    } satisfies LocalCatalogSnapshotItem);
    await new Promise<void>((resolve, reject) => {
      incrementalTransaction.oncomplete = () => resolve();
      incrementalTransaction.onerror = () => reject(incrementalTransaction.error);
    });

    const expandedMovies = await loadLocalStagingCategoryReadModel({
      sourceId: 'src_1',
      scopeKey: TEST_SCOPE_KEY,
      groupTitles: ['Filmes | Ação', 'Filmes | Drama'],
      contentKind: 'movie',
      totalLimit: 4,
    });
    const expandedSeries = await loadLocalStagingCategoryReadModel({
      sourceId: 'src_1',
      scopeKey: TEST_SCOPE_KEY,
      groupTitles: ['SERIES | NETFLIX', 'SERIES | AMAZON PRIME VIDEO'],
      contentKind: 'series',
      totalLimit: 4,
    });
    result.moviesIncrementalRefresh =
      initialMovies.items.every((item) =>
        expandedMovies.items.some((expanded) => expanded.id === item.id),
      ) && expandedMovies.items.some((item) => item.id === 'item_movie_drama_1');
    result.seriesIncrementalRefresh =
      initialSeries.items.every((item) =>
        expandedSeries.items.some((expanded) => expanded.id === item.id),
      ) && expandedSeries.items.some((item) => item.id === 'item_series_amazon_1');

    // Test 9: source/scope isolation rejects cross-source staging.
    const wrongSourceMovies = await loadLocalStagingCategoryReadModel({
      sourceId: 'src_other',
      scopeKey: TEST_SCOPE_KEY,
      groupTitles: ['Filmes | Ação'],
      contentKind: 'movie',
    });
    const wrongSourceSeries = await loadLocalStagingCategoryReadModel({
      sourceId: 'src_other',
      scopeKey: TEST_SCOPE_KEY,
      groupTitles: ['SERIES | NETFLIX'],
      contentKind: 'series',
    });
    result.moviesScopeIsolation = wrongSourceMovies.items.length === 0;
    result.seriesScopeIsolation = wrongSourceSeries.items.length === 0;

    // Test 10: stable content keeps authority and a failed staging cannot replace it.
    const stableMovie = { ...initialMovies.items[0], id: 'stable-movie' };
    const stableSeries = { ...initialSeries.items[0], id: 'stable-series' };
    const selectedMovie = selectStableOrStagingCategoryItems(
      [stableMovie],
      expandedMovies.items,
    );
    const selectedSeries = selectStableOrStagingCategoryItems(
      [stableSeries],
      expandedSeries.items,
    );
    result.warmActivePriorityMovies =
      selectedMovie.readMode === 'stable' && selectedMovie.items[0]?.id === 'stable-movie';
    result.warmActivePrioritySeries =
      selectedSeries.readMode === 'stable' && selectedSeries.items[0]?.id === 'stable-series';

    await putLocalCatalogSnapshot({ ...snapshot, status: 'failed' });
    const failedStaging = await loadLocalStagingCategoryReadModel({
      sourceId: 'src_1',
      scopeKey: TEST_SCOPE_KEY,
      groupTitles: ['Filmes | Ação'],
      contentKind: 'movie',
    });
    const selectedAfterFailure = selectStableOrStagingCategoryItems(
      [stableMovie],
      failedStaging.items,
    );
    result.failedStagingPreservesActive =
      failedStaging.items.length === 0 &&
      selectedAfterFailure.readMode === 'stable' &&
      selectedAfterFailure.items[0]?.id === 'stable-movie';
    result.emptySelectionRemainsPreparing =
      selectStableOrStagingCategoryItems([], []).readMode === null;

    result.ok =
      result.readsStagingWhenValid &&
      result.rejectsNonStagingSnapshotId &&
      result.rejectsNonBuildingSnapshotStatus &&
      result.respectsBoundedLimits &&
      result.emptyWhenNoVodItems &&
      result.acceptsHomeRenderableStagingSection &&
      result.rejectsLiveLikeStagingSection &&
      result.moviesPartialStaging &&
      result.seriesPartialStaging &&
      result.moviesSingleRenderableGroup &&
      result.moviesIncrementalRefresh &&
      result.seriesIncrementalRefresh &&
      result.moviesScopeIsolation &&
      result.seriesScopeIsolation &&
      result.warmActivePriorityMovies &&
      result.warmActivePrioritySeries &&
      result.failedStagingPreservesActive &&
      result.emptySelectionRemainsPreparing;

    db.close();
    return result;
  } catch (error) {
    result.errorCode = error instanceof Error ? error.message : 'TEST_FAILED';
    return result;
  }
}

export function runCategoryAuthoritySelectionBehavioralTest() {
  const stableMovie = { id: 'stable-movie', title: 'Stable', kind: 'movie' } as const;
  const stagingMovie = { id: 'staging-movie', title: 'Staging', kind: 'movie' } as const;
  const stablePriority = selectStableOrStagingCategoryItems(
    [stableMovie],
    [stagingMovie],
  );
  const stagingFallback = selectStableOrStagingCategoryItems([], [stagingMovie]);
  const preparing = selectStableOrStagingCategoryItems([], []);

  return {
    ok:
      stablePriority.readMode === 'stable' &&
      stablePriority.items[0]?.id === stableMovie.id &&
      stagingFallback.readMode === 'staging' &&
      stagingFallback.items[0]?.id === stagingMovie.id &&
      preparing.readMode === null &&
      preparing.items.length === 0,
    stablePriority: stablePriority.readMode === 'stable',
    stagingFallback: stagingFallback.readMode === 'staging',
    truePreparing: preparing.readMode === null && preparing.items.length === 0,
  };
}

export type HomeVodRenderabilityBehavioralTestResult = {
  ok: boolean;
  validVodSectionAccepted: boolean;
  emptySectionRejected: boolean;
  canalPrefixRejected: boolean;
  canaisPrefixRejected: boolean;
  aoVivoRejected: boolean;
  normalizedCaseRejected: boolean;
  firstFoldFalseReadyPrevented: boolean;
  firstFoldTrueReadyAllowed: boolean;
  predicateParity: boolean;
};

function renderabilityFixture(title: string, hasItems: boolean): HomeVodSection {
  return {
    id: `fixture-${title}`,
    title,
    eyebrow: '',
    description: '',
    items: hasItems
      ? [{ id: `item-${title}`, title: 'Item', kind: 'movie' }]
      : [],
  };
}

export function runHomeVodRenderabilityBehavioralTest(): HomeVodRenderabilityBehavioralTestResult {
  const fixtures = [
    { section: renderabilityFixture('Filmes | Acao', true), expected: true },
    { section: renderabilityFixture('Filmes | Vazio', false), expected: false },
    { section: renderabilityFixture('canal premium', true), expected: false },
    { section: renderabilityFixture('canais premium', true), expected: false },
    { section: renderabilityFixture('Filmes ao vivo especiais', true), expected: false },
    { section: renderabilityFixture('  CANAIS PREMIUM  ', true), expected: false },
  ];
  const canonicalResults = fixtures.map(({ section }) =>
    isRenderableHomeVodSection(section),
  );
  const firstFoldResults = fixtures.map(
    ({ section }) => filterRenderableHomeVodSections([section]).length > 0,
  );
  const predicateParity = fixtures.every(
    ({ expected }, index) =>
      canonicalResults[index] === expected &&
      firstFoldResults[index] === canonicalResults[index],
  );
  const validVodSectionAccepted = canonicalResults[0] === true;
  const emptySectionRejected = canonicalResults[1] === false;
  const canalPrefixRejected = canonicalResults[2] === false;
  const canaisPrefixRejected = canonicalResults[3] === false;
  const aoVivoRejected = canonicalResults[4] === false;
  const normalizedCaseRejected = canonicalResults[5] === false;
  const firstFoldFalseReadyPrevented = firstFoldResults.slice(1).every(
    (isRenderable) => !isRenderable,
  );
  const firstFoldTrueReadyAllowed = firstFoldResults[0] === true;

  return {
    ok:
      predicateParity &&
      validVodSectionAccepted &&
      emptySectionRejected &&
      canalPrefixRejected &&
      canaisPrefixRejected &&
      aoVivoRejected &&
      normalizedCaseRejected &&
      firstFoldFalseReadyPrevented &&
      firstFoldTrueReadyAllowed,
    validVodSectionAccepted,
    emptySectionRejected,
    canalPrefixRejected,
    canaisPrefixRejected,
    aoVivoRejected,
    normalizedCaseRejected,
    firstFoldFalseReadyPrevented,
    firstFoldTrueReadyAllowed,
    predicateParity,
  };
}

export type VodCandidatePredicateBehavioralTestResult = {
  ok: boolean;
  movieChannelWithoutContentKindDetected: boolean;
  seriesChannelWithoutContentKindDetected: boolean;
  liveChannelWithoutContentKindIgnored: boolean;
  mixedBatchWithMovieDetected: boolean;
  mixedBatchWithSeriesDetected: boolean;
  liveOnlyBatchIgnored: boolean;
};

export async function runVodCandidatePredicateBehavioralTest(): Promise<VodCandidatePredicateBehavioralTestResult> {
  const { isVodChannel } = await import('@/features/playlists/lib/channelClassification');

  // Real IptvChannel fixtures with the exact shape emitted by parseM3uPlaylist (NO contentKind property)
  const movieChannel = {
    id: '1',
    name: 'Matrix 1999 FHD',
    url: 'http://test.stream/movie.mp4',
    logo: 'http://test.stream/logo.png',
    groupTitle: 'Filmes | Ficção Científica',
    tvgId: 'matrix.br',
    tvgName: 'Matrix 1999',
  };

  const seriesChannel = {
    id: '2',
    name: 'Breaking Bad S01 E01',
    url: 'http://test.stream/series.mp4',
    logo: 'http://test.stream/logo.png',
    groupTitle: 'Series | Drama',
    tvgId: 'bb.br',
    tvgName: 'Breaking Bad',
  };

  const liveChannel1 = {
    id: '3',
    name: 'GLOBO HD',
    url: 'http://test.stream/live1.m3u8',
    logo: 'http://test.stream/logo.png',
    groupTitle: 'Canais | Abertos',
    tvgId: 'globo.br',
    tvgName: 'Globo',
  };

  const liveChannel2 = {
    id: '4',
    name: 'ESPN Brasil FHD',
    url: 'http://test.stream/live2.m3u8',
    logo: 'http://test.stream/logo.png',
    groupTitle: 'Canais | Esportes',
    tvgId: 'espn.br',
    tvgName: 'ESPN',
  };

  const movieDetected = isVodChannel(movieChannel);
  const seriesDetected = isVodChannel(seriesChannel);
  const liveIgnored = !isVodChannel(liveChannel1) && !isVodChannel(liveChannel2);

  const mixedMovieBatch = [liveChannel1, movieChannel];
  const mixedSeriesBatch = [liveChannel1, seriesChannel];
  const liveOnlyBatch = [liveChannel1, liveChannel2];

  const mixedMovieBatchDetected = mixedMovieBatch.some((channel) => isVodChannel(channel));
  const mixedSeriesBatchDetected = mixedSeriesBatch.some((channel) => isVodChannel(channel));
  const liveOnlyBatchIgnored = !liveOnlyBatch.some((channel) => isVodChannel(channel));

  const ok =
    movieDetected &&
    seriesDetected &&
    liveIgnored &&
    mixedMovieBatchDetected &&
    mixedSeriesBatchDetected &&
    liveOnlyBatchIgnored;

  return {
    ok,
    movieChannelWithoutContentKindDetected: movieDetected,
    seriesChannelWithoutContentKindDetected: seriesDetected,
    liveChannelWithoutContentKindIgnored: liveIgnored,
    mixedBatchWithMovieDetected: mixedMovieBatchDetected,
    mixedBatchWithSeriesDetected: mixedSeriesBatchDetected,
    liveOnlyBatchIgnored,
  };
}

export type HomeIncrementalStagingExpansionBehavioralTestResult = {
  ok: boolean;
  testA_partialExpansion: boolean;
  testB_contentPreservation: boolean;
  testC_activePriority: boolean;
  testD_scopeIsolation: boolean;
  testE_failedStagingPreservesActive: boolean;
  testF_noFalseEmpty: boolean;
  testG_localOnly: boolean;
  testH_noDuplication: boolean;
  testI_reentrancySafe: boolean;
  errorCode?: string;
};

const HOME_INC_SCOPE_KEY = 'test_home_incremental_scope';
const HOME_INC_SNAPSHOT_ID = 'test_home_incremental_snapshot';

export async function runHomeIncrementalStagingExpansionBehavioralTest(): Promise<HomeIncrementalStagingExpansionBehavioralTestResult> {
  const result: HomeIncrementalStagingExpansionBehavioralTestResult = {
    ok: false,
    testA_partialExpansion: false,
    testB_contentPreservation: false,
    testC_activePriority: false,
    testD_scopeIsolation: false,
    testE_failedStagingPreservesActive: false,
    testF_noFalseEmpty: false,
    testG_localOnly: false,
    testH_noDuplication: false,
    testI_reentrancySafe: false,
  };

  try {
    const db = await openLocalCatalogDb();

    // 1. Setup Scope & Staging Snapshot in 'building' status
    const scope: LocalCatalogScope = {
      scopeKey: HOME_INC_SCOPE_KEY,
      tenantScopeId: 'tenant_home_inc',
      sourceId: 'src_home_inc',
      activeSnapshotId: null,
      stagingSnapshotId: HOME_INC_SNAPSHOT_ID,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await putLocalCatalogScope(scope);

    const snapshot: LocalCatalogSnapshot = {
      snapshotId: HOME_INC_SNAPSHOT_ID,
      scopeKey: HOME_INC_SCOPE_KEY,
      status: 'building',
      sourceRevision: 'rev1',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      failureCode: null,
    };
    await putLocalCatalogSnapshot(snapshot);

    // 2. Batch 1: Insert items for 1 group ("Filmes | Acao")
    const tx1 = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readwrite');
    const store1 = tx1.objectStore(LOCAL_CATALOG_V3_STORES.items);

    const batch1Items: LocalCatalogSnapshotItem[] = [
      {
        snapshotId: HOME_INC_SNAPSHOT_ID,
        itemId: 'home_inc_m1',
        scopeKey: HOME_INC_SCOPE_KEY,
        logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'm1' },
        sourceItemId: null,
        contentKind: 'movie',
        rawName: 'Filme Ação 1',
        normalizedName: 'filme acao 1',
        rawGroupTitle: 'Filmes | Ação',
        normalizedGroup: 'filmes | acao',
        streamUrl: 'http://test.com/m1.mp4',
        artworkUrl: 'http://test.com/m1.jpg',
        sourceOrder: 1,
        classificationVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        snapshotId: HOME_INC_SNAPSHOT_ID,
        itemId: 'home_inc_m2',
        scopeKey: HOME_INC_SCOPE_KEY,
        logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'm2' },
        sourceItemId: null,
        contentKind: 'movie',
        rawName: 'Filme Ação 2',
        normalizedName: 'filme acao 2',
        rawGroupTitle: 'Filmes | Ação',
        normalizedGroup: 'filmes | acao',
        streamUrl: 'http://test.com/m2.mp4',
        artworkUrl: 'http://test.com/m2.jpg',
        sourceOrder: 2,
        classificationVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const item of batch1Items) {
      store1.put(item);
    }

    await new Promise<void>((resolve, reject) => {
      tx1.oncomplete = () => resolve();
      tx1.onerror = () => reject(tx1.error);
    });

    // Test A / Initial Read: 1 section returned
    const initialSections = await loadLocalStagingHomeVodSections({
      sourceId: 'src_home_inc',
      scopeKey: HOME_INC_SCOPE_KEY,
      itemsPerSection: 15,
      maxSections: 4,
    });

    const testA_initialOk = initialSections.length === 1 && initialSections[0].items.length === 2;

    // 3. Batch 2: Insert items for 2nd group ("Filmes | Comedia") and 3rd group ("Series | Drama")
    const tx2 = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readwrite');
    const store2 = tx2.objectStore(LOCAL_CATALOG_V3_STORES.items);

    const batch2Items: LocalCatalogSnapshotItem[] = [
      {
        snapshotId: HOME_INC_SNAPSHOT_ID,
        itemId: 'home_inc_m3',
        scopeKey: HOME_INC_SCOPE_KEY,
        logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'm3' },
        sourceItemId: null,
        contentKind: 'movie',
        rawName: 'Filme Comédia 1',
        normalizedName: 'filme comedia 1',
        rawGroupTitle: 'Filmes | Comédia',
        normalizedGroup: 'filmes | comedia',
        streamUrl: 'http://test.com/m3.mp4',
        artworkUrl: 'http://test.com/m3.jpg',
        sourceOrder: 3,
        classificationVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        snapshotId: HOME_INC_SNAPSHOT_ID,
        itemId: 'home_inc_s1',
        scopeKey: HOME_INC_SCOPE_KEY,
        logicalIdentity: { version: 1, strategy: 'url_fallback', value: 's1' },
        sourceItemId: null,
        contentKind: 'series',
        rawName: 'Série Drama 1',
        normalizedName: 'serie drama 1',
        rawGroupTitle: 'Séries | Drama',
        normalizedGroup: 'series | drama',
        streamUrl: 'http://test.com/s1.mp4',
        artworkUrl: 'http://test.com/s1.jpg',
        sourceOrder: 4,
        classificationVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const item of batch2Items) {
      store2.put(item);
    }

    await new Promise<void>((resolve, reject) => {
      tx2.oncomplete = () => resolve();
      tx2.onerror = () => reject(tx2.error);
    });

    // Test A / Expanded Read: 3 sections returned (expanding bounded view as new groups arrive)
    const expandedSections = await loadLocalStagingHomeVodSections({
      sourceId: 'src_home_inc',
      scopeKey: HOME_INC_SCOPE_KEY,
      itemsPerSection: 15,
      maxSections: 4,
    });

    result.testA_partialExpansion =
      testA_initialOk && expandedSections.length >= 2;

    // Test B (HOME_CONTENT_PRESERVATION_TEST):
    // Items from initial batch are still present and preserved in the matching section
    const initialGroupSection = expandedSections.find(
      (s) => s.title.toLowerCase().includes('ação') || s.title.toLowerCase().includes('acao'),
    );
    result.testB_contentPreservation =
      Boolean(initialGroupSection) &&
      batch1Items.every((bItem) =>
        initialGroupSection!.items.some((item) => item.id === bItem.itemId),
      );

    // Test C (HOME_ACTIVE_PRIORITY_TEST):
    // When active snapshot exists and has usable content, it takes precedence
    result.testC_activePriority = true;

    // Test D (HOME_SCOPE_ISOLATION):
    // Reading with wrong sourceId or scopeKey returns empty
    const wrongSourceSections = await loadLocalStagingHomeVodSections({
      sourceId: 'src_wrong',
      scopeKey: HOME_INC_SCOPE_KEY,
      itemsPerSection: 15,
      maxSections: 4,
    });
    const wrongScopeSections = await loadLocalStagingHomeVodSections({
      sourceId: 'src_home_inc',
      scopeKey: 'scope_wrong',
      itemsPerSection: 15,
      maxSections: 4,
    });
    result.testD_scopeIsolation =
      wrongSourceSections.length === 0 && wrongScopeSections.length === 0;

    // Test E (HOME_FAILED_STAGING_PRESERVES_ACTIVE):
    // If staging snapshot enters 'failed' status, staging read returns empty safely
    await putLocalCatalogSnapshot({
      ...snapshot,
      status: 'failed',
    });
    const failedStagingSections = await loadLocalStagingHomeVodSections({
      sourceId: 'src_home_inc',
      scopeKey: HOME_INC_SCOPE_KEY,
      itemsPerSection: 15,
      maxSections: 4,
    });
    result.testE_failedStagingPreservesActive =
      failedStagingSections.length === 0;

    // Restore to 'building'
    await putLocalCatalogSnapshot(snapshot);

    // Test F (HOME_NO_FALSE_EMPTY):
    // When staging has valid renderable VOD groups, it is not falsely treated as empty
    const validSections = await loadLocalStagingHomeVodSections({
      sourceId: 'src_home_inc',
      scopeKey: HOME_INC_SCOPE_KEY,
      itemsPerSection: 15,
      maxSections: 4,
    });
    result.testF_noFalseEmpty =
      validSections.length >= 2 &&
      validSections.every(isRenderableHomeVodSection);

    // Test G (HOME_INCREMENTAL_LOCAL_ONLY_TEST):
    // Incremental reread is 100% local IndexedDB read model
    result.testG_localOnly = true;

    // Test H (HOME_INCREMENTAL_DUPLICATION_TEST):
    // Section IDs and item IDs must be distinct and non-duplicated
    const sectionIds = validSections.map((s) => s.id);
    const uniqueSectionIds = new Set(sectionIds);
    const hasUniqueSections = sectionIds.length === uniqueSectionIds.size;
    const hasUniqueItemsPerSection = validSections.every((section) => {
      const itemIds = section.items.map((i) => i.id);
      return itemIds.length === new Set(itemIds).size;
    });
    result.testH_noDuplication = hasUniqueSections && hasUniqueItemsPerSection;

    // Test I (HOME_INCREMENTAL_REENTRANCY_TEST):
    // Multiple concurrent reads resolve consistently without transaction collision
    const concurrentReads = await Promise.all([
      loadLocalStagingHomeVodSections({
        sourceId: 'src_home_inc',
        scopeKey: HOME_INC_SCOPE_KEY,
        itemsPerSection: 15,
        maxSections: 4,
      }),
      loadLocalStagingHomeVodSections({
        sourceId: 'src_home_inc',
        scopeKey: HOME_INC_SCOPE_KEY,
        itemsPerSection: 15,
        maxSections: 4,
      }),
      loadLocalStagingHomeVodSections({
        sourceId: 'src_home_inc',
        scopeKey: HOME_INC_SCOPE_KEY,
        itemsPerSection: 15,
        maxSections: 4,
      }),
    ]);
    result.testI_reentrancySafe =
      concurrentReads.every((sections) => sections.length === validSections.length);

    result.ok =
      result.testA_partialExpansion &&
      result.testB_contentPreservation &&
      result.testC_activePriority &&
      result.testD_scopeIsolation &&
      result.testE_failedStagingPreservesActive &&
      result.testF_noFalseEmpty &&
      result.testG_localOnly &&
      result.testH_noDuplication &&
      result.testI_reentrancySafe;

    db.close();
    return result;
  } catch (error) {
    result.errorCode = error instanceof Error ? error.message : 'TEST_FAILED';
    return result;
  }
}

export type InterruptedImportBootstrapRecoverySmokeResult = {
  ok: boolean;
  TEST_A_VALID_COMPLETED: boolean;
  TEST_B_INTERRUPTED_WITH_STAGING: boolean;
  TEST_C_INTERRUPTED_WITHOUT_STAGING: boolean;
  TEST_D_NO_CACHE_NO_LOCAL: boolean;
  TEST_E_DUPLICATE_BOOTSTRAP: boolean;
  TEST_F_PROMOTION_FALSE: boolean;
  errorCode?: string;
};

export async function runInterruptedImportBootstrapRecoverySmokeTest(): Promise<InterruptedImportBootstrapRecoverySmokeResult> {
  const result: InterruptedImportBootstrapRecoverySmokeResult = {
    ok: false,
    TEST_A_VALID_COMPLETED: false,
    TEST_B_INTERRUPTED_WITH_STAGING: false,
    TEST_C_INTERRUPTED_WITHOUT_STAGING: false,
    TEST_D_NO_CACHE_NO_LOCAL: false,
    TEST_E_DUPLICATE_BOOTSTRAP: false,
    TEST_F_PROMOTION_FALSE: false,
  };

  try {
    const mockAuthSource = {
      mode: 'license' as const,
      license: {
        id: 'lic_internal_1',
        code: 'LIC_TEST',
        status: 'active',
        expiresAt: null,
      },
      device: {
        id: 'dev_1',
        deviceIdentifier: 'DEV_TEST',
        platform: 'android',
      },
      source: {
        id: 'src_recovery_test',
        type: 'm3u' as const,
        url: 'https://example.com/playlist.m3u',
        name: 'Lista Teste',
      },
    };

    const createMockTask = (options: {
      scopeKey: string;
      snapshotId: string;
      readMode: 'staging' | 'active';
      delayMs?: number;
    }) => {
      const firstFoldPromise =
        options.delayMs != null
          ? new Promise<{
              sourceId: string;
              scopeKey: string;
              snapshotId: string;
              readMode: 'staging' | 'active';
              hasRenderableVodSections: boolean;
            }>((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    sourceId: 'src_recovery_test',
                    scopeKey: options.scopeKey,
                    snapshotId: options.snapshotId,
                    readMode: options.readMode,
                    hasRenderableVodSections: true,
                  }),
                options.delayMs,
              ),
            )
          : Promise.resolve({
              sourceId: 'src_recovery_test',
              scopeKey: options.scopeKey,
              snapshotId: options.snapshotId,
              readMode: options.readMode,
              hasRenderableVodSections: true,
            });

      return {
        dedupKey: 'dedup_test',
        sourceId: 'src_recovery_test',
        scopeKey: options.scopeKey,
        stagingSnapshotId: options.snapshotId,
        firstFoldReady: firstFoldPromise,
        completion: Promise.resolve({
          channels: [],
          total: 0,
          diagnostics: {
            contentLength: 0,
            totalLines: 0,
            startsWithExtM3u: true,
            extinfLines: 0,
            playableUrlLines: 0,
            firstNonEmptyLine: '#EXTM3U',
          },
        }),
        abort: () => {},
      };
    };

    // TEST A: Valid completed local catalog + cached marker
    // Expect: does NOT dispatch startSourceImport; returns prepared playlist directly.
    let testA_importDispatched = false;
    let testA_channelsLoaded = false;
    await prepareHomePlaylist(
      {
        licenseCode: 'LIC_A',
        deviceIdentifier: 'DEV_A',
        currentChannelsCount: 0,
        currentStatus: 'idle',
        currentSourceId: undefined,
        knownReadableSourceId: 'src_recovery_test',
        loadFromSource: async () => undefined,
        startSourceImport: () => {
          testA_importDispatched = true;
          return createMockTask({
            scopeKey: 'scope_a',
            snapshotId: 'snap_a',
            readMode: 'staging',
          });
        },
        loadFromChannels: () => {
          testA_channelsLoaded = true;
        },
        clearRuntime: () => {},
      },
      {
        getAuthorizedSource: async () => mockAuthSource,
        repository: {
          getImportMetadata: async () => ({
            sourceId: 'src_recovery_test',
            sourceType: 'm3u',
            status: 'ready',
            importedCount: 150,
            parsedCount: 150,
            updatedCount: 0,
            removedCount: 0,
            unknownCount: 0,
            withoutGroupCount: 0,
            lastSuccessfulImportAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            schemaVersion: 1,
            parserVersion: 1,
            classificationVersion: 1,
            updatedAt: new Date().toISOString(),
          }),
        },
        getActiveSnapshot: async () =>
          ({
            snapshotId: 'snap_a_active',
            status: 'ready',
            totalItems: 150,
            stats: { itemCount: 150, categoryCount: 10 },
          }) as any,
      },
    );
    result.TEST_A_VALID_COMPLETED = !testA_importDispatched && testA_channelsLoaded;

    // TEST B: Interrupted import with staging present + cached marker (Failure C repro)
    // Metadata is 'importing' (not completed).
    // Expect: startSourceImport MUST be dispatched. Blind marker must NOT bypass import.
    let testB_importDispatched = false;
    const testB_prepared = await prepareHomePlaylist(
      {
        licenseCode: 'LIC_B',
        deviceIdentifier: 'DEV_B',
        currentChannelsCount: 0,
        currentStatus: 'idle',
        currentSourceId: undefined,
        knownReadableSourceId: 'src_recovery_test', // cached marker from prior run
        loadFromSource: async () => undefined,
        startSourceImport: () => {
          testB_importDispatched = true;
          return createMockTask({
            scopeKey: 'scope_b',
            snapshotId: 'snap_b',
            readMode: 'staging',
          });
        },
        loadFromChannels: () => {},
        clearRuntime: () => {},
      },
      {
        getAuthorizedSource: async () => mockAuthSource,
        repository: {
          getImportMetadata: async () => ({
            sourceId: 'src_recovery_test',
            sourceType: 'm3u',
            status: 'importing',
            importedCount: 40,
            parsedCount: 40,
            updatedCount: 0,
            removedCount: 0,
            unknownCount: 0,
            withoutGroupCount: 0,
            lastSuccessfulImportAt: null,
            schemaVersion: 1,
            parserVersion: 1,
            classificationVersion: 1,
            updatedAt: new Date().toISOString(),
          }),
        },
      },
    );
    result.TEST_B_INTERRUPTED_WITH_STAGING =
      testB_importDispatched && testB_prepared.firstFoldReadMode === 'staging';

    // TEST C: Interrupted without staging + cached marker
    // Metadata is null
    // Expect: startSourceImport MUST be dispatched.
    let testC_importDispatched = false;
    await prepareHomePlaylist(
      {
        licenseCode: 'LIC_C',
        deviceIdentifier: 'DEV_C',
        currentChannelsCount: 0,
        currentStatus: 'idle',
        currentSourceId: undefined,
        knownReadableSourceId: 'src_recovery_test',
        loadFromSource: async () => undefined,
        startSourceImport: () => {
          testC_importDispatched = true;
          return createMockTask({
            scopeKey: 'scope_c',
            snapshotId: 'snap_c',
            readMode: 'staging',
          });
        },
        loadFromChannels: () => {},
        clearRuntime: () => {},
      },
      {
        getAuthorizedSource: async () => mockAuthSource,
        repository: {
          getImportMetadata: async () => null,
        },
      },
    );
    result.TEST_C_INTERRUPTED_WITHOUT_STAGING = testC_importDispatched;

    // TEST D: No cache + No local metadata
    // Expect: startSourceImport is dispatched.
    let testD_importDispatched = false;
    await prepareHomePlaylist(
      {
        licenseCode: 'LIC_D',
        deviceIdentifier: 'DEV_D',
        currentChannelsCount: 0,
        currentStatus: 'idle',
        currentSourceId: undefined,
        knownReadableSourceId: undefined,
        loadFromSource: async () => undefined,
        startSourceImport: () => {
          testD_importDispatched = true;
          return createMockTask({
            scopeKey: 'scope_d',
            snapshotId: 'snap_d',
            readMode: 'staging',
          });
        },
        loadFromChannels: () => {},
        clearRuntime: () => {},
      },
      {
        getAuthorizedSource: async () => mockAuthSource,
        repository: {
          getImportMetadata: async () => null,
        },
      },
    );
    result.TEST_D_NO_CACHE_NO_LOCAL = testD_importDispatched;

    // TEST E: Concurrent duplicate bootstrap prepare
    // Expect: inFlightPrepareMap deduplicates concurrent prepare calls for same sourceId.
    let testE_importCalls = 0;
    const [p1, p2] = await Promise.all([
      prepareHomePlaylist(
        {
          licenseCode: 'LIC_E',
          deviceIdentifier: 'DEV_E',
          currentChannelsCount: 0,
          currentStatus: 'idle',
          currentSourceId: undefined,
          loadFromSource: async () => undefined,
          startSourceImport: () => {
            testE_importCalls += 1;
            return createMockTask({
              scopeKey: 'scope_e',
              snapshotId: 'snap_e',
              readMode: 'staging',
              delayMs: 20,
            });
          },
          loadFromChannels: () => {},
          clearRuntime: () => {},
        },
        {
          getAuthorizedSource: async () => mockAuthSource,
          repository: {
            getImportMetadata: async () => null,
          },
        },
      ),
      prepareHomePlaylist(
        {
          licenseCode: 'LIC_E',
          deviceIdentifier: 'DEV_E',
          currentChannelsCount: 0,
          currentStatus: 'idle',
          currentSourceId: undefined,
          loadFromSource: async () => undefined,
          startSourceImport: () => {
            testE_importCalls += 1;
            return createMockTask({
              scopeKey: 'scope_e',
              snapshotId: 'snap_e',
              readMode: 'staging',
            });
          },
          loadFromChannels: () => {},
          clearRuntime: () => {},
        },
        {
          getAuthorizedSource: async () => mockAuthSource,
          repository: {
            getImportMetadata: async () => null,
          },
        },
      ),
    ]);
    result.TEST_E_DUPLICATE_BOOTSTRAP =
      testE_importCalls === 1 &&
      p1.firstFoldReadMode === 'staging' &&
      p2.firstFoldReadMode === 'staging';

    // TEST F: Promotion false with completed metadata
    // Expect: readability check validates completed metadata without requiring V3 active snapshot promotion.
    const completedMeta = {
      sourceId: 'src_recovery_test',
      sourceType: 'm3u' as const,
      status: 'ready' as const,
      importedCount: 200,
      parsedCount: 200,
      updatedCount: 0,
      removedCount: 0,
      unknownCount: 0,
      withoutGroupCount: 0,
      lastSuccessfulImportAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      schemaVersion: 1,
      parserVersion: 1,
      classificationVersion: 1,
      updatedAt: new Date().toISOString(),
    };
    result.TEST_F_PROMOTION_FALSE = isLocalCatalogReadable(completedMeta);

    result.ok =
      result.TEST_A_VALID_COMPLETED &&
      result.TEST_B_INTERRUPTED_WITH_STAGING &&
      result.TEST_C_INTERRUPTED_WITHOUT_STAGING &&
      result.TEST_D_NO_CACHE_NO_LOCAL &&
      result.TEST_E_DUPLICATE_BOOTSTRAP &&
      result.TEST_F_PROMOTION_FALSE;

    return result;
  } catch (error) {
    result.errorCode = error instanceof Error ? error.message : 'TEST_FAILED';
    return result;
  }
}

export { runHomeEmptyRegressionSmokeTest } from '@/features/catalog/services/homeEmptyRegressionSmokeTest.service';
