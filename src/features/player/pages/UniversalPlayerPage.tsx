import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { App } from '@capacitor/app';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { FocusableButton } from '@/components/tv/FocusableButton';
import { createHlsAdapter } from '../lib/hlsAdapter';
import { createMpegTsAdapter } from '../lib/mpegTsAdapter';
import {
  createNativeAndroidPlayerAdapter,
  isNativeAndroidPlayerAvailable,
} from '../lib/nativeAndroidPlayerAdapter';
import { createNativeVideoAdapter } from '../lib/nativeVideoAdapter';
import { maskStreamUrl } from '@/lib/security/maskStreamUrl';
import { logPlayerDebugEvent } from '../lib/playerDebug';
import { prepareUniversalPlayerSource } from '../lib/playerFactory';
import {
  startPlaybackSession,
  heartbeatPlaybackSession,
  endPlaybackSession,
} from '@/features/licensing/services/playbackSession.service';
import {
  markEpisodePlaybackStarted,
  updateEpisodePlaybackPosition,
} from '@/features/catalog/services/episodePlaybackProgress.service';
import type {
  PlayerError,
  PlayerTelemetryEvent,
  PlayerStatus,
  UniversalPlayerAdapter,
} from '../types/player';

const MAX_PLAYER_TELEMETRY_EVENTS = 40;

type FullscreenVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitSupportsFullscreen?: boolean;
};

function createPlayerEvent(
  source: PlayerTelemetryEvent['source'],
  name: string,
  level: PlayerTelemetryEvent['level'],
  message?: string,
  data?: Record<string, unknown>,
): PlayerTelemetryEvent {
  return {
    source,
    name,
    level,
    message,
    timestamp: Date.now(),
    data,
  };
}

function normalizePlaybackError(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name || 'Erro sem mensagem.';
  }

  if (error && typeof error === 'object') {
    const maybeError = error as {
      code?: unknown;
      message?: unknown;
      name?: unknown;
      nativeCode?: unknown;
      nativeMessage?: unknown;
    };

    const details = [
      typeof maybeError.name === 'string' ? maybeError.name : null,
      typeof maybeError.message === 'string' ? maybeError.message : null,
      typeof maybeError.nativeMessage === 'string' ? maybeError.nativeMessage : null,
      typeof maybeError.code !== 'undefined' ? `code=${String(maybeError.code)}` : null,
      typeof maybeError.nativeCode !== 'undefined'
        ? `nativeCode=${String(maybeError.nativeCode)}`
        : null,
    ].filter(Boolean);

    if (details.length > 0) {
      return details.join(' · ');
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return 'Erro desconhecido de reprodução.';
}

async function requestPlayerFullscreen(videoElement: HTMLVideoElement) {
  const video = videoElement as FullscreenVideoElement;

  if (typeof video.requestFullscreen === 'function') {
    await video.requestFullscreen();
    return;
  }

  if (
    typeof video.webkitEnterFullscreen === 'function' &&
    video.webkitSupportsFullscreen
  ) {
    video.webkitEnterFullscreen();
    return;
  }

  throw new Error('Fullscreen não suportado neste dispositivo.');
}

async function exitPlayerFullscreen(videoElement: HTMLVideoElement) {
  const video = videoElement as FullscreenVideoElement;

  if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
    await document.exitFullscreen();
    return;
  }

  if (typeof video.webkitExitFullscreen === 'function') {
    video.webkitExitFullscreen();
    return;
  }
}

