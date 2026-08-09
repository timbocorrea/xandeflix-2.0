import {
  getMoviePlaybackProgressKey,
  resolveMoviePlaybackProgress,
  updateMoviePlaybackPosition,
  type MoviePlaybackProgressIdentity,
  type MoviePlaybackProgressStorage,
} from './moviePlaybackProgress.service';

export type MoviePlaybackProgressSmokeTestResult = {
  pass: boolean;
  checks: Record<string, boolean>;
};

class MemoryStorage implements MoviePlaybackProgressStorage {
  private readonly values: Map<string, string>;

  constructor(entries: Iterable<readonly [string, string]> = []) {
    this.values = new Map(entries);
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  entries() {
    return this.values.entries();
  }
}

export function runMoviePlaybackProgressSmokeTest(): MoviePlaybackProgressSmokeTestResult {
  const scopeKey = 'license-scope::device-scope::source-scope';
  const movieId = 'movie-004';
  const identity = { scopeKey, movieId };
  const storage = new MemoryStorage();
  const noState = resolveMoviePlaybackProgress(identity, storage);

  updateMoviePlaybackPosition(identity, 77.9, storage);
  const validResume = resolveMoviePlaybackProgress(identity, storage);

  const belowThresholdStorage = new MemoryStorage();
  updateMoviePlaybackPosition(identity, 4.9, belowThresholdStorage);
  const belowThreshold = resolveMoviePlaybackProgress(
    identity,
    belowThresholdStorage,
  );

  const restartedStorage = new MemoryStorage(Array.from(storage.entries()));
  const restartedResume = resolveMoviePlaybackProgress(
    identity,
    restartedStorage,
  );
  const otherScope = resolveMoviePlaybackProgress(
    { scopeKey: 'other-scope', movieId },
    storage,
  );
  const otherMovie = resolveMoviePlaybackProgress(
    { scopeKey, movieId: 'movie-005' },
    storage,
  );

  const corruptStorage = new MemoryStorage();
  const corruptKey = getMoviePlaybackProgressKey(identity);

  if (corruptKey) {
    corruptStorage.setItem(corruptKey, '{invalid-json');
  }

  const corruptResolution = resolveMoviePlaybackProgress(
    identity,
    corruptStorage,
  );

  const mismatchStorage = new MemoryStorage();
  const mismatchKey = getMoviePlaybackProgressKey(identity);

  if (mismatchKey) {
    mismatchStorage.setItem(
      mismatchKey,
      JSON.stringify({
        version: 1,
        scopeKey,
        movieId: 'different-movie',
        lastPositionSeconds: 91,
        updatedAt: Date.now(),
      }),
    );
  }

  const mismatchResolution = resolveMoviePlaybackProgress(
    identity,
    mismatchStorage,
  );

  const ignoredFieldsIdentity = {
    scopeKey,
    movieId,
    streamUrl: 'https://media.invalid/synthetic-movie.mp4',
    title: 'Synthetic Movie Title',
    tmdbId: 'tmdb-synthetic-004',
  } as MoviePlaybackProgressIdentity;
  const ignoredFieldsStorage = new MemoryStorage();
  updateMoviePlaybackPosition(ignoredFieldsIdentity, 42, ignoredFieldsStorage);
  const serializedIgnoredFields = JSON.stringify(
    Array.from(ignoredFieldsStorage.entries()),
  );

  const checks = {
    MOVIE_NO_STATE:
      noState.status === 'NO_STATE' && noState.startPositionMs === 0,
    MOVIE_VALID_RESUME:
      validResume.status === 'RESTORED' &&
      validResume.startPositionMs === 77000,
    MOVIE_POSITION_LT_5S_NO_RESUME:
      belowThreshold.status === 'NO_STATE' &&
      belowThreshold.startPositionMs === 0,
    MOVIE_PROCESS_RESTART_PERSISTENCE:
      restartedResume.status === 'RESTORED' &&
      restartedResume.startPositionMs === 77000,
    MOVIE_SCOPE_ISOLATION:
      otherScope.status === 'NO_STATE' && otherScope.startPositionMs === 0,
    MOVIE_ID_ISOLATION:
      otherMovie.status === 'NO_STATE' && otherMovie.startPositionMs === 0,
    MOVIE_CORRUPT_STATE_STALE_DISCARDED:
      corruptResolution.status === 'STALE_DISCARDED' &&
      corruptResolution.startPositionMs === 0 &&
      Boolean(corruptKey) &&
      corruptStorage.getItem(corruptKey ?? '') === null,
    MOVIE_IDENTITY_MISMATCH_STALE_DISCARDED:
      mismatchResolution.status === 'STALE_DISCARDED' &&
      mismatchResolution.startPositionMs === 0 &&
      Boolean(mismatchKey) &&
      mismatchStorage.getItem(mismatchKey ?? '') === null,
    MOVIE_NO_RAW_URL_STORAGE_IDENTITY:
      getMoviePlaybackProgressKey(ignoredFieldsIdentity) ===
        getMoviePlaybackProgressKey(identity) &&
      !serializedIgnoredFields.includes('media.invalid') &&
      !serializedIgnoredFields.includes('streamUrl'),
    MOVIE_NO_TITLE_IDENTITY:
      getMoviePlaybackProgressKey({
        scopeKey,
        title: 'Title-only identity',
      } as MoviePlaybackProgressIdentity) === null &&
      !serializedIgnoredFields.includes('Synthetic Movie Title'),
    MOVIE_NO_TMDB_IDENTITY:
      getMoviePlaybackProgressKey({
        scopeKey,
        tmdbId: 'tmdb-only-identity',
      } as MoviePlaybackProgressIdentity) === null &&
      !serializedIgnoredFields.includes('tmdb-synthetic-004'),
  };

  return {
    pass: Object.values(checks).every(Boolean),
    checks,
  };
}
