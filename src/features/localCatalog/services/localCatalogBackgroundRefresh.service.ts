import type {
  PlaylistLoadProgress,
  PlaylistRuntimeAuthorizationContext,
  PlaylistSource,
} from '@/features/playlists/types/playlist';
import { loadDirectSourcePlaylist } from '@/features/playlists/lib/directSourcePlaylistLoader';

import {
  getLocalCatalogMetadata,
  putLocalCatalogMetadata,
} from './localCatalogDb.service';
import {
  prepareLocalCatalogRuntimeSnapshotBridge,
  type LocalCatalogRuntimeSnapshotBridge,
} from './localCatalogRuntimeSnapshotBridge.service';
import { getReadableLocalCatalogActiveSnapshot } from './localCatalogSnapshotLifecycle.service';
import { computeLocalCatalogSnapshotContentFingerprint } from '../readModels/localCatalogActiveSnapshotReadModel.service';
import { LOCAL_CATALOG_CLASSIFICATION_VERSION } from './localPlaylistImport.service';
import {
  endDiscoveryPerformanceSpan,
  incrementDiscoveryPerformanceCounter,
  markDiscoveryPerformance,
  startDiscoveryPerformanceSpan,
} from '@/features/catalog/services/discoveryPerformance.service';

export const SOURCE_REFRESH_MIN_INTERVAL_MS = 15 * 60 * 1_000;
export const SOURCE_REFRESH_STATE_VERSION = 1;

type LocalCatalogSourceRefreshState = {
  version: number;
  etag: string | null;
  lastModified: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastChangedAt: string | null;
  contentFingerprint: string | null;
  activeGenerationId: string | null;
  itemCount: number;
  status: 'idle' | 'not_modified' | 'unchanged' | 'changed' | 'failed' | 'canceled';
  failureCode: string | null;
};

export type LocalCatalogBackgroundRefreshResult = {
  status:
    | 'deferred'
    | 'not_modified'
    | 'unchanged'
    | 'changed'
    | 'failed'
    | 'canceled';
  requestCount: 0 | 1;
  previousActiveGenerationId: string | null;
  activeGenerationId: string | null;
  contentFingerprintChanged: boolean;
  promoted: boolean;
  itemCount: number;
  failureCode: string | null;
  durationMs: number;
};

export type RefreshLocalCatalogInBackgroundInput = {
  source: PlaylistSource;
  authorizationContext: PlaylistRuntimeAuthorizationContext;
  scopeKey: string;
  signal?: AbortSignal;
  force?: boolean;
  now?: () => number;
  onProgress?: (progress: PlaylistLoadProgress) => void;
};

export type LocalCatalogBackgroundRefreshDependencies = {
  loadPlaylist: typeof loadDirectSourcePlaylist;
  prepareBridge: typeof prepareLocalCatalogRuntimeSnapshotBridge;
  getActiveSnapshot: typeof getReadableLocalCatalogActiveSnapshot;
  computeFingerprint: typeof computeLocalCatalogSnapshotContentFingerprint;
  readMetadata: typeof getLocalCatalogMetadata;
  writeMetadata: typeof putLocalCatalogMetadata;
};

const defaultDependencies: LocalCatalogBackgroundRefreshDependencies = {
  loadPlaylist: loadDirectSourcePlaylist,
  prepareBridge: prepareLocalCatalogRuntimeSnapshotBridge,
  getActiveSnapshot: getReadableLocalCatalogActiveSnapshot,
  computeFingerprint: computeLocalCatalogSnapshotContentFingerprint,
  readMetadata: getLocalCatalogMetadata,
  writeMetadata: putLocalCatalogMetadata,
};

const inFlightRefreshes = new Map<
  string,
  Promise<LocalCatalogBackgroundRefreshResult>
>();

function refreshMetadataKey(scopeKey: string) {
  return `xandeflix:source-refresh:v${SOURCE_REFRESH_STATE_VERSION}:${scopeKey}`;
}

