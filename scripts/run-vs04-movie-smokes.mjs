import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'vite';

const repositoryRoot = process.cwd();
const temporaryRoot = path.resolve(
  os.tmpdir(),
  `xandeflix-vs04-movie-smoke-${process.pid}-${Date.now()}`,
);
const smokeEntry = path.resolve(
  repositoryRoot,
  'src/features/catalog/services/moviePlaybackProgressSmokeTest.service.ts',
);

if (
  !temporaryRoot.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
  !path.basename(temporaryRoot).startsWith('xandeflix-vs04-movie-smoke-')
) {
  throw new Error('VS04_SMOKE_TEMP_PATH_REJECTED');
}

async function readSource(relativePath) {
  return readFile(path.resolve(repositoryRoot, relativePath), 'utf8');
}

function sourceSlice(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);

  assert.notEqual(startIndex, -1, `VS04_SOURCE_MARKER_MISSING:${startMarker}`);
  assert.notEqual(endIndex, -1, `VS04_SOURCE_MARKER_MISSING:${endMarker}`);

  return source.slice(startIndex, endIndex);
}

try {
  await build({
    configFile: false,
    logLevel: 'error',
    resolve: {
      alias: {
        '@': path.resolve(repositoryRoot, 'src'),
      },
    },
    build: {
      emptyOutDir: true,
      minify: false,
      outDir: temporaryRoot,
      ssr: smokeEntry,
      rollupOptions: {
        output: {
          entryFileNames: 'smoke.mjs',
        },
      },
    },
  });

  const smokeModule = await import(
    `${pathToFileURL(path.join(temporaryRoot, 'smoke.mjs')).href}?v=${Date.now()}`
  );
  const progressResult = smokeModule.runMoviePlaybackProgressSmokeTest();
  const [categoryPage, playerPage, nativeAdapter, nativeBridge, nativePlugin, nativeActivity] =
    await Promise.all([
      readSource('src/features/catalog/pages/CatalogCategoryPage.tsx'),
      readSource('src/features/player/pages/UniversalPlayerPage.tsx'),
      readSource('src/features/player/lib/nativeAndroidPlayerAdapter.ts'),
      readSource('src/features/player/lib/nativeAndroidPlayerBridge.ts'),
      readSource(
        'android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java',
      ),
      readSource(
        'android/app/src/main/java/com/xandeflix/app/NativePlayerActivity.java',
      ),
    ]);

  const openMovie = sourceSlice(
    categoryPage,
    'function openMovie(item: HomeVodItem)',
    '// FASE 4: foco inicial do detalhe de filme',
  );
  const openEpisode = sourceSlice(
    categoryPage,
    'function openEpisode(item: HomeVodItem',
    'function openMovie(item: HomeVodItem)',
  );
  const nativeReturn = sourceSlice(
    playerPage,
    "if (!isDirectPlayback || !usesNativeAndroidPlayer)",
    'if (isDirectPlayback && usesNativeAndroidPlayer)',
  );
  const nativeSave = sourceSlice(
    nativeActivity,
    'private void saveCurrentPlaybackPosition()',
    'private void showControllerAndFocus()',
  );
  const movieWriteIndex = nativeSave.indexOf(
    'if (isMovieCanonicalPositionOnly())',
  );
  const legacyWriteIndex = nativeSave.indexOf('getSharedPreferences(');

  const sourceChecks = {
    MOVIE_PLAYER_DOES_NOT_USE_EPISODE_PROGRESS:
      playerPage.includes('if (!isMovieContinuity) {') &&
      playerPage.includes('markEpisodePlaybackStarted({') &&
      playerPage.includes('if (isMovieContinuity) {') &&
      playerPage.includes('updateMoviePlaybackPosition('),
    MOVIE_NATIVE_POLICY_EXPLICIT:
      nativeAdapter.includes(
        "'MOVIE_CANONICAL_POSITION_ONLY' as const",
      ) &&
      nativeBridge.includes(
        "| 'MOVIE_CANONICAL_POSITION_ONLY'",
      ) &&
      playerPage.includes(
        '{ continuityPolicy: MOVIE_NATIVE_CONTINUITY_POLICY }',
      ) &&
      nativePlugin.includes(
        'intent.putExtra(NativePlayerActivity.EXTRA_CONTINUITY_POLICY, continuityPolicy)',
      ),
    MOVIE_NATIVE_URL_PROGRESS_CANNOT_OVERRIDE:
      nativeActivity.includes(
        'long resumePositionMs = isMovieCanonicalPositionOnly()',
      ) &&
      nativeActivity.includes('? requestedStartPositionMs') &&
      nativeActivity.includes(': Math.max('),
    MOVIE_NATIVE_DOES_NOT_WRITE_URL_PROGRESS:
      movieWriteIndex >= 0 &&
      legacyWriteIndex > movieWriteIndex &&
      nativeSave.slice(movieWriteIndex, legacyWriteIndex).includes('return;') &&
      nativeSave.includes('lastPlaybackStreamUrl = "";'),
    MOVIE_NATIVE_RETURN_UPDATES_MOVIE_PROGRESS:
      nativeReturn.includes('addNativeAndroidPlayerResumeListener(') &&
      nativeReturn.includes('updateMoviePlaybackPosition(') &&
      nativeReturn.includes('returnedPositionMs >= 5000'),
    EPISODE_PATH_REMAINS_LEGACY:
      openEpisode.includes('getEpisodeResumePositionMs({') &&
      openEpisode.includes('episodeId: item.id') &&
      !openEpisode.includes('movieId:') &&
      nativeActivity.includes(
        'public static final String CONTINUITY_POLICY_LEGACY = "LEGACY";',
      ) &&
      nativeActivity.includes('savedPlaybackPositionMs') &&
      nativeActivity.includes('Math.max(') &&
      nativeSave.includes('.putLong(getProgressStorageKey(), currentPositionMs)'),
    DETAIL_NO_ITEMS0_WRONG_MOVIE_FALLBACK:
      categoryPage.includes("searchParams.get('movieId')") &&
      categoryPage.includes(
        'return normalizeMovieValue(item.id) === requestedMovieId;',
      ) &&
      categoryPage.includes('return matchedItem ?? null;') &&
      !categoryPage.includes(
        'matchedItem ?? movieNavigationState?.selectedMovieItem ?? items[0]',
      ) &&
      categoryPage.includes('data-xf-movie-detail-state="unavailable"'),
    DEVICE_DIRECT_PLAYBACK_PRESERVED:
      openMovie.includes('src: item.streamUrl') &&
      openMovie.includes("direct: '1'") &&
      playerPage.includes('url: streamUrl') &&
      nativeActivity.includes('MediaItem.fromUri(Uri.parse(request.getMediaUrl()))') &&
      ![
        categoryPage,
        playerPage,
        nativeAdapter,
        nativeBridge,
        nativePlugin,
        nativeActivity,
      ].some((source) =>
        /(?:\/functions\/v1\/|supabase\/functions\/)/i.test(source),
      ),
  };
  const checks = {
    ...progressResult.checks,
    ...sourceChecks,
  };
  const result = {
    pass: progressResult.pass && Object.values(sourceChecks).every(Boolean),
    checks,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.pass) {
    process.exitCode = 1;
  }
} catch (error) {
  const errorCode =
    error instanceof Error && /^VS04_[A-Z0-9_:,-]+$/.test(error.message)
      ? error.message
      : 'VS04_SMOKE_UNEXPECTED_ERROR';
  process.stderr.write(`${JSON.stringify({ pass: false, errorCode })}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
