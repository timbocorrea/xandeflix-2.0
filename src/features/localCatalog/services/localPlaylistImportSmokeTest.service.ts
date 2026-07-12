import {
  deleteLocalCatalogItems,
  getLocalCatalogStats,
  listLocalCatalogItems,
} from './localCatalogDb.service';
import { importPlaylistToLocalCatalog } from './localPlaylistImport.service';
import { listLocalCatalogCategories } from './localCatalogCategoryIndex.service';
import { getSafeLocalCatalogArtworkUrl } from '../readModels/localCatalogHomeVodAdapter.service';
import type { LocalCatalogStats } from '../types/localCatalog.types';
import type { LocalPlaylistImportProgress } from '../types/localPlaylistImport.types';

export type LocalPlaylistImportSmokeTestResult = {
  ok: boolean;
  sourceId: string;
  finalProgress: LocalPlaylistImportProgress;
  stats: LocalCatalogStats;
  listedCount: number;
  progressEventsCount: number;
  withoutExtinfPreserved: boolean;
  unknownPreserved: boolean;
  uncategorizedCreated: boolean;
  dynamicGroupVisible: boolean;
  opaqueIds: boolean;
  unsafeLogoRejected: boolean;
  errorCode?: string;
};

const SMOKE_TEST_SOURCE_ID = 'local-playlist-import-smoke-test-source';

const SMOKE_TEST_PLAYLIST = `#EXTM3U
#EXTINF:-1 tvg-id="movie-1" tvg-logo="https://media.example.invalid/poster.jpg" group-title="Cinema Teste", Filme de Exemplo 2025
https://stream.example.invalid/movie-1.m3u8
#EXTINF:-1 group-title="", Filme Sem Grupo 2025
https://stream.example.invalid/ungrouped.m3u8
https://stream.example.invalid/no-extinf.ts
#EXTINF:-1 tvg-logo="javascript:alert(1)" group-title="Grupo Não Predefinido", Conteúdo Desconhecido
https://stream.example.invalid/unknown.m3u8
`;

function emptyStats(): LocalCatalogStats {
  return {
    playlistItemsCount: 0,
    catalogMetadataCount: 0,
    tmdbMetadataCount: 0,
    byContentKind: {
      live: 0,
      movie: 0,
      series: 0,
      series_episode: 0,
      radio: 0,
      unknown: 0,
    },
  };
}

async function cleanupSmokeSource() {
  const existingItems = await listLocalCatalogItems({
    sourceId: SMOKE_TEST_SOURCE_ID,
  });
  await deleteLocalCatalogItems(existingItems.map((item) => item.id));
}

export async function runLocalPlaylistImportSmokeTest(): Promise<LocalPlaylistImportSmokeTestResult> {
  const progressEvents: LocalPlaylistImportProgress[] = [];

  try {
    await cleanupSmokeSource();

    const result = await importPlaylistToLocalCatalog({
      sourceId: SMOKE_TEST_SOURCE_ID,
      sourceType: 'm3u',
      playlistText: SMOKE_TEST_PLAYLIST,
      batchSize: 2,
      onProgress: (progress) => {
        progressEvents.push(progress);
      },
    });

    const [stats, listedItems, movieCategories] = await Promise.all([
      getLocalCatalogStats(),
      listLocalCatalogItems({ sourceId: SMOKE_TEST_SOURCE_ID, limit: 10 }),
      listLocalCatalogCategories({
        sourceId: SMOKE_TEST_SOURCE_ID,
        contentKind: 'movie',
      }),
    ]);
    const withoutExtinfPreserved = listedItems.some(
      (item) => item.rawName === 'Canal 3' && item.contentKind === 'unknown',
    );
    const unknownPreserved =
      listedItems.filter((item) => item.contentKind === 'unknown').length === 2;
    const uncategorizedCreated = movieCategories.some(
      (category) =>
        category.isUncategorized && category.title === 'Não categorizados',
    );
    const dynamicGroupVisible = listedItems.some(
      (item) => item.groupTitle === 'Grupo Não Predefinido',
    );
    const opaqueIds = listedItems.every(
      (item) =>
        /^uc_[a-f0-9]{64}$/.test(item.id) &&
        !item.id.includes(SMOKE_TEST_SOURCE_ID),
    );
    const unsafeLogoRejected =
      getSafeLocalCatalogArtworkUrl('javascript:alert(1)') === undefined &&
      getSafeLocalCatalogArtworkUrl(
        'https://media.example.invalid/poster.jpg',
      ) !== undefined;
    const ok =
      result.progress.status === 'ready' &&
      result.progress.inserted + result.progress.updated === 4 &&
      listedItems.length === 4 &&
      withoutExtinfPreserved &&
      unknownPreserved &&
      uncategorizedCreated &&
      dynamicGroupVisible &&
      opaqueIds &&
      unsafeLogoRejected;

    await cleanupSmokeSource();

    return {
      ok,
      sourceId: SMOKE_TEST_SOURCE_ID,
      finalProgress: result.progress,
      stats,
      listedCount: listedItems.length,
      progressEventsCount: progressEvents.length,
      withoutExtinfPreserved,
      unknownPreserved,
      uncategorizedCreated,
      dynamicGroupVisible,
      opaqueIds,
      unsafeLogoRejected,
      errorCode: ok
        ? undefined
        : 'LOCAL_PLAYLIST_IMPORT_SMOKE_TEST_ASSERTION_FAILED',
    };
  } catch {
    await cleanupSmokeSource().catch(() => undefined);

    return {
      ok: false,
      sourceId: SMOKE_TEST_SOURCE_ID,
      finalProgress:
        progressEvents.at(-1) ?? {
          status: 'failed',
          sourceId: SMOKE_TEST_SOURCE_ID,
          processed: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: 1,
          message: 'LOCAL_PLAYLIST_IMPORT_SMOKE_TEST_FAILED',
        },
      stats: await getLocalCatalogStats().catch(emptyStats),
      listedCount: 0,
      progressEventsCount: progressEvents.length,
      withoutExtinfPreserved: false,
      unknownPreserved: false,
      uncategorizedCreated: false,
      dynamicGroupVisible: false,
      opaqueIds: false,
      unsafeLogoRejected: false,
      errorCode: 'LOCAL_PLAYLIST_IMPORT_SMOKE_TEST_FAILED',
    };
  }
}
