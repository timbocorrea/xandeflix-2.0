import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { loadDirectSourcePlaylist } from '../lib/directSourcePlaylistLoader';
import {
  beginLocalCatalogImport,
  type LocalCatalogImportSession,
} from '@/features/localCatalog/services/localPlaylistImport.service';
import type {
  IptvChannel,
  PlaylistDiagnostics,
  PlaylistLoadProgress,
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
  loadFromSource: (source: PlaylistSource) => Promise<void>;
  loadFromChannels: (input: {
    source: PlaylistSource;
    channels: IptvChannel[];
    diagnostics?: PlaylistDiagnostics | null;
  }) => void;
  selectChannel: (channel: IptvChannel) => void;
  clearRuntime: () => void;
};

const PlaylistRuntimeContext =
  createContext<PlaylistRuntimeContextValue | null>(null);

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
  const loadRequestIdRef = useRef(0);
  const loadAbortControllerRef = useRef<AbortController | null>(null);

  const loadFromSource = useCallback(async (nextSource: PlaylistSource) => {
    loadAbortControllerRef.current?.abort();
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

    let localImportSession: LocalCatalogImportSession | null = null;

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
        },
      });

      if (loadRequestIdRef.current !== loadRequestId) {
        await localImportSession?.cancel().catch(() => undefined);
        return;
      }

      await localImportSession?.complete().catch(() => undefined);

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
      } else {
        await localImportSession?.fail(loadError).catch(() => undefined);
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
  }, []);

  const loadFromChannels = useCallback(
    ({
      source: nextSource,
      channels: nextChannels,
      diagnostics: nextDiagnostics = null,
    }: {
      source: PlaylistSource;
      channels: IptvChannel[];
      diagnostics?: PlaylistDiagnostics | null;
    }) => {
      loadAbortControllerRef.current?.abort();
      loadAbortControllerRef.current = null;
      loadRequestIdRef.current += 1;
      setError(null);
      setSource(nextSource);
      setChannels(nextChannels);
      setSelectedChannel(null);
      setDiagnostics(nextDiagnostics);
      setStatus(nextChannels.length > 0 ? 'ready' : 'empty');
      setProgress(null);
    },
    [],
  );

  const selectChannel = useCallback((channel: IptvChannel) => {
    setSelectedChannel(channel);
  }, []);

  const clearRuntime = useCallback(() => {
    loadAbortControllerRef.current?.abort();
    loadAbortControllerRef.current = null;
    loadRequestIdRef.current += 1;
    setSource(null);
    setChannels([]);
    setSelectedChannel(null);
    setDiagnostics(null);
    setStatus('idle');
    setProgress(null);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      source,
      channels,
      selectedChannel,
      diagnostics,
      status,
      progress,
      error,
      loadFromSource,
      loadFromChannels,
      selectChannel,
      clearRuntime,
    }),
    [
      source,
      channels,
      selectedChannel,
      diagnostics,
      status,
      progress,
      error,
      loadFromSource,
      loadFromChannels,
      selectChannel,
      clearRuntime,
    ],
  );

  return (
    <PlaylistRuntimeContext.Provider value={value}>
      {children}
    </PlaylistRuntimeContext.Provider>
  );
}

export function usePlaylistRuntime() {
  const context = useContext(PlaylistRuntimeContext);

  if (!context) {
    throw new Error(
      'usePlaylistRuntime deve ser usado dentro de PlaylistRuntimeProvider.',
    );
  }

  return context;
}