function emptyRefreshState(): LocalCatalogSourceRefreshState {
  return {
    version: SOURCE_REFRESH_STATE_VERSION,
    etag: null,
    lastModified: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastChangedAt: null,
    contentFingerprint: null,
    activeGenerationId: null,
    itemCount: 0,
    status: 'idle',
    failureCode: null,
  };
}

function isRefreshState(value: unknown): value is LocalCatalogSourceRefreshState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LocalCatalogSourceRefreshState>;
  return (
    candidate.version === SOURCE_REFRESH_STATE_VERSION &&
    (candidate.etag === null || typeof candidate.etag === 'string') &&
    (candidate.lastModified === null || typeof candidate.lastModified === 'string') &&
    (candidate.lastAttemptAt === null || typeof candidate.lastAttemptAt === 'string') &&
    (candidate.lastSuccessAt === null || typeof candidate.lastSuccessAt === 'string') &&
    (candidate.contentFingerprint === null ||
      typeof candidate.contentFingerprint === 'string') &&
    typeof candidate.itemCount === 'number'
  );
}

async function readRefreshState(
  scopeKey: string,
  dependencies: LocalCatalogBackgroundRefreshDependencies,
) {
  const record = await dependencies
    .readMetadata(refreshMetadataKey(scopeKey))
    .catch(() => null);
  return isRefreshState(record?.value) ? record.value : emptyRefreshState();
}

async function writeRefreshState(
  scopeKey: string,
  state: LocalCatalogSourceRefreshState,
  dependencies: LocalCatalogBackgroundRefreshDependencies,
) {
  await dependencies.writeMetadata({
    key: refreshMetadataKey(scopeKey),
    value: state,
    updatedAt: new Date().toISOString(),
  });
}

function sanitizeFailureCode(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'LOCAL_CATALOG_REFRESH_CANCELED';
  }

  if (
    error instanceof Error &&
    /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(error.message)
  ) {
    return error.message;
  }

  return 'LOCAL_CATALOG_REFRESH_FAILED';
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function elapsedMs(startedAt: number, now: () => number) {
  return Math.max(0, Math.round(now() - startedAt));
}

function createDeferredResult(
  activeGenerationId: string | null,
): LocalCatalogBackgroundRefreshResult {
  return {
    status: 'deferred',
    requestCount: 0,
    previousActiveGenerationId: activeGenerationId,
    activeGenerationId,
    contentFingerprintChanged: false,
    promoted: false,
    itemCount: 0,
    failureCode: null,
    durationMs: 0,
  };
}

