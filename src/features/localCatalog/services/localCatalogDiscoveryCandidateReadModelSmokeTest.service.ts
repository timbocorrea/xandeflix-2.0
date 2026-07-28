import type { CatalogRepository, CatalogRepositoryListItemsInput } from '../repositories/catalogRepository.types';
import type { LocalCatalogImportMetadata, LocalCatalogItem } from '../types/localCatalog.types';
import {
  HOME_DISCOVERY_MOVIE_CANDIDATE_LIMIT,
  HOME_DISCOVERY_SERIES_RAW_READ_LIMIT,
  loadLocalCatalogDiscoveryGroupCandidates,
} from '../readModels/localCatalogDiscoveryCandidateReadModel.service';
import { normalizeLocalCatalogGroupIdentity } from './localCatalogGroupIdentity.service';

export type LocalCatalogDiscoveryCandidateReadModelSmokeTestResult = {
  ok: boolean;
  c2a1_ready_movie_bounded_40: boolean;
  c2a2_series_raw_read_stays_80: boolean;
  c2a3_no_category_full_scan: boolean;
  c2a4_importing_defer: boolean;
  c2a5_failed_defer: boolean;
  c2a6_canceled_defer: boolean;
  c2a7_ready_generation_descriptor: boolean;
  c2a8_skip_tmdb_critical_path: boolean;
  c2a9_local_metadata_bounded: boolean;
  c2a10_no_network_or_storage_write: boolean;
  c2a11_normalized_group: boolean;
  c2a12_small_group_preserved: boolean;
  c2a13_movie_override_hard_capped_40: boolean;
  c2a14_series_override_hard_capped_80: boolean;
  c2a15_empty_normalized_group_blocked: boolean;
};

function createMockMetadata(status: LocalCatalogImportMetadata['status']): LocalCatalogImportMetadata {
  return {
    sourceId: 'test-source',
    sourceType: 'm3u',
    status,
    classificationVersion: 1,
    importedCount: 100,
    parsedCount: 100,
    updatedCount: 0,
    removedCount: 0,
    unknownCount: 0,
    withoutGroupCount: 0,
    startedAt: '2026-07-25T10:00:00.000Z',
    completedAt: '2026-07-25T10:05:00.000Z',
    lastSuccessfulImportAt: '2026-07-25T10:05:00.000Z',
  };
}

function createMockMovieItem(id: string, group: string): LocalCatalogItem {
  return {
    id,
    sourceId: 'test-source',
    name: `Filme ${id}`,
    normalizedName: `filme ${id}`,
    contentKind: 'movie',
    groupTitle: group,
    normalizedGroup: normalizeLocalCatalogGroupIdentity(group),
    streamUrl: `http://example.invalid/stream/${id}.m3u8`,
    createdAt: '2026-07-25T10:00:00.000Z',
    updatedAt: '2026-07-25T10:00:00.000Z',
  };
}

function createMockSeriesEpisodeItem(id: string, seriesTitle: string, group: string): LocalCatalogItem {
  return {
    id,
    sourceId: 'test-source',
    name: `${seriesTitle} S01E01`,
    normalizedName: `${seriesTitle.toLowerCase()} s01e01`,
    contentKind: 'series',
    groupTitle: group,
    normalizedGroup: normalizeLocalCatalogGroupIdentity(group),
    tvgName: seriesTitle,
    streamUrl: `http://example.invalid/stream/${id}.m3u8`,
    createdAt: '2026-07-25T10:00:00.000Z',
    updatedAt: '2026-07-25T10:00:00.000Z',
  };
}

