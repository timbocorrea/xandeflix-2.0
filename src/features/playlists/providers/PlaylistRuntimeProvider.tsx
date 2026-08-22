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
import { isVodChannel } from '../lib/channelClassification';
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
import { listStagingFirstFoldHomeVodSections } from '@/features/localCatalog/readModels/localCatalogFirstFoldReadModel.service';
import { e8DiagnosticLog } from '@/platform/e8DiagnosticLog';
import type {
  FirstFoldReadyPayload,
  IptvChannel,
  LoadedPlaylist,
  PlaylistDiagnostics,
  PlaylistLoadProgress,
  PlaylistRuntimeAuthorizationContext,
  PlaylistRuntimeStatus,
  PlaylistSource,
  SourceImportTask,
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
  startSourceImport: (
    source: PlaylistSource,
    authorizationContext?: PlaylistRuntimeAuthorizationContext | null,
  ) => SourceImportTask;
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

const E8_BATCH_LOG_SAMPLE_INTERVAL = 50;

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

  const loadAbortControllerRef = useRef<AbortController | null>(null);
  const loadRequestIdRef = useRef<number>(0);
  const inFlightImportTaskRef = useRef<SourceImportTask | null>(null);
  const authorizationContextRef =
    useRef<PlaylistRuntimeAuthorizationContext | null>(null);
  const snapshotBridgeRef = useRef<LocalCatalogRuntimeSnapshotBridge | null>(
    null,
  );
  const backgroundRefreshAbortControllerRef = useRef<AbortController | null>(
    null,
  );
  const backgroundRefreshPromiseRef =
    useRef<Promise<LocalCatalogBackgroundRefreshResult | null> | null>(null);
  const backgroundRefreshEnabledRef = useRef<boolean>(false);
  const coldRefreshAttemptedRef = useRef<boolean>(false);
  const refreshCallbackRef = useRef<
    | ((
        reason?: 'home_interactive' | 'resume' | 'manual',
      ) => Promise<LocalCatalogBackgroundRefreshResult | null>)
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

  const startSourceImport = useCallback((
    nextSource: PlaylistSource,
    authorizationContext?: PlaylistRuntimeAuthorizationContext | null,
  ): SourceImportTask => {
    e8DiagnosticLog('START_SOURCE_IMPORT_ENTER');
    const internalLicenseId =
      authorizationContext?.internalLicenseId?.trim() ?? '';
    const sourceId = nextSource.sourceId?.trim() ?? '';
    const sourceType = nextSource.sourceType ?? 'm3u';
    const dedupKey = `${sourceType}:${sourceId || nextSource.url}:${internalLicenseId}`;

    if (
      inFlightImportTaskRef.current &&
      inFlightImportTaskRef.current.dedupKey === dedupKey &&
      !loadAbortControllerRef.current?.signal.aborted
    ) {
      e8DiagnosticLog('START_SOURCE_IMPORT_EARLY_RETURN', {
        reason: 'IN_FLIGHT_DEDUP',
      });
      return inFlightImportTaskRef.current;
    }

    const importStartedAt = performance.now();
    const diagnosticElapsedMs = () =>
      Math.round(performance.now() - importStartedAt);
    e8DiagnosticLog('IMPORT_START', {
      elapsedMs: 0,
      collectChannels: false,
      managedBootstrap: Boolean(
        env.localCatalogSnapshotImportEnabled &&
          internalLicenseId &&
          sourceId &&
          sourceType === 'm3u',
      ),
    });

    loadAbortControllerRef.current?.abort();
    void cancelActiveSnapshotBridge();
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

    let resolveFirstFold!: (payload: FirstFoldReadyPayload) => void;
    let rejectFirstFold!: (error: unknown) => void;
    const firstFoldReady = new Promise<FirstFoldReadyPayload>(
      (resolve, reject) => {
        resolveFirstFold = resolve;
        rejectFirstFold = reject;
      },
    );

    let resolveCompletion!: (playlist: LoadedPlaylist) => void;
    let rejectCompletion!: (error: unknown) => void;
    const completion = new Promise<LoadedPlaylist>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    completion.catch(() => undefined);

    let firstFoldSettled = false;
    let firstVodDetected = false;
    let batchSequence = 0;
    let processedItems = 0;

    const resolveFirstFoldWithDiagnostic = (
      payload: FirstFoldReadyPayload,
      atEof: boolean,
    ) => {
      e8DiagnosticLog('FIRST_FOLD_READY_EMITTED', {
        elapsedMs: diagnosticElapsedMs(),
        readMode: payload.readMode,
        atEof,
        hasRenderableVodSections: payload.hasRenderableVodSections,
      });
      resolveFirstFold(payload);
    };

    const task: SourceImportTask = {
      dedupKey,
      sourceId,
      scopeKey: null,
      stagingSnapshotId: null,
      firstFoldReady,
      completion,
      abort: () => loadAbortController.abort(),
    };
    inFlightImportTaskRef.current = task;

    void (async () => {
      let derivedScopeKey: string | null = null;
      if (internalLicenseId && sourceId) {
        try {
          const derivedScope = await deriveLocalCatalogScope({
            internalLicenseId,
            sourceId,
          });
          derivedScopeKey = derivedScope.scopeKey;
          task.scopeKey = derivedScopeKey;
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

      if (
        !env.localCatalogSnapshotImportEnabled &&
        sourceId &&
        sourceType === 'm3u'
      ) {
        try {
          localImportSession = await beginLocalCatalogImport({
            sourceId,
            sourceType,
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
        internalLicenseId &&
        sourceId &&
        sourceType === 'm3u'
      ) {
        try {
          const { prepareLocalCatalogRuntimeSnapshotBridge } = await import(
            '@/features/localCatalog/services/localCatalogRuntimeSnapshotBridge.service'
          );
          snapshotBridge = await prepareLocalCatalogRuntimeSnapshotBridge({
            internalLicenseId,
            sourceId,
            sourceType,
            signal: loadAbortController.signal,
            promotionEnabled: env.localCatalogSnapshotPromotionEnabled,
            parserVersion: 1,
            classificationVersion: LOCAL_CATALOG_CLASSIFICATION_VERSION,
          });
          snapshotBridgeRef.current = snapshotBridge;
          task.stagingSnapshotId = snapshotBridge.getSnapshotId();
        } catch (snapshotError) {
          console.warn('[XANDEFLIX_LOCAL_CATALOG_SIDECAR_SKIPPED]', {
            failureCode: sanitizeSnapshotSidecarFailureCode(snapshotError),
          });
        }
      }

      try {
        const playlist = await loadDirectSourcePlaylist(nextSource, {
          signal: loadAbortController.signal,
          collectChannels: false,
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

            batchSequence += 1;
            processedItems += channelBatch.length;
            const hasVodCandidate =
              !firstFoldSettled &&
              channelBatch.some((channel) => isVodChannel(channel));
            const isFirstVodCandidate =
              hasVodCandidate && !firstVodDetected;
            if (isFirstVodCandidate) {
              firstVodDetected = true;
            }
            const shouldLogBatchSample =
              batchSequence === 1 ||
              batchSequence % E8_BATCH_LOG_SAMPLE_INTERVAL === 0 ||
              isFirstVodCandidate;

            if (shouldLogBatchSample) {
              e8DiagnosticLog('BATCH_SAMPLE', {
                elapsedMs: diagnosticElapsedMs(),
                batchSequence,
                batchSize: channelBatch.length,
                processedItems,
                firstFoldSettled,
              });
            }

            if (isFirstVodCandidate) {
              e8DiagnosticLog('FIRST_VOD_DETECTED', {
                elapsedMs: diagnosticElapsedMs(),
                batchSequence,
                batchSize: channelBatch.length,
                processedItems,
                firstFoldSettled,
              });
            }

            if (localImportSession) {
              try {
                await localImportSession.writeBatch(channelBatch);
              } catch (importError) {
                await localImportSession
                  .fail(importError)
                  .catch(() => undefined);
                localImportSession = null;
              }
            }

            if (snapshotBridge) {
              const writeStartedAt = shouldLogBatchSample
                ? performance.now()
                : null;
              try {
                await snapshotBridge.writeBatch(channelBatch);
                if (writeStartedAt !== null) {
                  e8DiagnosticLog('V3_WRITE_SAMPLE', {
                    elapsedMs: diagnosticElapsedMs(),
                    batchSequence,
                    batchSize: channelBatch.length,
                    writeElapsedMs: Math.round(
                      performance.now() - writeStartedAt,
                    ),
                    processedItems,
                  });
                }
              } catch (snapshotError) {
                await snapshotBridge
                  .fail(sanitizeSnapshotSidecarFailureCode(snapshotError))
                  .catch(() => undefined);
                snapshotBridge = null;
              }
            }

            if (
              !firstFoldSettled &&
              snapshotBridge &&
              derivedScopeKey &&
              hasVodCandidate
            ) {
              const stagingSnapshotId = snapshotBridge.getSnapshotId();
              try {
                const readStartedAt = performance.now();
                e8DiagnosticLog('FIRST_FOLD_READ_START', {
                  elapsedMs: diagnosticElapsedMs(),
                  batchSequence,
                  processedItems,
                });
                const stagingSections =
                  await listStagingFirstFoldHomeVodSections({
                    scopeKey: derivedScopeKey,
                    snapshotId: stagingSnapshotId,
                    sourceId,
                    maxSections: 4,
                    itemsPerSection: 20,
                  });
                const hasRenderableSections = stagingSections.length > 0;
                e8DiagnosticLog('FIRST_FOLD_READ_DONE', {
                  elapsedMs: diagnosticElapsedMs(),
                  batchSequence,
                  readElapsedMs: Math.round(
                    performance.now() - readStartedAt,
                  ),
                  sectionCount: stagingSections.length,
                  itemCount: stagingSections.reduce(
                    (total, section) => total + section.items.length,
                    0,
                  ),
                  hasRenderableSections,
                });
                if (hasRenderableSections) {
                  firstFoldSettled = true;
                  resolveFirstFoldWithDiagnostic(
                    {
                      sourceId,
                      scopeKey: derivedScopeKey,
                      snapshotId: stagingSnapshotId,
                      readMode: 'staging',
                      hasRenderableVodSections: true,
                      homeSections: stagingSections,
                    },
                    false,
                  );
                }
              } catch {
                // Non-blocking first fold inspection
              }
            }
          },
        });

        e8DiagnosticLog('IMPORT_EOF', {
          elapsedMs: diagnosticElapsedMs(),
          processedItems,
          playlistTotal: playlist.total,
          firstFoldSettled,
        });

        if (loadRequestIdRef.current !== loadRequestId) {
          await localImportSession?.cancel().catch(() => undefined);
          await snapshotBridge?.cancel().catch(() => undefined);
          if (!firstFoldSettled) {
            firstFoldSettled = true;
            rejectFirstFold(new Error('LOCAL_CATALOG_IMPORT_SUPERSEDED'));
          }
          rejectCompletion(new Error('LOCAL_CATALOG_IMPORT_SUPERSEDED'));
          return;
        }

        await localImportSession?.complete().catch(() => undefined);

        if (
          loadRequestIdRef.current !== loadRequestId ||
          loadAbortController.signal.aborted
        ) {
          await snapshotBridge?.cancel().catch(() => undefined);
          if (!firstFoldSettled) {
            firstFoldSettled = true;
            rejectFirstFold(new Error('LOCAL_CATALOG_IMPORT_ABORTED'));
          }
          rejectCompletion(new Error('LOCAL_CATALOG_IMPORT_ABORTED'));
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
              e8DiagnosticLog('SNAPSHOT_PROMOTED', {
                elapsedMs: diagnosticElapsedMs(),
                processedItems,
              });
              const promotedSnapshotId = snapshotBridge.getSnapshotId();
              setLocalCatalogGenerationId(promotedSnapshotId);

              try {
                const { buildLocalCatalogSeriesLookup } = await import(
                  '@/features/localCatalog/services/localCatalogSeriesLookup.service'
                );
                void buildLocalCatalogSeriesLookup({
                  snapshotId: promotedSnapshotId,
                });
              } catch (seriesLookupError) {
                console.warn(
                  '[XANDEFLIX_SERIES_LOOKUP_BACKGROUND_INIT_FAILED]',
                  seriesLookupError,
                );
              }
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

        if (!firstFoldSettled) {
          firstFoldSettled = true;
          resolveFirstFoldWithDiagnostic(
            {
              sourceId,
              scopeKey: derivedScopeKey ?? '',
              snapshotId: snapshotBridge?.getSnapshotId() ?? '',
              readMode: 'active',
              hasRenderableVodSections: playlist.total > 0,
            },
            true,
          );
        }

        resolveCompletion(playlist);
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

        if (!firstFoldSettled) {
          firstFoldSettled = true;
          rejectFirstFold(loadError);
        }
        rejectCompletion(loadError);
      } finally {
        if (loadAbortControllerRef.current === loadAbortController) {
          loadAbortControllerRef.current = null;
        }
        if (inFlightImportTaskRef.current === task) {
          inFlightImportTaskRef.current = null;
        }
      }
    })();

    return task;
  }, [cancelActiveSnapshotBridge]);

  const loadFromSource = useCallback(
    async (
      nextSource: PlaylistSource,
      authorizationContext?: PlaylistRuntimeAuthorizationContext | null,
    ): Promise<void> => {
      const task = startSourceImport(nextSource, authorizationContext);
      await task.completion;
    },
    [startSourceImport],
  );

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
      if (inFlightImportTaskRef.current) {
        return Promise.resolve(null);
      }

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
    inFlightImportTaskRef.current?.abort();
    inFlightImportTaskRef.current = null;
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
      startSourceImport,
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
      startSourceImport,
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