async function executeRefresh(
  input: RefreshLocalCatalogInBackgroundInput,
  dependencies: LocalCatalogBackgroundRefreshDependencies,
): Promise<LocalCatalogBackgroundRefreshResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const scopeKey = input.scopeKey.trim();
  const sourceId = input.source.sourceId?.trim();
  const internalLicenseId = input.authorizationContext.internalLicenseId.trim();
  const previousActive = await dependencies.getActiveSnapshot(scopeKey);
  const state = await readRefreshState(scopeKey, dependencies);
  const lastAttemptMs = state.lastAttemptAt
    ? Date.parse(state.lastAttemptAt)
    : Number.NaN;

  if (
    !input.force &&
    Number.isFinite(lastAttemptMs) &&
    now() - lastAttemptMs < SOURCE_REFRESH_MIN_INTERVAL_MS
  ) {
    return createDeferredResult(previousActive?.snapshotId ?? null);
  }

  if (!sourceId || !internalLicenseId || !input.source.url.trim()) {
    return {
      ...createDeferredResult(previousActive?.snapshotId ?? null),
      status: 'failed',
      failureCode: 'LOCAL_CATALOG_REFRESH_CONTEXT_INVALID',
    };
  }

  const attemptAt = new Date(now()).toISOString();
  await writeRefreshState(
    scopeKey,
    {
      ...state,
      lastAttemptAt: attemptAt,
      status: 'idle',
      failureCode: null,
    },
    dependencies,
  );

  let bridge: LocalCatalogRuntimeSnapshotBridge | null = null;

  try {
    const playlist = await dependencies.loadPlaylist(input.source, {
      signal: input.signal,
      collectChannels: false,
      conditionalHeaders: {
        ifNoneMatch: state.etag ?? undefined,
        ifModifiedSince: state.lastModified ?? undefined,
      },
      onProgress: input.onProgress,
      onChannelsBatch: async (channels) => {
        if (!bridge) {
          bridge = await dependencies.prepareBridge({
            internalLicenseId,
            sourceId,
            sourceType: 'm3u',
            signal: input.signal,
            promotionEnabled: true,
            parserVersion: 1,
            classificationVersion: LOCAL_CATALOG_CLASSIFICATION_VERSION,
            transformConcurrency: 2,
          });
        }

        await bridge.writeBatch(channels);
      },
    });

    const responseEtag = playlist.responseEtag?.trim() || state.etag;
    const responseLastModified =
      playlist.responseLastModified?.trim() || state.lastModified;
    const successAt = new Date(now()).toISOString();

    if (playlist.notModified) {
      await writeRefreshState(
        scopeKey,
        {
          ...state,
          etag: responseEtag,
          lastModified: responseLastModified,
          lastAttemptAt: attemptAt,
          lastSuccessAt: successAt,
          activeGenerationId: previousActive?.snapshotId ?? null,
          status: 'not_modified',
          failureCode: null,
        },
        dependencies,
      );

      return {
        status: 'not_modified',
        requestCount: 1,
        previousActiveGenerationId: previousActive?.snapshotId ?? null,
        activeGenerationId: previousActive?.snapshotId ?? null,
        contentFingerprintChanged: false,
        promoted: false,
        itemCount: previousActive?.totalItems ?? state.itemCount,
        failureCode: null,
        durationMs: elapsedMs(startedAt, now),
      };
    }

    const completedBridge = bridge as LocalCatalogRuntimeSnapshotBridge | null;

    if (!completedBridge || playlist.total <= 0) {
      throw new Error('LOCAL_CATALOG_REFRESH_EMPTY_SOURCE');
    }

    await completedBridge.complete({ parsedItems: playlist.total });
    const bridgeMetrics = completedBridge.getSanitizedMetrics();

    if (bridgeMetrics.duplicatesIgnored !== 0) {
      throw new Error('LOCAL_CATALOG_REFRESH_DUPLICATE_IDENTITY');
    }

    const stagingGenerationId = completedBridge.getSnapshotId();
    const [stagingFingerprint, activeFingerprint] = await Promise.all([
      dependencies.computeFingerprint({
        snapshotId: stagingGenerationId,
        scopeKey,
        signal: input.signal,
      }),
      previousActive
        ? dependencies.computeFingerprint({
            snapshotId: previousActive.snapshotId,
            scopeKey,
            signal: input.signal,
          })
        : Promise.resolve(null),
    ]);

    if (stagingFingerprint.count !== playlist.total) {
      throw new Error('LOCAL_CATALOG_REFRESH_COUNT_MISMATCH');
    }

    const previousFingerprint =
      activeFingerprint?.fingerprint ?? state.contentFingerprint;
    const isUnchanged =
      Boolean(previousActive) &&
      Boolean(previousFingerprint) &&
      previousFingerprint === stagingFingerprint.fingerprint;

    if (isUnchanged) {
      await completedBridge.cancel();
      await writeRefreshState(
        scopeKey,
        {
          ...state,
          etag: responseEtag,
          lastModified: responseLastModified,
          lastAttemptAt: attemptAt,
          lastSuccessAt: successAt,
          contentFingerprint: stagingFingerprint.fingerprint,
          activeGenerationId: previousActive?.snapshotId ?? null,
          itemCount: stagingFingerprint.count,
          status: 'unchanged',
          failureCode: null,
        },
        dependencies,
      );

      return {
        status: 'unchanged',
        requestCount: 1,
        previousActiveGenerationId: previousActive?.snapshotId ?? null,
        activeGenerationId: previousActive?.snapshotId ?? null,
        contentFingerprintChanged: false,
        promoted: false,
        itemCount: stagingFingerprint.count,
        failureCode: null,
        durationMs: elapsedMs(startedAt, now),
      };
    }

    await completedBridge.promote();
    await writeRefreshState(
      scopeKey,
      {
        ...state,
        etag: responseEtag,
        lastModified: responseLastModified,
        lastAttemptAt: attemptAt,
        lastSuccessAt: successAt,
        lastChangedAt: successAt,
        contentFingerprint: stagingFingerprint.fingerprint,
        activeGenerationId: stagingGenerationId,
        itemCount: stagingFingerprint.count,
        status: 'changed',
        failureCode: null,
      },
      dependencies,
    ).catch(() => undefined);

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('xandeflix:local-catalog-promoted', {
            detail: {
              generationId: stagingGenerationId,
              itemCount: stagingFingerprint.count,
            },
          }),
        );
      } catch {
        // A geração já foi promovida; telemetria/UI não altera esse commit.
      }
    }

    return {
      status: 'changed',
      requestCount: 1,
      previousActiveGenerationId: previousActive?.snapshotId ?? null,
      activeGenerationId: stagingGenerationId,
      contentFingerprintChanged: true,
      promoted: true,
      itemCount: stagingFingerprint.count,
      failureCode: null,
      durationMs: elapsedMs(startedAt, now),
    };
  } catch (error) {
    const canceled = isAbortError(error) || input.signal?.aborted;
    const failureCode = sanitizeFailureCode(error);

    const failedBridge = bridge as LocalCatalogRuntimeSnapshotBridge | null;

    if (failedBridge) {
      if (canceled) {
        await failedBridge.cancel().catch(() => undefined);
      } else {
        await failedBridge.fail(failureCode).catch(() => undefined);
      }
    }

    await writeRefreshState(
      scopeKey,
      {
        ...state,
        lastAttemptAt: attemptAt,
        activeGenerationId: previousActive?.snapshotId ?? null,
        status: canceled ? 'canceled' : 'failed',
        failureCode,
      },
      dependencies,
    ).catch(() => undefined);

    return {
      status: canceled ? 'canceled' : 'failed',
      requestCount: 1,
      previousActiveGenerationId: previousActive?.snapshotId ?? null,
      activeGenerationId: previousActive?.snapshotId ?? null,
      contentFingerprintChanged: false,
      promoted: false,
      itemCount: previousActive?.totalItems ?? state.itemCount,
      failureCode,
      durationMs: elapsedMs(startedAt, now),
    };
  }
}

