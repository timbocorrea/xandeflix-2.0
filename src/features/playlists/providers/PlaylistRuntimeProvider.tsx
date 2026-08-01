import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { App as CapacitorApp } from '@capacitor/app';

import { env } from '@/config/env';
import { CLIENT_RUNTIME_ACCESS_REVOKED_EVENT } from '@/features/bootstrap/services/clientRuntimeAccessEvents.service';
import { loadDirectSourcePlaylist } from '../lib/directSourcePlaylistLoader';
import {
  beginLocalCatalogImport,
  LOCAL_CATALOG_CLASSIFICATION_VERSION,
  type LocalCatalogImportSession,
} from '@/features/localCatalog/services/localPlaylistImport.service';
import type { LocalCatalogRuntimeSnapshotBridge } from '@/features/localCatalog/services/localCatalogRuntimeSnapshotBridge.service';
import { deriveLocalCatalogScope } from '@/features/localCatalog/services/localCatalogScope.service';
import { getReadableLocalCatalogActiveSnapshot } from '@/features/localCatalog/services/localCatalogSnapshotLifecycle.service';
import {
  refreshLocalCatalogInBackground,
  type LocalCatalogBackgroundRefreshResult,
} from '@/features/localCatalog/services/localCatalogBackgroundRefresh.service';
import { clearHomeVodCache } from '@/features/catalog/services/homeVod.service';
import { invalidateAppBootstrapHomeCatalogCache } from '@/features/bootstrap/services/appBootstrap.service';
import { markDiscoveryPerformance } from '@/features/catalog/services/discoveryPerformance.service';
import type {
  IptvChannel,
  PlaylistDiagnostics,
  PlaylistLoadProgress,
  PlaylistRuntimeAuthorizationContext,
  PlaylistRuntimeStatus,
  PlaylistSource,
} from '../types/playlist';

type PlaylistRuntimeContextValue = {
  source: PlaylistSource | null;
  channels: IptvChannel[];
  selectedChannel: IptvChannel | null;
  diagnostics: PlaylistDiagnostics | null;
  status: PlaylistRuntimeStatus;
  progress: PlaylistLoadProgress | null;
  error: string | null;
  localCatalogScopeKey: string | null;
  localCatalogGenerationId: string | null;
  loadFromSource: (
    source: PlaylistSource,
    authorizationContext?: PlaylistRuntimeAuthorizationContext | null,
  ) => Promise<void>;
  loadFromChannels: (input: {
    source: PlaylistSource;
    channels: IptvChannel[];
    diagnostics?: PlaylistDiagnostics | null;
    authorizationContext?: PlaylistRuntimeAuthorizationContext | null;
  }) => void;
  selectChannel: (channel: IptvChannel) => void;
  clearRuntime: () => void;
  refreshFromSourceInBackground: (
    reason?: 'home_interactive' | 'resume' | 'manual',
  ) => Promise<LocalCatalogBackgroundRefreshResult | null>;
};

const PlaylistRuntimeContext =
  createContext<PlaylistRuntimeContextValue | null>(null);

function sanitizeSnapshotSidecarFailureCode(error: unknown) {
  if (
    error instanceof Error &&
    /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(error.message)
  ) {
    return error.message;
  }

  return 'LOCAL_CATALOG_SIDECAR_FAILED';
}

