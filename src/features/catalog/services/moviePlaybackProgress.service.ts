const MOVIE_PLAYBACK_PROGRESS_PREFIX =
  'xandeflix:movie-playback-progress:v1:';

const MOVIE_PLAYBACK_PROGRESS_VERSION = 1;

export const MIN_MOVIE_RESUME_POSITION_SECONDS = 5;

export type MoviePlaybackProgressResolutionStatus =
  | 'RESTORED'
  | 'NO_STATE'
  | 'STALE_DISCARDED';

export type MoviePlaybackProgressIdentity = {
  scopeKey?: string | null;
  movieId?: string | null;
};

export type MoviePlaybackProgressRecord = {
  version: 1;
  scopeKey: string;
  movieId: string;
  lastPositionSeconds: number;
  updatedAt: number;
};

export type MoviePlaybackProgressResolution = {
  status: MoviePlaybackProgressResolutionStatus;
  startPositionMs: number;
};

export type MoviePlaybackProgressStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

function normalizeIdentityPart(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function getStorage(
  storage?: MoviePlaybackProgressStorage,
): MoviePlaybackProgressStorage | null {
  if (storage) {
    return storage;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getMoviePlaybackProgressKey(
  identity: MoviePlaybackProgressIdentity,
) {
  const scopeKey = normalizeIdentityPart(identity.scopeKey);
  const movieId = normalizeIdentityPart(identity.movieId);

  if (!scopeKey || !movieId) {
    return null;
  }

  return `${MOVIE_PLAYBACK_PROGRESS_PREFIX}${encodeURIComponent(scopeKey)}:${encodeURIComponent(movieId)}`;
}

function discardInvalidEntry(
  storage: MoviePlaybackProgressStorage,
  key: string,
): MoviePlaybackProgressResolution {
  try {
    storage.removeItem(key);
  } catch {
    // Limpeza local best-effort. Falha nao deve bloquear reproducao.
  }

  return {
    status: 'STALE_DISCARDED',
    startPositionMs: 0,
  };
}

function isValidRecord(
  value: unknown,
  expectedScopeKey: string,
  expectedMovieId: string,
): value is MoviePlaybackProgressRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<MoviePlaybackProgressRecord>;

  return (
    record.version === MOVIE_PLAYBACK_PROGRESS_VERSION &&
    record.scopeKey === expectedScopeKey &&
    record.movieId === expectedMovieId &&
    typeof record.lastPositionSeconds === 'number' &&
    Number.isFinite(record.lastPositionSeconds) &&
    record.lastPositionSeconds >= 0 &&
    typeof record.updatedAt === 'number' &&
    Number.isFinite(record.updatedAt) &&
    record.updatedAt > 0
  );
}

export function resolveMoviePlaybackProgress(
  identity: MoviePlaybackProgressIdentity,
  storageOverride?: MoviePlaybackProgressStorage,
): MoviePlaybackProgressResolution {
  const scopeKey = normalizeIdentityPart(identity.scopeKey);
  const movieId = normalizeIdentityPart(identity.movieId);
  const key = getMoviePlaybackProgressKey({ scopeKey, movieId });
  const storage = getStorage(storageOverride);

  if (!key || !storage) {
    return {
      status: 'NO_STATE',
      startPositionMs: 0,
    };
  }

  let rawValue: string | null;

  try {
    rawValue = storage.getItem(key);
  } catch {
    return {
      status: 'NO_STATE',
      startPositionMs: 0,
    };
  }

  if (!rawValue) {
    return {
      status: 'NO_STATE',
      startPositionMs: 0,
    };
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    return discardInvalidEntry(storage, key);
  }

  if (!isValidRecord(parsedValue, scopeKey, movieId)) {
    return discardInvalidEntry(storage, key);
  }

  if (
    parsedValue.lastPositionSeconds < MIN_MOVIE_RESUME_POSITION_SECONDS
  ) {
    return {
      status: 'NO_STATE',
      startPositionMs: 0,
    };
  }

  return {
    status: 'RESTORED',
    startPositionMs: Math.floor(parsedValue.lastPositionSeconds * 1000),
  };
}

export function updateMoviePlaybackPosition(
  identity: MoviePlaybackProgressIdentity,
  positionSeconds: number,
  storageOverride?: MoviePlaybackProgressStorage,
) {
  if (!Number.isFinite(positionSeconds)) {
    return;
  }

  const scopeKey = normalizeIdentityPart(identity.scopeKey);
  const movieId = normalizeIdentityPart(identity.movieId);
  const key = getMoviePlaybackProgressKey({ scopeKey, movieId });
  const storage = getStorage(storageOverride);

  if (!key || !storage) {
    return;
  }

  const record: MoviePlaybackProgressRecord = {
    version: MOVIE_PLAYBACK_PROGRESS_VERSION,
    scopeKey,
    movieId,
    lastPositionSeconds: Math.max(0, Math.floor(positionSeconds)),
    updatedAt: Date.now(),
  };

  try {
    storage.setItem(key, JSON.stringify(record));
  } catch {
    // Progresso local best-effort. Falha nao deve bloquear reproducao.
  }
}