export default function UniversalPlayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const adapterRef = useRef<UniversalPlayerAdapter | null>(null);
  const playbackSessionIdRef = useRef<string | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);

  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [playbackError, setPlaybackError] = useState<PlayerError | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [telemetryEvents, setTelemetryEvents] = useState<PlayerTelemetryEvent[]>(
    [],
  );
  const hasAutoOpenedDirectPlayerRef = useRef(false);
  const shouldReturnFromDirectPlayerRef = useRef(false);

  const streamUrl = searchParams.get('src') ?? '';
  const title = searchParams.get('title') ?? 'Conteúdo Xandeflix';
  const isDirectPlayback = searchParams.get('direct') === '1';
  const episodeId = searchParams.get('episodeId');
  const episodeIndex = searchParams.get('episodeIndex');
  const startPositionMs = Number(searchParams.get('startPositionMs') ?? 0);
  const seriesTitle = searchParams.get('seriesTitle');
  const seriesGroupTitle = searchParams.get('seriesGroupTitle');
  const seriesTmdbId = searchParams.get('seriesTmdbId');
  const seriesTmdbTitle = searchParams.get('seriesTmdbTitle');
  const maskedStreamUrl = useMemo(() => maskStreamUrl(streamUrl), [streamUrl]);

  const preparation = useMemo(() => {
    return prepareUniversalPlayerSource({
      url: streamUrl,
      title,
    });
  }, [streamUrl, title]);

  const stream = preparation.ok ? preparation.stream : preparation.stream;
  const preparationError = preparation.ok ? null : preparation.error;
  const usesNativeAndroidPlayer =
    preparation.ok && isNativeAndroidPlayerAvailable(stream?.kind);
  const currentError = playbackError ?? preparationError;
  const isPlaybackReady = preparation.ok && status !== 'unsupported';
  const isPlaying = !usesNativeAndroidPlayer && status === 'playing';
  const isBusy =
    status === 'loading' || (!usesNativeAndroidPlayer && status === 'buffering');
  const playbackButtonLabel = usesNativeAndroidPlayer
    ? 'Abrir player'
    : isPlaying
      ? 'Pausar'
      : 'Reproduzir';

  const pushTelemetryEvent = useCallback((event: PlayerTelemetryEvent) => {
    setTelemetryEvents((currentEvents) => {
      return [event, ...currentEvents].slice(0, MAX_PLAYER_TELEMETRY_EVENTS);
    });

    logPlayerDebugEvent(event);
  }, []);

  const restorePlayerFocus = useCallback(() => {
    window.setTimeout(() => {
      setFocus('player-play-button');
    }, 120);
  }, []);

  useEffect(() => {
    restorePlayerFocus();
  }, [restorePlayerFocus]);

  useEffect(() => {
    if (status === 'error' || status === 'unsupported') {
      window.setTimeout(() => {
        setFocus('player-back-button');
      }, 100);
    }
  }, [status]);

  const pushPlayerEvent = useCallback(
    (
      name: string,
      level: PlayerTelemetryEvent['level'],
      message?: string,
      data?: Record<string, unknown>,
    ) => {
      pushTelemetryEvent(createPlayerEvent('player', name, level, message, data));
    },
    [pushTelemetryEvent],
  );

  useEffect(() => {
    if (!usesNativeAndroidPlayer) {
      return;
    }

    const handleNativeReturnFocus = () => {
      pushTelemetryEvent(
        createPlayerEvent(
          'player',
          'PLAYER_NATIVE_RETURN_FOCUS',
          'info',
          'Tela do Player recuperou foco após retorno do player nativo.',
          {
            kind: stream?.kind ?? null,
            url: maskedStreamUrl,
          },
        ),
      );

      restorePlayerFocus();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleNativeReturnFocus();
      }
    };

    window.addEventListener('focus', handleNativeReturnFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const appListenerPromise = App.addListener('resume', handleNativeReturnFocus);

    return () => {
      window.removeEventListener('focus', handleNativeReturnFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      void appListenerPromise.then((listener) => {
        listener.remove();
      });
    };
  }, [
    maskedStreamUrl,
    pushTelemetryEvent,
    restorePlayerFocus,
    stream?.kind,
    usesNativeAndroidPlayer,
  ]);

  const pushNativeVideoEvent = useCallback(
    (
      name: string,
      level: PlayerTelemetryEvent['level'],
      message?: string,
      data?: Record<string, unknown>,
    ) => {
      pushTelemetryEvent(createPlayerEvent('native', name, level, message, data));
    },
    [pushTelemetryEvent],
  );

  useEffect(() => {
    setTelemetryEvents([]);
  }, [streamUrl, title]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, []);

    const endCurrentPlaybackSession = useCallback(() => {
      if (heartbeatIntervalRef.current) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      const currentSessionId = playbackSessionIdRef.current;

      if (!currentSessionId) {
        return;
      }

      playbackSessionIdRef.current = null;
      void endPlaybackSession(currentSessionId);
    }, []);

    const ensurePlaybackSessionStarted = useCallback(async () => {
      if (playbackSessionIdRef.current) {
        return;
      }

      const playbackSession = await startPlaybackSession({
        channelName: title,
        streamUrl,
      });

      playbackSessionIdRef.current = playbackSession.id;

      markEpisodePlaybackStarted({
        episodeId,
        streamUrl,
        title,
        seriesTitle,
        seriesGroupTitle,
        seriesTmdbId,
        seriesTmdbTitle,
        episodeIndex: episodeIndex ? Number(episodeIndex) : null,
      });

      pushPlayerEvent(
        'PLAYBACK_SESSION_STARTED',
        'info',
        'Sessão de reprodução iniciada para controle de telas simultâneas.',
        {
          sessionId: playbackSession.id,
          channelName: title,
          url: maskedStreamUrl,
        },
      );

      heartbeatIntervalRef.current = window.setInterval(() => {
        if (!playbackSessionIdRef.current) {
          return;
        }

        void heartbeatPlaybackSession(playbackSessionIdRef.current);
      }, 60000);
    }, [
      episodeId,
      episodeIndex,
      startPositionMs,
      maskedStreamUrl,
      pushPlayerEvent,
      seriesGroupTitle,
      seriesTitle,
      seriesTmdbId,
      seriesTmdbTitle,
      streamUrl,
      title,
    ]);

    useEffect(() => {
      adapterRef.current?.destroy();
      adapterRef.current = null;
      endCurrentPlaybackSession();
      setPlaybackError(null);

      if (!preparation.ok) {
        setStatus(
          preparation.error.code === 'ADAPTER_NOT_IMPLEMENTED'
            ? 'unsupported'
            : 'error',
        );
        pushPlayerEvent(
          'PREPARATION_FAILED',
          'warn',
          preparation.error.message,
          {
            code: preparation.error.code,
            url: maskedStreamUrl,
          },
        );

        return;
      }

      const videoElement = videoRef.current;

      if (!stream) {
        setStatus('error');
        setPlaybackError({
          code: 'PLAYBACK_ERROR',
          message: 'Tipo de stream não detectado.',
        });
        pushPlayerEvent(
          'STREAM_KIND_MISSING',
          'error',
          'Tipo de stream não detectado após preparação.',
        );

        return;
      }

      const useNativeAndroidAdapter = isNativeAndroidPlayerAvailable(stream.kind);

      if (!videoElement && !useNativeAndroidAdapter) {
        setStatus('idle');
        pushPlayerEvent(
          'VIDEO_ELEMENT_MISSING',
          'warn',
          'Elemento de vídeo ainda não está disponível.',
        );

        return;
      }

      const adapter =
        stream.kind === 'hls'
          ? createHlsAdapter(videoElement as HTMLVideoElement, {
              onTelemetryEvent: pushTelemetryEvent,
            })
          : useNativeAndroidAdapter
            ? createNativeAndroidPlayerAdapter(stream.kind)
            : stream.kind === 'mpegts'
              ? createMpegTsAdapter(videoElement as HTMLVideoElement, {
                  onTelemetryEvent: pushTelemetryEvent,
                })
              : createNativeVideoAdapter(videoElement as HTMLVideoElement, {
                  onTelemetryEvent: pushTelemetryEvent,
                });

      adapterRef.current = adapter;

      let isCancelled = false;

      setStatus('loading');
      pushPlayerEvent(
        'LOAD_START',
        'info',
        'Iniciando carga da fonte.',
        {
          kind: stream.kind,
          url: maskedStreamUrl,
          attempt: loadAttempt + 1,
        },
      );

      adapter
        .load({
          url: streamUrl,
        title,
        startPositionMs,
        })
        .then(() => {
          if (isCancelled) return;

          setStatus('ready');
          pushPlayerEvent(
            'LOAD_SUCCESS',
            'info',
            'Fonte carregada e pronta para reprodução.',
            {
              kind: stream.kind,
              url: maskedStreamUrl,
              attempt: loadAttempt + 1,
            },
          );
        })
        .catch((error: unknown) => {
          if (isCancelled) return;

          const errorMessage = normalizePlaybackError(error);

          setStatus('error');
          setPlaybackError({
            code: 'PLAYBACK_ERROR',
            message: `Não foi possível carregar a fonte de vídeo: ${errorMessage}`,
            details: error,
          });
          pushPlayerEvent(
            'LOAD_FAILED',
            'error',
            'Falha ao carregar a fonte.',
            {
              kind: stream.kind,
              url: maskedStreamUrl,
              message: errorMessage,
              attempt: loadAttempt + 1,
            },
          );
        });

      return () => {
        isCancelled = true;
        endCurrentPlaybackSession();
        adapter.destroy();
        pushPlayerEvent(
          'ADAPTER_DESTROYED',
          'info',
          'Adapter destruído no cleanup da rota.',
        );

        if (adapterRef.current === adapter) {
          adapterRef.current = null;
        }
      };
    }, [
      endCurrentPlaybackSession,
      loadAttempt,
      preparation,
      pushPlayerEvent,
      pushTelemetryEvent,
      stream,
      streamUrl,
      maskedStreamUrl,
      title,
    ]);

  const handleTogglePlayback = useCallback(async () => {
    const adapter = adapterRef.current;

    if (!adapter) {
      pushPlayerEvent(
        'PLAYBACK_ACTION_SKIPPED',
        'warn',
        'Adapter indisponível para ação de play/pause.',
      );
      return;
    }

    if (usesNativeAndroidPlayer) {
      try {
        setStatus('loading');
        pushPlayerEvent(
          'NATIVE_PLAYER_OPEN_REQUESTED',
          'info',
          'Solicitando abertura imediata do player nativo Android.',
        );

        await adapter.play();

        setStatus('ready');
        pushPlayerEvent(
          'NATIVE_PLAYER_OPENED',
          'info',
          'Player nativo Android aberto para reprodução.',
        );

        void ensurePlaybackSessionStarted().catch((sessionError: unknown) => {
          const sessionErrorMessage = normalizePlaybackError(sessionError);

          pushPlayerEvent(
            'PLAYBACK_SESSION_START_BEST_EFFORT_FAILED',
            'warn',
            'Sessão de reprodução falhou após abertura do player nativo, sem bloquear playback.',
            {
              message: sessionErrorMessage,
            },
          );
        });
      } catch (error) {
        const errorMessage = normalizePlaybackError(error);

        setStatus('error');
        setPlaybackError({
          code: 'PLAYBACK_ERROR',
          message: `Não foi possível abrir o player nativo: ${errorMessage}`,
          details: error,
        });
        pushPlayerEvent(
          'NATIVE_PLAYER_OPEN_FAILED',
          'error',
          'Falha ao abrir player nativo Android.',
          {
            message: errorMessage,
          },
        );
      }

      return;
    }

    if (status === 'playing') {
      await adapter.pause();
      setStatus('paused');
      pushPlayerEvent('PAUSE_REQUESTED', 'info', 'Pausa solicitada pelo usuário.');

        restorePlayerFocus();

        return;
    }

    try {
      setStatus('loading');
      await ensurePlaybackSessionStarted();
      await adapter.play();
      setStatus('playing');
      pushPlayerEvent(
        'PLAY_REQUESTED',
        'info',
        'Reprodução iniciada via controle manual.',
      );
    } catch (error) {
      const errorMessage = normalizePlaybackError(error);

      setStatus('error');
      setPlaybackError({
        code: 'PLAYBACK_ERROR',
        message: `Não foi possível iniciar a reprodução: ${errorMessage}`,
        details: error,
      });
      pushPlayerEvent(
        'PLAY_REQUEST_FAILED',
        'error',
        'Falha ao iniciar reprodução.',
        {
          message: errorMessage,
        },
      );
    }
  }, [ensurePlaybackSessionStarted, pushPlayerEvent, status, usesNativeAndroidPlayer]);

  useEffect(() => {
    if (
      !isDirectPlayback ||
      !usesNativeAndroidPlayer ||
      hasAutoOpenedDirectPlayerRef.current ||
      status !== 'ready'
    ) {
      return;
    }

    hasAutoOpenedDirectPlayerRef.current = true;
    shouldReturnFromDirectPlayerRef.current = true;
    void handleTogglePlayback();
  }, [
    handleTogglePlayback,
    isDirectPlayback,
    status,
    usesNativeAndroidPlayer,
  ]);

  const handleRetry = useCallback(() => {
    setPlaybackError(null);
    setStatus('idle');
    setLoadAttempt((currentAttempt) => {
      const nextAttempt = currentAttempt + 1;

      pushPlayerEvent('RETRY_REQUESTED', 'warn', 'Recarregando a fonte atual.', {
        nextAttempt,
      });

      return nextAttempt;
    });
  }, [pushPlayerEvent]);

  const handleToggleFullscreen = useCallback(async () => {
    const videoElement = videoRef.current;

    if (!videoElement) {
      pushPlayerEvent(
        'FULLSCREEN_UNAVAILABLE',
        'warn',
        'Elemento de vídeo indisponível para fullscreen.',
      );
      return;
    }

    try {
      if (document.fullscreenElement) {
        await exitPlayerFullscreen(videoElement);
        pushPlayerEvent('FULLSCREEN_EXIT', 'info', 'Saindo do fullscreen.');
        return;
      }

      await requestPlayerFullscreen(videoElement);
      pushPlayerEvent('FULLSCREEN_ENTER', 'info', 'Entrando no fullscreen.');
    } catch (error) {
      const errorMessage = normalizePlaybackError(error);

      pushPlayerEvent(
        'FULLSCREEN_ERROR',
        'warn',
        `Não foi possível alternar fullscreen: ${errorMessage}`,
      );
    }
  }, [pushPlayerEvent]);

  const handleNavigateBack = useCallback(() => {
    endCurrentPlaybackSession();

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/');
  }, [endCurrentPlaybackSession, navigate]);

  useEffect(() => {
    let isActive = true;
    let listener: { remove: () => Promise<void> } | null = null;

    void App.addListener('backButton', ({ canGoBack }) => {
      if (!isActive) {
        return;
      }

      endCurrentPlaybackSession();

      if (canGoBack || window.history.length > 1) {
        navigate(-1);
        return;
      }

      navigate('/');
    }).then((handle) => {
      if (!isActive) {
        void handle.remove();
        return;
      }

      listener = handle;
    });

    return () => {
      isActive = false;

      if (listener) {
        void listener.remove();
      }
    };
  }, [endCurrentPlaybackSession, navigate]);

  useEffect(() => {
    if (!isDirectPlayback || !usesNativeAndroidPlayer) {
      return;
    }

    let isActive = true;
    let fallbackReturnTimer: number | null = null;

    const clearFallbackReturnTimer = () => {
      if (fallbackReturnTimer !== null) {
        window.clearTimeout(fallbackReturnTimer);
        fallbackReturnTimer = null;
      }
    };

    const returnFromDirectNativePlayer = (event?: { positionMs?: number }) => {
      if (!isActive || !shouldReturnFromDirectPlayerRef.current) {
        return;
      }

      clearFallbackReturnTimer();

      const returnedPositionMs =
        typeof event?.positionMs === 'number' && Number.isFinite(event.positionMs)
          ? Math.max(0, event.positionMs)
          : 0;

      const parsedEpisodeIndex =
        episodeIndex !== null ? Number(episodeIndex) : Number.NaN;

      if (
        returnedPositionMs >= 5000 &&
        episodeId &&
        Number.isFinite(parsedEpisodeIndex)
      ) {
        updateEpisodePlaybackPosition(
          {
            episodeId,
            episodeIndex: parsedEpisodeIndex,
            streamUrl,
            title,
          },
          Math.floor(returnedPositionMs / 1000),
        );
      }

      shouldReturnFromDirectPlayerRef.current = false;
      endCurrentPlaybackSession();

      window.setTimeout(() => {
        if (!isActive) {
          return;
        }

        if (window.history.length > 1) {
          navigate(-1);
          return;
        }

        navigate('/');
      }, 80);
    };

    const scheduleFallbackReturn = () => {
      if (!shouldReturnFromDirectPlayerRef.current || fallbackReturnTimer !== null) {
        return;
      }

      fallbackReturnTimer = window.setTimeout(() => {
        fallbackReturnTimer = null;
        returnFromDirectNativePlayer();
      }, 700);
    };

    const handleWindowFocus = () => {
      scheduleFallbackReturn();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleFallbackReturn();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const appListenerPromise = App.addListener(
      'resume',
      returnFromDirectNativePlayer,
    );

    return () => {
      isActive = false;
      clearFallbackReturnTimer();
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      void appListenerPromise.then((listener) => {
        listener.remove();
      });
    };
  }, [
    endCurrentPlaybackSession,
    episodeId,
    episodeIndex,
    isDirectPlayback,
    navigate,
    streamUrl,
    title,
    usesNativeAndroidPlayer,
  ]);

  if (isDirectPlayback && usesNativeAndroidPlayer) {
    return (
      <main
        className="xf-app flex min-h-screen items-center justify-center bg-black px-8 text-white"
        aria-label="Carregando player nativo em tela cheia"
      >
        <div className="text-center">
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-xf-red" />
          <p className="text-2xl font-black uppercase tracking-[0.28em] text-white">
            Carregando...
          </p>
          <p className="mt-3 max-w-2xl truncate text-base font-semibold text-zinc-400">
            {title}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="xf-app min-h-screen bg-black px-8 py-8 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-6xl flex-col justify-between rounded-3xl border border-white/10 bg-zinc-950 p-8">
        <section>
          <p className="text-sm font-bold uppercase tracking-[0.4em] text-xf-red">
            Xandeflix Player
          </p>

          <h1 className="mt-4 text-4xl font-black">
            Player Universal
          </h1>

          <p className="mt-4 max-w-3xl text-lg text-xf-muted">
            MP4 usa vídeo nativo. HLS usa import dinâmico do hls.js somente
            quando uma fonte .m3u8 é aberta.
          </p>

          <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              className="aspect-video w-full bg-black"
              controls={!usesNativeAndroidPlayer}
              playsInline
              preload="metadata"
              onPlaying={() => {
                const videoElement = videoRef.current;

                if (
                  videoElement &&
                  Number.isFinite(startPositionMs) &&
                  startPositionMs >= 5000 &&
                  videoElement.currentTime < 1
                ) {
                  videoElement.currentTime = startPositionMs / 1000;
                }

                setStatus('playing');
                pushNativeVideoEvent(
                  'PLAYING',
                  'info',
                  'HTMLVideoElement entrou em estado playing.',
                );
              }}
              onTimeUpdate={() => {
                const videoElement = videoRef.current;

                if (!videoElement || videoElement.currentTime < 5) {
                  return;
                }

                updateEpisodePlaybackPosition(
                  {
                    episodeId,
                    streamUrl,
                    title,
                    seriesTitle,
                    seriesGroupTitle,
                    seriesTmdbId,
                    seriesTmdbTitle,
                    episodeIndex: episodeIndex ? Number(episodeIndex) : null,
                  },
                  videoElement.currentTime,
                );
              }}
              onPause={() => {
                const videoElement = videoRef.current;

                if (videoElement && videoElement.currentTime >= 5) {
                  updateEpisodePlaybackPosition(
                    {
                      episodeId,
                      streamUrl,
                      title,
                      seriesTitle,
                      seriesGroupTitle,
                      seriesTmdbId,
                      seriesTmdbTitle,
                      episodeIndex: episodeIndex ? Number(episodeIndex) : null,
                    },
                    videoElement.currentTime,
                  );
                }

                setStatus((currentStatus) => {
                  if (
                    currentStatus === 'loading' ||
                    currentStatus === 'error' ||
                    currentStatus === 'ended'
                  ) {
                    return currentStatus;
                  }

                  return 'paused';
                });

                pushNativeVideoEvent(
                  'PAUSE',
                  'info',
                  'HTMLVideoElement entrou em estado paused.',
                );
              }}
              onWaiting={() => {
                setStatus((currentStatus) => {
                  if (
                    currentStatus === 'error' ||
                    currentStatus === 'unsupported'
                  ) {
                    return currentStatus;
                  }

                  return 'buffering';
                });

                pushNativeVideoEvent(
                  'WAITING',
                  'warn',
                  'Aguardando buffer para continuar reprodução.',
                );
              }}
              onCanPlay={() => {
                setStatus((currentStatus) =>
                  currentStatus === 'loading' || currentStatus === 'buffering'
                    ? 'ready'
                    : currentStatus,
                );

                pushNativeVideoEvent(
                  'CAN_PLAY',
                  'info',
                  'Sinal de mídia pronta para reprodução.',
                );
              }}
              onEnded={() => {
                setStatus('ended');
                pushNativeVideoEvent('ENDED', 'info', 'Reprodução finalizada.');
              }}
              onStalled={() => {
                pushNativeVideoEvent(
                  'STALLED',
                  'warn',
                  'A reprodução ficou estagnada por falta de dados.',
                );
              }}
              onError={() => {
                const videoElement = videoRef.current;
                const mediaError = videoElement?.error;
                const nativeCode = mediaError?.code ?? null;
                const nativeMessage =
                  mediaError?.message || 'Erro nativo de mídia sem descrição.';
                const readyState = videoElement?.readyState ?? null;
                const networkState = videoElement?.networkState ?? null;
                const currentSrc = videoElement?.currentSrc
                  ? maskStreamUrl(videoElement.currentSrc)
                  : null;

                setStatus('error');
                setPlaybackError({
                  code: 'PLAYBACK_ERROR',
                  message:
                    `Erro no elemento de vídeo: ${nativeMessage} ` +
                    `(nativeCode=${nativeCode ?? 'n/a'}, readyState=${readyState ?? 'n/a'}, networkState=${networkState ?? 'n/a'})`,
                  details: {
                    nativeCode,
                    nativeMessage,
                    readyState,
                    networkState,
                    currentSrc,
                  },
                });

                pushNativeVideoEvent(
                  'ERROR',
                  'error',
                  'Erro detectado no HTMLVideoElement.',
                  {
                    nativeCode,
                    nativeMessage,
                    readyState,
                    networkState,
                    currentSrc,
                  },
                );
              }}
            />

            {usesNativeAndroidPlayer ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center">
                <div className="max-w-xl rounded-2xl border border-white/10 bg-zinc-950/90 p-6 shadow-2xl">
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-xf-red">
                    Player nativo Android
                  </p>

                  <p className="mt-3 text-xl font-black text-white">
                    A prévia inline não é usada quando o player nativo Android é necessário.
                  </p>

                  <p className="mt-3 text-sm text-xf-muted">
                    Clique em “Abrir player” para reproduzir este conteúdo em tela cheia com ExoPlayer/Media3.
                  </p>
                </div>
              </div>
            ) : null}

            {isBusy ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
                <p className="rounded-lg border border-white/20 bg-black/70 px-4 py-2 text-sm font-bold text-white">
                  {status === 'buffering'
                    ? 'Buffering... aguardando dados'
                    : 'Carregando stream...'}
                </p>
              </div>
            ) : null}

            {status === 'error' && currentError ? (
              <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl border border-yellow-500/40 bg-yellow-950/85 p-3 text-sm text-yellow-100">
                {currentError.message}
              </div>
            ) : null}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-6">
            <p className="text-sm font-bold uppercase text-xf-muted">
              Estado da preparação
            </p>

            {preparation.ok && status !== 'error' ? (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-lg font-black text-emerald-200">
                  Fonte preparada: {stream?.kind?.toUpperCase()}.
                </p>

                <p className="mt-2 text-sm text-emerald-100/80">
                  Status: {status} · tentativa {loadAttempt + 1}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                <p className="text-lg font-black text-yellow-200">
                  {currentError?.message}
                </p>

                <p className="mt-2 text-sm text-yellow-100/80">
                  Código: {currentError?.code}
                </p>

                <p className="mt-2 text-sm text-yellow-100/80">
                  Status: {status} · tentativa {loadAttempt + 1}
                </p>
              </div>
            )}

            <dl className="mt-6 grid gap-3 text-base">
              <div>
                <dt className="text-xf-muted">Título</dt>
                <dd className="font-bold text-white">{title}</dd>
              </div>

              <div>
                <dt className="text-xf-muted">Tipo detectado</dt>
                <dd className="font-bold text-white">
                  {stream?.kind ?? 'não identificado'}
                </dd>
              </div>

              <div>
                <dt className="text-xf-muted">Extensão</dt>
                <dd className="font-bold text-white">
                  {stream?.extension ?? 'não identificada'}
                </dd>
              </div>

              <div>
                <dt className="text-xf-muted">URL</dt>
                <dd className="break-all font-mono text-sm text-white/80">
                  {maskedStreamUrl || 'nenhuma URL informada'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/50 p-6">
            <p className="text-sm font-bold uppercase text-xf-muted">
              Telemetria do Player
            </p>

            <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/60 p-3 font-mono text-xs">
              {telemetryEvents.length === 0 ? (
                <p className="text-xf-muted">Sem eventos registrados ainda.</p>
              ) : (
                telemetryEvents.map((event, index) => (
                  <p
                    key={`${event.timestamp}-${event.name}-${index}`}
                    className="mt-1 break-all text-white/90 first:mt-0"
                  >
                    [{new Date(event.timestamp).toLocaleTimeString()}] [
                    {event.source.toUpperCase()}] [{event.level.toUpperCase()}]{' '}
                    {event.name}
                    {event.message ? ` — ${event.message}` : ''}
                  </p>
                ))
              )}
            </div>
          </div>
        </section>

        <nav className="mt-8 flex gap-4">
          <FocusableButton
            focusKey="player-back-button"
            className="rounded-xl bg-white px-6 py-4 text-lg font-black text-black"
            onEnterPress={handleNavigateBack}
            onClick={handleNavigateBack}
          >
            Voltar
          </FocusableButton>

          <FocusableButton
            focusKey="player-play-button"
            className="rounded-xl bg-xf-red px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isPlaybackReady || isBusy}
            onEnterPress={() => {
              void handleTogglePlayback();
            }}
            onClick={() => {
              void handleTogglePlayback();
            }}
          >
            {isBusy ? 'Carregando...' : playbackButtonLabel}
          </FocusableButton>

          <FocusableButton
            focusKey="player-pause-button"
            className="rounded-xl bg-white/10 px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isPlaybackReady}
            onEnterPress={handleRetry}
            onClick={handleRetry}
          >
            Retry
          </FocusableButton>

          <FocusableButton
            focusKey="player-fullscreen-button"
            className="rounded-xl bg-white/10 px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isPlaybackReady || usesNativeAndroidPlayer}
            onEnterPress={() => {
              void handleToggleFullscreen();
            }}
            onClick={() => {
              void handleToggleFullscreen();
            }}
          >
            {usesNativeAndroidPlayer
              ? 'Player nativo'
              : isFullscreen
                ? 'Sair da tela cheia'
                : 'Tela cheia'}
          </FocusableButton>
        </nav>
      </div>
    </main>
  );
}