export function PlaylistRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [source, setSource] = useState<PlaylistSource | null>(null);
  const [channels, setChannels] = useState<IptvChannel[]>([]);
  const [selectedChannel, setSelectedChannel] =
    useState<IptvChannel | null>(null);
  const [diagnostics, setDiagnostics] =
    useState<PlaylistDiagnostics | null>(null);
  const [status, setStatus] =
    useState<PlaylistRuntimeStatus>('idle');
  const [progress, setProgress] =
    useState<PlaylistLoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localCatalogScopeKey, setLocalCatalogScopeKey] =
    useState<string | null>(null);
  const [localCatalogGenerationId, setLocalCatalogGenerationId] =
    useState<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const loadAbortControllerRef = useRef<AbortController | null>(null);
  const snapshotBridgeRef =
    useRef<LocalCatalogRuntimeSnapshotBridge | null>(null);
  const authorizationContextRef =
    useRef<PlaylistRuntimeAuthorizationContext | null>(null);
  const backgroundRefreshAbortControllerRef = useRef<AbortController | null>(null);
  const backgroundRefreshPromiseRef =
    useRef<Promise<LocalCatalogBackgroundRefreshResult | null> | null>(null);
  const backgroundRefreshEnabledRef = useRef(false);
  const coldRefreshAttemptedRef = useRef(false);
  const refreshCallbackRef = useRef<
    ((reason?: 'home_interactive' | 'resume' | 'manual') => Promise<LocalCatalogBackgroundRefreshResult | null>)
    | null
  >(null);

  const cancelActiveSnapshotBridge = useCallback(async () => {
    const activeBridge = snapshotBridgeRef.current;
    snapshotBridgeRef.current = null;

    if (!activeBridge) {
      return;
    }

    const activeStatus = activeBridge.getSanitizedMetrics().status;

    if (
      activeStatus === 'ready' ||
      activeStatus === 'active' ||
      activeStatus === 'failed' ||
      activeStatus === 'canceled'
    ) {
      return;
    }

    try {
      await activeBridge.cancel();
    } catch (snapshotError) {
      console.warn('[XANDEFLIX_LOCAL_CATALOG_CANCEL_FAILED]', {
        failureCode: sanitizeSnapshotSidecarFailureCode(snapshotError),
      });
    }
  }, []);

  const loadFromSource = useCallback(async (
    nextSource: PlaylistSource,
    authorizationContext?: PlaylistRuntimeAuthorizationContext | null,
  ) => {
    loadAbortControllerRef.current?.abort();
    await cancelActiveSnapshotBridge();
    const loadAbortController = new AbortController();
    loadAbortControllerRef.current = loadAbortController;
    const loadRequestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = loadRequestId;

    setStatus('loading');
    setError(null);
    setSource(nextSource);
    setChannels([]);
    setSelectedChannel(null);
    setDiagnostics(null);
    setProgress(null);
    setLocalCatalogScopeKey(null);
    setLocalCatalogGenerationId(null);
    authorizationContextRef.current = authorizationContext ?? null;

    if (
      authorizationContext?.internalLicenseId.trim() &&
      nextSource.sourceId?.trim()
    ) {
      try {
        const derivedScope = await deriveLocalCatalogScope({
          internalLicenseId: authorizationContext.internalLicenseId,
          sourceId: nextSource.sourceId,
        });
        setLocalCatalogScopeKey(derivedScope.scopeKey);
        const activeSnapshot = await getReadableLocalCatalogActiveSnapshot(
          derivedScope.scopeKey,
        );
        setLocalCatalogGenerationId(activeSnapshot?.snapshotId ?? null);
      } catch {
        setLocalCatalogScopeKey(null);
        setLocalCatalogGenerationId(null);
      }
    }

    let localImportSession: LocalCatalogImportSession | null = null;
    let snapshotBridge: LocalCatalogRuntimeSnapshotBridge | null = null;

    if (nextSource.sourceId && nextSource.sourceType === 'm3u') {
      try {
        localImportSession = await beginLocalCatalogImport({
          sourceId: nextSource.sourceId,
          sourceType: nextSource.sourceType,
          signal: loadAbortController.signal,
        });
      } catch (importError) {
        console.warn('[XANDEFLIX_LOCAL_CATALOG_IMPORT_SKIPPED]', {
          errorCode:
            importError instanceof Error &&
            /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(importError.message)
              ? importError.message
              : 'LOCAL_CATALOG_IMPORT_INIT_FAILED',
        });
      }
    }

    if (
      env.localCatalogSnapshotImportEnabled &&
      authorizationContext?.internalLicenseId.trim() &&
      nextSource.sourceId?.trim() &&
      nextSource.sourceType === 'm3u'
    ) {
      try {
        const { prepareLocalCatalogRuntimeSnapshotBridge } = await import(
          '@/features/localCatalog/services/localCatalogRuntimeSnapshotBridge.service'
        );
        snapshotBridge = await prepareLocalCatalogRuntimeSnapshotBridge({
          internalLicenseId: authorizationContext.internalLicenseId,
          sourceId: nextSource.sourceId,
          sourceType: nextSource.sourceType,
          signal: loadAbortController.signal,
          promotionEnabled: env.localCatalogSnapshotPromotionEnabled,
          parserVersion: 1,
          classificationVersion: LOCAL_CATALOG_CLASSIFICATION_VERSION,
        });
        snapshotBridgeRef.current = snapshotBridge;
      } catch (snapshotError) {
        console.warn('[XANDEFLIX_LOCAL_CATALOG_SIDECAR_SKIPPED]', {
          failureCode: sanitizeSnapshotSidecarFailureCode(snapshotError),
        });
      }
    }

    try {
      const playlist = await loadDirectSourcePlaylist(nextSource, {
        signal: loadAbortController.signal,
        onProgress: (nextProgress) => {
          if (loadRequestIdRef.current !== loadRequestId) {
            return;
          }

          setProgress(nextProgress);
        },
        onChannelsBatch: async (channelBatch) => {
          if (loadRequestIdRef.current !== loadRequestId) {
            return;
          }

          if (channelBatch.length === 0) {
            return;
          }

          setChannels((previousChannels) => [
            ...previousChannels,
            ...channelBatch,
          ]);

          if (localImportSession) {
            try {
              await localImportSession.writeBatch(channelBatch);
            } catch (importError) {
              await localImportSession.fail(importError).catch(() => undefined);
              localImportSession = null;
            }
          }

          if (snapshotBridge) {
            try {
              await snapshotBridge.writeBatch(channelBatch);
            } catch (snapshotError) {
              await snapshotBridge
                .fail(sanitizeSnapshotSidecarFailureCode(snapshotError))
                .catch(() => undefined);
              snapshotBridge = null;
            }
          }
        },
      });

      if (loadRequestIdRef.current !== loadRequestId) {
        await localImportSession?.cancel().catch(() => undefined);
        await snapshotBridge?.cancel().catch(() => undefined);
        return;
      }

      await localImportSession?.complete().catch(() => undefined);

      if (
        loadRequestIdRef.current !== loadRequestId ||
        loadAbortController.signal.aborted
      ) {
        await snapshotBridge?.cancel().catch(() => undefined);
        return;
      }

      if (snapshotBridge) {
        try {
          await snapshotBridge.complete({ parsedItems: playlist.total });
          if (
            loadRequestIdRef.current !== loadRequestId ||
            loadAbortController.signal.aborted
          ) {
            await snapshotBridge.cancel().catch(() => undefined);
            return;
          }
          if (
            env.localCatalogSnapshotPromotionEnabled &&
            loadRequestIdRef.current === loadRequestId &&
            !loadAbortController.signal.aborted
          ) {
            await snapshotBridge.promote();
            setLocalCatalogGenerationId(snapshotBridge.getSnapshotId());
          }
        } catch (snapshotError) {
          await snapshotBridge
            .fail(sanitizeSnapshotSidecarFailureCode(snapshotError))
            .catch(() => undefined);
          snapshotBridge = null;
        }
      }

      if (
        loadRequestIdRef.current !== loadRequestId ||
        loadAbortController.signal.aborted
      ) {
        return;
      }

      setChannels(playlist.channels);
      setDiagnostics(playlist.diagnostics);
      setStatus(playlist.total > 0 ? 'ready' : 'empty');
      setProgress((previousProgress) =>
        previousProgress
          ? {
              ...previousProgress,
              phase: 'finalizing',
              channelsParsed: playlist.total,
              bytesReceived: playlist.diagnostics.contentLength,
              bytesTotal:
                previousProgress.bytesTotal ??
                playlist.diagnostics.contentLength,
            }
          : null,
      );

      if (playlist.total === 0) {
        setError(
          'A fonte foi carregada, mas nenhum canal válido foi encontrado.',
        );
      }
    } catch (loadError) {
      if (loadAbortController.signal.aborted) {
        await localImportSession?.cancel().catch(() => undefined);
        await snapshotBridge?.cancel().catch(() => undefined);
      } else {
        await localImportSession?.fail(loadError).catch(() => undefined);
        await snapshotBridge
          ?.fail('LOCAL_CATALOG_PLAYLIST_LOAD_FAILED')
          .catch(() => undefined);
      }

      if (loadRequestIdRef.current !== loadRequestId) {
        return;
      }

      setStatus('error');
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Erro desconhecido ao carregar playlist.',
      );
    } finally {
      if (loadAbortControllerRef.current === loadAbortController) {
        loadAbortControllerRef.current = null;
      }
    }
  }, [cancelActiveSnapshotBridge]);

  useEffect(() => () => {
    loadAbortControllerRef.current?.abort();
    loadAbortControllerRef.current = null;
    loadRequestIdRef.current += 1;
    void cancelActiveSnapshotBridge();
    backgroundRefreshAbortControllerRef.current?.abort();
    backgroundRefreshAbortControllerRef.current = null;
  }, [cancelActiveSnapshotBridge]);

  const loadFromChannels = useCallback(
    ({
      source: nextSource,
      channels: nextChannels,
      diagnostics: nextDiagnostics = null,
      authorizationContext = null,
    }: {
      source: PlaylistSource;
      channels: IptvChannel[];
      diagnostics?: PlaylistDiagnostics | null;
      authorizationContext?: PlaylistRuntimeAuthorizationContext | null;
    }) => {
      loadAbortControllerRef.current?.abort();
      loadAbortControllerRef.current = null;
      loadRequestIdRef.current += 1;
      void cancelActiveSnapshotBridge();
      setError(null);
      setSource(nextSource);
      setChannels(nextChannels);
      setSelectedChannel(null);
      setDiagnostics(nextDiagnostics);
      setStatus(nextChannels.length > 0 ? 'ready' : 'empty');
      setProgress(null);
      setLocalCatalogScopeKey(null);
      setLocalCatalogGenerationId(null);
      authorizationContextRef.current = authorizationContext;
      console.info('[XANDEFLIX_SEARCH_SCOPE]', {
        present: false,
        authorizationContextPresent: Boolean(
          authorizationContext?.internalLicenseId.trim(),
        ),
        sourcePresent: Boolean(nextSource.sourceId?.trim()),
      });
      if (
        authorizationContext?.internalLicenseId.trim() &&
        nextSource.sourceId?.trim()
      ) {
        void deriveLocalCatalogScope({
          internalLicenseId: authorizationContext.internalLicenseId,
          sourceId: nextSource.sourceId,
        })
          .then(async (derivedScope) => {
            console.info('[XANDEFLIX_SEARCH_SCOPE]', { present: true });
            setLocalCatalogScopeKey(derivedScope.scopeKey);
            const activeSnapshot = await getReadableLocalCatalogActiveSnapshot(
              derivedScope.scopeKey,
            );
            setLocalCatalogGenerationId(activeSnapshot?.snapshotId ?? null);
          })
          .catch(() => {
            console.warn('[XANDEFLIX_SEARCH_SCOPE]', {
              present: false,
              failureCode: 'LOCAL_CATALOG_SCOPE_DERIVATION_FAILED',
            });
            setLocalCatalogScopeKey(null);
            setLocalCatalogGenerationId(null);
          });
      }
    },
    [cancelActiveSnapshotBridge],
  );

  const refreshFromSourceInBackground = useCallback(
    (
      reason: 'home_interactive' | 'resume' | 'manual' = 'home_interactive',
    ) => {
      backgroundRefreshEnabledRef.current = true;

      if (reason === 'home_interactive') {
        if (coldRefreshAttemptedRef.current) {
          return Promise.resolve(null);
        }
        coldRefreshAttemptedRef.current = true;
      }

      if (backgroundRefreshPromiseRef.current) {
        return backgroundRefreshPromiseRef.current;
      }

      const currentAuthorizationContext = authorizationContextRef.current;

      if (
        !env.localCatalogSnapshotImportEnabled ||
        !env.localCatalogSnapshotPromotionEnabled ||
        !source?.sourceId?.trim() ||
        !source.url.trim() ||
        !localCatalogScopeKey ||
        !currentAuthorizationContext?.internalLicenseId.trim()
      ) {
        return Promise.resolve(null);
      }

      const abortController = new AbortController();
      backgroundRefreshAbortControllerRef.current = abortController;
      markDiscoveryPerformance('source_refresh_start', { once: false });
      const refreshPromise = refreshLocalCatalogInBackground({
        source,
        authorizationContext: currentAuthorizationContext,
        scopeKey: localCatalogScopeKey,
        signal: abortController.signal,
        force: reason === 'manual',
      })
        .then((result) => {
          console.info('[XANDEFLIX_SOURCE_REFRESH_RESULT]', {
            reason,
            status: result.status,
            requestCount: result.requestCount,
            promoted: result.promoted,
            itemCount: result.itemCount,
            durationMs: result.durationMs,
            failureCode: result.failureCode,
          });

          if (result.activeGenerationId) {
            setLocalCatalogGenerationId(result.activeGenerationId);
          }

          if (result.promoted && source.sourceId) {
            clearHomeVodCache();
            invalidateAppBootstrapHomeCatalogCache(source.sourceId);
          }

          return result;
        })
        .finally(() => {
          markDiscoveryPerformance('source_refresh_end', { once: false });
          if (backgroundRefreshAbortControllerRef.current === abortController) {
            backgroundRefreshAbortControllerRef.current = null;
          }
          if (backgroundRefreshPromiseRef.current === refreshPromise) {
            backgroundRefreshPromiseRef.current = null;
          }
        });

      backgroundRefreshPromiseRef.current = refreshPromise;
      return refreshPromise;
    },
    [localCatalogScopeKey, source],
  );

  refreshCallbackRef.current = refreshFromSourceInBackground;

  useEffect(() => {
    let isMounted = true;
    let appStateListener: { remove: () => Promise<void> } | null = null;

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isMounted) {
        return;
      }

      if (!isActive) {
        backgroundRefreshAbortControllerRef.current?.abort();
        return;
      }

      if (backgroundRefreshEnabledRef.current) {
        void refreshCallbackRef.current?.('resume');
      }
    }).then((listener) => {
      if (!isMounted) {
        void listener.remove();
        return;
      }
      appStateListener = listener;
    });

    return () => {
      isMounted = false;
      if (appStateListener) {
        void appStateListener.remove();
      }
    };
  }, []);

  const selectChannel = useCallback((channel: IptvChannel) => {
    setSelectedChannel(channel);
  }, []);

  const clearRuntime = useCallback(() => {
    loadAbortControllerRef.current?.abort();
    loadAbortControllerRef.current = null;
    loadRequestIdRef.current += 1;
    void cancelActiveSnapshotBridge();
    setSource(null);
    setChannels([]);
    setSelectedChannel(null);
    setDiagnostics(null);
    setStatus('idle');
    setProgress(null);
    setLocalCatalogScopeKey(null);
    setLocalCatalogGenerationId(null);
    setError(null);
    authorizationContextRef.current = null;
    backgroundRefreshAbortControllerRef.current?.abort();
    backgroundRefreshAbortControllerRef.current = null;
    backgroundRefreshEnabledRef.current = false;
    coldRefreshAttemptedRef.current = false;
  }, [cancelActiveSnapshotBridge]);

  useEffect(() => {
    function handleClientRuntimeAccessRevoked() {
      clearRuntime();
    }

    window.addEventListener(
      CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
      handleClientRuntimeAccessRevoked,
    );

    return () => {
      window.removeEventListener(
        CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
        handleClientRuntimeAccessRevoked,
      );
      loadAbortControllerRef.current?.abort();
    };
  }, [clearRuntime]);

  const value = useMemo(
    () => ({
      source,
      channels,
      selectedChannel,
      diagnostics,
      status,
      progress,
      error,
      localCatalogScopeKey,
      localCatalogGenerationId,
      loadFromSource,
      loadFromChannels,
      selectChannel,
      clearRuntime,
      refreshFromSourceInBackground,
    }),
    [
      source,
      channels,
      selectedChannel,
      diagnostics,
      status,
      progress,
      error,
      localCatalogScopeKey,
      localCatalogGenerationId,
      loadFromSource,
      loadFromChannels,
      selectChannel,
      clearRuntime,
      refreshFromSourceInBackground,
    ],
  );

  return (
    <PlaylistRuntimeContext.Provider value={value}>
      {children}
    </PlaylistRuntimeContext.Provider>
  );
}

// Existing provider/context colocation is intentionally preserved in this subcycle.
// eslint-disable-next-line react-refresh/only-export-components
export function usePlaylistRuntime() {
  const context = useContext(PlaylistRuntimeContext);

  if (!context) {
    throw new Error(
      'usePlaylistRuntime deve ser usado dentro de PlaylistRuntimeProvider.',
    );
  }

  return context;
}
