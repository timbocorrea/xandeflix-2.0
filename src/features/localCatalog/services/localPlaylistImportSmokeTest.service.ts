import {
  clearLocalCatalogDb,
  getLocalCatalogStats,
  listLocalCatalogItems,
} from './localCatalogDb.service';
import { importPlaylistToLocalCatalog } from './localPlaylistImport.service';
import type { LocalCatalogStats } from '../types/localCatalog.types';
import type { LocalPlaylistImportProgress } from '../types/localPlaylistImport.types';

export type LocalPlaylistImportSmokeTestResult = {
  ok: boolean;
  sourceId: string;
  finalProgress: LocalPlaylistImportProgress;
  stats: LocalCatalogStats;
  sampleCount: number;
  listedCount: number;
  progressEventsCount: number;
  errorMessage?: string;
};

const SMOKE_TEST_SOURCE_ID = 'local-playlist-import-smoke-test-source';

const SMOKE_TEST_PLAYLIST = `#EXTM3U
#EXTINF:-1 tvg-id="live-1" tvg-name="Canal Teste Live" tvg-logo="https://example.com/live.png" group-title="Canais | Teste",Canal Teste Live
https://example.com/live/stream.m3u8
#EXTINF:-1 tvg-id="movie-1" tvg-name="Filme Teste" tvg-logo="https://example.com/movie.png" group-title="Filmes | Teste",Filme Teste
https://example.com/movie.mp4
#EXTINF:-1 tvg-id="series-1" tvg-name="Serie Teste S01E01" tvg-logo="https://example.com/series.png" group-title="Series | Teste",Serie Teste S01E01
https://example.com/series-s01e01.mp4
`;

export async function runLocalPlaylistImportSmokeTest(): Promise<LocalPlaylistImportSmokeTestResult> {
  const progressEvents: LocalPlaylistImportProgress[] = [];

  try {
    await clearLocalCatalogDb();

    const result = await importPlaylistToLocalCatalog({
      sourceId: SMOKE_TEST_SOURCE_ID,
      playlistText: SMOKE_TEST_PLAYLIST,
      batchSize: 2,
      onProgress: (progress) => {
        progressEvents.push(progress);
      },
    });

    const stats = await getLocalCatalogStats();
    const listedItems = await listLocalCatalogItems({ limit: 10 });

    const ok =
      result.progress.status === 'completed' &&
      result.progress.inserted === 3 &&
      stats.playlistItemsCount === 3 &&
      stats.byContentKind.live === 1 &&
      stats.byContentKind.movie === 1 &&
      stats.byContentKind.series === 1 &&
      listedItems.length === 3;

    return {
      ok,
      sourceId: SMOKE_TEST_SOURCE_ID,
      finalProgress: result.progress,
      stats,
      sampleCount: result.sampleItems.length,
      listedCount: listedItems.length,
      progressEventsCount: progressEvents.length,
      errorMessage: ok ? undefined : 'LOCAL_PLAYLIST_IMPORT_SMOKE_TEST_ASSERTION_FAILED',
    };
  } catch (error) {
    const stats = await getLocalCatalogStats().catch(() => ({
      playlistItemsCount: 0,
      catalogMetadataCount: 0,
      tmdbMetadataCount: 0,
      byContentKind: {
        live: 0,
        movie: 0,
        series: 0,
        unknown: 0,
      },
    }));

    return {
      ok: false,
      sourceId: SMOKE_TEST_SOURCE_ID,
      finalProgress:
        progressEvents.at(-1) ?? {
          status: 'error',
          sourceId: SMOKE_TEST_SOURCE_ID,
          processed: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: 1,
          message:
            error instanceof Error
              ? error.message
              : 'LOCAL_PLAYLIST_IMPORT_SMOKE_TEST_FAILED',
        },
      stats,
      sampleCount: 0,
      listedCount: 0,
      progressEventsCount: progressEvents.length,
      errorMessage:
        error instanceof Error
          ? error.message
          : 'LOCAL_PLAYLIST_IMPORT_SMOKE_TEST_FAILED',
    };
  }
}