export function refreshLocalCatalogInBackground(
  input: RefreshLocalCatalogInBackgroundInput,
  dependencies: LocalCatalogBackgroundRefreshDependencies = defaultDependencies,
) {
  const scopeKey = input.scopeKey.trim();

  if (!scopeKey) {
    return Promise.resolve({
      ...createDeferredResult(null),
      status: 'failed' as const,
      failureCode: 'LOCAL_CATALOG_REFRESH_SCOPE_INVALID',
    });
  }

  const inFlight = inFlightRefreshes.get(scopeKey);

  if (inFlight) {
    return inFlight;
  }

  markDiscoveryPerformance(
    'local_catalog_background_refresh_start',
    { once: false },
  );
  startDiscoveryPerformanceSpan('local_catalog_background_refresh');
  incrementDiscoveryPerformanceCounter(
    'local_catalog_background_refresh_count',
  );

  const refreshPromise = executeRefresh(input, dependencies).finally(() => {
    if (inFlightRefreshes.get(scopeKey) === refreshPromise) {
      inFlightRefreshes.delete(scopeKey);
    }

    markDiscoveryPerformance(
      'local_catalog_background_refresh_end',
      { once: false },
    );
    endDiscoveryPerformanceSpan('local_catalog_background_refresh');
  });
  inFlightRefreshes.set(scopeKey, refreshPromise);
  return refreshPromise;
}

export function getLocalCatalogBackgroundRefreshInFlightCount() {
  return inFlightRefreshes.size;
}

export function resetLocalCatalogBackgroundRefreshRuntimeStateForTests() {
  inFlightRefreshes.clear();
}
