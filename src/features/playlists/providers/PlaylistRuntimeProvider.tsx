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

  const loadFromSource = useCallback(async (nextSource: PlaylistSource) => {
    const loadRequestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = loadRequestId;

    setStatus('loading');
    setError(null);
    setSource(nextSource);
    setChannels([]);
    setSelectedChannel(null);
    setDiagnostics(null);
    setProgress(null);

    try {
      const playlist = await loadDirectSourcePlaylist(nextSource, {
        onProgress: (nextProgress) => {
          if (loadRequestIdRef.current !== loadRequestId) {
            return;
          }

          setProgress(nextProgress);
        },
        onChannelsBatch: (channelBatch) => {
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
        },
      });

      if (loadRequestIdRef.current !== loadRequestId) {
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
      if (loadRequestIdRef.current !== loadRequestId) {
        return;
      }

      setStatus('error');
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Erro desconhecido ao carregar playlist.',
      );
    }
  }, []);

  const selectChannel = useCallback((channel: IptvChannel) => {
    setSelectedChannel(channel);
  }, []);

  const clearRuntime = useCallback(() => {
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
