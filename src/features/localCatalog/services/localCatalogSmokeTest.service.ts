import type {
  LocalCatalogContentKind,
  LocalCatalogItem,
  LocalCatalogStats,
} from '../types/localCatalog.types';
import {
  deleteLocalCatalogItems,
  getLocalCatalogStats,
  listLocalCatalogItems,
  openLocalCatalogDb,
  putLocalCatalogItems,
} from './localCatalogDb.service';

export type LocalCatalogSmokeTestResult = {
  ok: boolean;
  insertedCount: number;
  stats?: LocalCatalogStats;
  liveCount: number;
  movieCount: number;
  seriesCount: number;
  errorMessage?: string;
  createdAt?: string;
  sourceId?: string;
  storageWriteError?: string;
};

export const LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY =
  'xandeflix:local-catalog-smoke:last-result';

const SMOKE_TEST_SOURCE_ID = 'smoke-test-source';
const SMOKE_TEST_GROUP_TITLE = 'Smoke Test Local Catalog';

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function createSmokeTestItem(
  contentKind: LocalCatalogContentKind,
  name: string,
  streamUrl: string,
): LocalCatalogItem {
  const now = new Date().toISOString();

  return {
    id: `${SMOKE_TEST_SOURCE_ID}:${contentKind}`,
    sourceId: SMOKE_TEST_SOURCE_ID,
    name,
    normalizedName: normalizeName(name),
    groupTitle: SMOKE_TEST_GROUP_TITLE,
    contentKind,
    streamUrl,
    tvgId: `smoke-${contentKind}`,
    tvgName: name,
    tvgLogo: null,
    seriesName: contentKind === 'series' ? 'Smoke Series' : null,
    seasonNumber: contentKind === 'series' ? 1 : null,
    episodeNumber: contentKind === 'series' ? 1 : null,
    createdAt: now,
    updatedAt: now,
  };
}

function createSmokeTestItems() {
  return [
    createSmokeTestItem(
      'live',
      'Smoke Live Channel',
      'https://example.invalid/smoke/live.m3u8',
    ),
    createSmokeTestItem(
      'movie',
      'Smoke Movie',
      'https://example.invalid/smoke/movie.mp4',
    ),
    createSmokeTestItem(
      'series',
      'Smoke Series S01E01',
      'https://example.invalid/smoke/series-s01e01.mp4',
    ),
  ];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'LOCAL_CATALOG_SMOKE_TEST_FAILED';
}

function countSmokeItems(items: LocalCatalogItem[], contentKind: LocalCatalogContentKind) {
  return items.filter(
    (item) =>
      item.sourceId === SMOKE_TEST_SOURCE_ID &&
      item.groupTitle === SMOKE_TEST_GROUP_TITLE &&
      item.contentKind === contentKind,
  ).length;
}

export async function runLocalCatalogSmokeTest(): Promise<LocalCatalogSmokeTestResult> {
  const smokeItems = createSmokeTestItems();
  const smokeItemIds = smokeItems.map((item) => item.id);
  let insertedCount = 0;
  let result: LocalCatalogSmokeTestResult = {
    ok: false,
    insertedCount,
    liveCount: 0,
    movieCount: 0,
    seriesCount: 0,
  };

  try {
    const db = await openLocalCatalogDb();
    db.close();

    await putLocalCatalogItems(smokeItems);
    insertedCount = smokeItems.length;

    const [stats, liveItems, movieItems, seriesItems] = await Promise.all([
      getLocalCatalogStats(),
      listLocalCatalogItems({
        contentKind: 'live',
        groupTitle: SMOKE_TEST_GROUP_TITLE,
      }),
      listLocalCatalogItems({
        contentKind: 'movie',
        groupTitle: SMOKE_TEST_GROUP_TITLE,
      }),
      listLocalCatalogItems({
        contentKind: 'series',
        groupTitle: SMOKE_TEST_GROUP_TITLE,
      }),
    ]);

    const liveCount = countSmokeItems(liveItems, 'live');
    const movieCount = countSmokeItems(movieItems, 'movie');
    const seriesCount = countSmokeItems(seriesItems, 'series');

    result = {
      ok: insertedCount === 3 && liveCount === 1 && movieCount === 1 && seriesCount === 1,
      insertedCount,
      stats,
      liveCount,
      movieCount,
      seriesCount,
    };
  } catch (error) {
    result = {
      ok: false,
      insertedCount,
      liveCount: 0,
      movieCount: 0,
      seriesCount: 0,
      errorMessage: getErrorMessage(error),
    };
  }

  try {
    await deleteLocalCatalogItems(smokeItemIds);
  } catch (cleanupError) {
    result = {
      ...result,
      ok: false,
      errorMessage: result.errorMessage
        ? `${result.errorMessage}; cleanup: ${getErrorMessage(cleanupError)}`
        : `cleanup: ${getErrorMessage(cleanupError)}`,
    };
  }

  const finalResult: LocalCatalogSmokeTestResult = {
    ...result,
    createdAt: new Date().toISOString(),
    sourceId: SMOKE_TEST_SOURCE_ID,
  };

  try {
    window.localStorage.setItem(
      LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY,
      JSON.stringify(finalResult),
    );
  } catch (storageError) {
    finalResult.storageWriteError =
      storageError instanceof Error
        ? storageError.message
        : 'LOCAL_STORAGE_WRITE_FAILED';
  }

  return finalResult;
}