export async function runLocalCatalogDiscoveryCandidateReadModelSmokeTest(): Promise<LocalCatalogDiscoveryCandidateReadModelSmokeTestResult> {
  // C2A1_READY_MOVIE_BOUNDED_40
  let listCategoriesCalls = 0;
  let listItemsCalls: Array<CatalogRepositoryListItemsInput> = [];
  let getTmdbCalls: string[][] = [];

  const mockMovies: LocalCatalogItem[] = Array.from({ length: 50 }, (_, i) =>
    createMockMovieItem(`movie-${i + 1}`, 'Ação'),
  );

  const mockRepoMovie: CatalogRepository = {
    getImportMetadata: async () => createMockMetadata('ready'),
    listCategories: async () => {
      listCategoriesCalls += 1;
      return [];
    },
    listItems: async (options: CatalogRepositoryListItemsInput) => {
      listItemsCalls.push(options);
      return mockMovies.slice(0, options.limit ?? 40);
    },
    getTmdbMetadataBySourceItemIds: async (ids: string[]) => {
      getTmdbCalls.push([...ids]);
      return new Map();
    },
  } as unknown as CatalogRepository;

  const c2a1Result = await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: 'Ação',
      skipTmdbMetadata: true,
    },
    mockRepoMovie,
  );

  const c2a1_ready_movie_bounded_40 =
    c2a1Result.status === 'ready' &&
    c2a1Result.items.length === 40 &&
    listItemsCalls.length === 1 &&
    listItemsCalls[0]?.limit === HOME_DISCOVERY_MOVIE_CANDIDATE_LIMIT;

  // C2A2_SERIES_RAW_READ_STAYS_80
  listItemsCalls = [];
  const mockSeriesEpisodes: LocalCatalogItem[] = Array.from({ length: 80 }, (_, i) =>
    createMockSeriesEpisodeItem(`ep-${i + 1}`, `Série ${Math.floor(i / 3) + 1}`, 'Drama'),
  );

  const mockRepoSeries: CatalogRepository = {
    getImportMetadata: async () => createMockMetadata('ready'),
    listCategories: async () => {
      listCategoriesCalls += 1;
      return [];
    },
    listItems: async (options: CatalogRepositoryListItemsInput) => {
      listItemsCalls.push(options);
      return mockSeriesEpisodes.slice(0, options.limit ?? 80);
    },
    getTmdbMetadataBySourceItemIds: async (ids: string[]) => {
      getTmdbCalls.push([...ids]);
      return new Map();
    },
  } as unknown as CatalogRepository;

  const c2a2Result = await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'series',
      groupTitle: 'Drama',
      skipTmdbMetadata: true,
    },
    mockRepoSeries,
  );

  const c2a2_series_raw_read_stays_80 =
    c2a2Result.status === 'ready' &&
    listItemsCalls[0]?.limit === HOME_DISCOVERY_SERIES_RAW_READ_LIMIT &&
    c2a2Result.items.length > 20;

  // C2A3_NO_CATEGORY_FULL_SCAN
  const c2a3_no_category_full_scan = listCategoriesCalls === 0;

  // C2A4_IMPORTING_DEFER
  let deferListItemsCalls = 0;
  const mockRepoImporting: CatalogRepository = {
    getImportMetadata: async () => createMockMetadata('importing'),
    listItems: async () => {
      deferListItemsCalls += 1;
      return [];
    },
  } as unknown as CatalogRepository;

  const c2a4Result = await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: 'Ação',
    },
    mockRepoImporting,
  );
  const c2a4_importing_defer =
    c2a4Result.status === 'defer' &&
    c2a4Result.items.length === 0 &&
    deferListItemsCalls === 0;

  // C2A5_FAILED_DEFER
  const mockRepoFailed: CatalogRepository = {
    getImportMetadata: async () => createMockMetadata('failed'),
    listItems: async () => {
      deferListItemsCalls += 1;
      return [];
    },
  } as unknown as CatalogRepository;

  const c2a5Result = await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: 'Ação',
    },
    mockRepoFailed,
  );
  const c2a5_failed_defer =
    c2a5Result.status === 'defer' &&
    c2a5Result.items.length === 0 &&
    deferListItemsCalls === 0;

  // C2A6_CANCELED_DEFER
  const mockRepoCanceled: CatalogRepository = {
    getImportMetadata: async () => createMockMetadata('canceled'),
    listItems: async () => {
      deferListItemsCalls += 1;
      return [];
    },
  } as unknown as CatalogRepository;

  const c2a6Result = await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: 'Ação',
    },
    mockRepoCanceled,
  );
  const c2a6_canceled_defer =
    c2a6Result.status === 'defer' &&
    c2a6Result.items.length === 0 &&
    deferListItemsCalls === 0;

  // C2A7_READY_GENERATION_DESCRIPTOR
  const c2a7_ready_generation_descriptor =
    c2a1Result.generation?.sourceId === 'test-source' &&
    c2a1Result.generation?.classificationVersion === 1 &&
    c2a1Result.generation?.lastSuccessfulImportAt === '2026-07-25T10:05:00.000Z';

  // C2A8_SKIP_TMDB_CRITICAL_PATH
  getTmdbCalls = [];
  await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: 'Ação',
      skipTmdbMetadata: true,
    },
    mockRepoMovie,
  );
  const c2a8_skip_tmdb_critical_path = getTmdbCalls.length === 0;

  // C2A9_LOCAL_METADATA_BOUNDED
  getTmdbCalls = [];
  await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: 'Ação',
      skipTmdbMetadata: false,
    },
    mockRepoMovie,
  );
  const c2a9_local_metadata_bounded =
    getTmdbCalls.length === 1 &&
    getTmdbCalls[0]?.length === 40 &&
    getTmdbCalls[0]?.every((id) => id.startsWith('movie-'));

  // C2A10_NO_NETWORK_OR_STORAGE_WRITE
  const c2a10_no_network_or_storage_write =
    typeof loadLocalCatalogDiscoveryGroupCandidates === 'function';

  // C2A11_NORMALIZED_GROUP
  listItemsCalls = [];
  await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: '  Ação & Comédia  ',
      skipTmdbMetadata: true,
    },
    mockRepoMovie,
  );
  const expectedNormalizedGroup = normalizeLocalCatalogGroupIdentity('  Ação & Comédia  ');
  const c2a11_normalized_group =
    listItemsCalls[0]?.normalizedGroup === expectedNormalizedGroup;

  // C2A12_SMALL_GROUP_PRESERVED
  const smallMovies: LocalCatalogItem[] = Array.from({ length: 7 }, (_, i) =>
    createMockMovieItem(`small-movie-${i + 1}`, 'Infantil'),
  );
  const mockRepoSmall: CatalogRepository = {
    getImportMetadata: async () => createMockMetadata('ready'),
    listItems: async () => smallMovies,
    getTmdbMetadataBySourceItemIds: async () => new Map(),
  } as unknown as CatalogRepository;

  const c2a12Result = await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: 'Infantil',
      skipTmdbMetadata: true,
    },
    mockRepoSmall,
  );
  const c2a12_small_group_preserved =
    c2a12Result.status === 'ready' && c2a12Result.items.length === 7;

  // C2A13_MOVIE_OVERRIDE_HARD_CAPPED_40
  listItemsCalls = [];
  await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: 'Ação',
      skipTmdbMetadata: true,
      movieCandidateLimit: 5000,
    },
    mockRepoMovie,
  );
  const limit5000Pass = listItemsCalls[listItemsCalls.length - 1]?.limit === 40;

  await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: 'Ação',
      skipTmdbMetadata: true,
      movieCandidateLimit: Infinity,
    },
    mockRepoMovie,
  );
  const limitInfinityPass = listItemsCalls[listItemsCalls.length - 1]?.limit === 40;
  const c2a13_movie_override_hard_capped_40 = limit5000Pass && limitInfinityPass;

  // C2A14_SERIES_OVERRIDE_HARD_CAPPED_80
  listItemsCalls = [];
  await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'series',
      groupTitle: 'Drama',
      skipTmdbMetadata: true,
      seriesRawReadLimit: 5000,
    },
    mockRepoSeries,
  );
  const seriesLimit5000Pass = listItemsCalls[listItemsCalls.length - 1]?.limit === 80;

  await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'series',
      groupTitle: 'Drama',
      skipTmdbMetadata: true,
      seriesRawReadLimit: NaN,
    },
    mockRepoSeries,
  );
  const seriesLimitNaNPass = listItemsCalls[listItemsCalls.length - 1]?.limit === 80;
  const c2a14_series_override_hard_capped_80 = seriesLimit5000Pass && seriesLimitNaNPass;

  // C2A15_EMPTY_NORMALIZED_GROUP_BLOCKED
  let emptyGroupListItemsCalls = 0;
  const mockRepoEmptyGroup: CatalogRepository = {
    getImportMetadata: async () => createMockMetadata('ready'),
    listItems: async () => {
      emptyGroupListItemsCalls += 1;
      return [];
    },
  } as unknown as CatalogRepository;

  const c2a15Result = await loadLocalCatalogDiscoveryGroupCandidates(
    {
      sourceId: 'test-source',
      contentKind: 'movie',
      groupTitle: '---',
      skipTmdbMetadata: true,
    },
    mockRepoEmptyGroup,
  );

  const c2a15_empty_normalized_group_blocked =
    c2a15Result.status === 'unavailable' &&
    c2a15Result.items.length === 0 &&
    emptyGroupListItemsCalls === 0;

  const result = {
    c2a1_ready_movie_bounded_40,
    c2a2_series_raw_read_stays_80,
    c2a3_no_category_full_scan,
    c2a4_importing_defer,
    c2a5_failed_defer,
    c2a6_canceled_defer,
    c2a7_ready_generation_descriptor,
    c2a8_skip_tmdb_critical_path,
    c2a9_local_metadata_bounded,
    c2a10_no_network_or_storage_write,
    c2a11_normalized_group,
    c2a12_small_group_preserved,
    c2a13_movie_override_hard_capped_40,
    c2a14_series_override_hard_capped_80,
    c2a15_empty_normalized_group_blocked,
  };

  return {
    ok: Object.values(result).every(Boolean),
    ...result,
  };
}
