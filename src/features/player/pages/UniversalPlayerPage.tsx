import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { FocusableButton } from '@/components/tv/FocusableButton';
import { createHlsAdapter } from '../lib/hlsAdapter';
import { createMpegTsAdapter } from '../lib/mpegTsAdapter';
import { createNativeVideoAdapter } from '../lib/nativeVideoAdapter';
import { maskStreamUrl } from '../lib/maskStreamUrl';
import { logPlayerDebugEvent } from '../lib/playerDebug';
import { prepareUniversalPlayerSource } from '../lib/playerFactory';
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
    return error.message;
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

  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [playbackError, setPlaybackError] = useState<PlayerError | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [telemetryEvents, setTelemetryEvents] = useState<PlayerTelemetryEvent[]>(
    [],
  );

  const streamUrl = searchParams.get('src') ?? '';
  const title = searchParams.get('title') ?? 'Conteúdo Xandeflix';
  const maskedStreamUrl = useMemo(() => maskStreamUrl(streamUrl), [streamUrl]);

  const preparation = useMemo(() => {
    return prepareUniversalPlayerSource({
      url: streamUrl,
      title,
    });
  }, [streamUrl, title]);

  const stream = preparation.ok ? preparation.stream : preparation.stream;
  const preparationError = preparation.ok ? null : preparation.error;
  const currentError = playbackError ?? preparationError;
  const isPlaybackReady = preparation.ok && status !== 'unsupported';
  const isPlaying = status === 'playing';
  const isBusy = status === 'loading' || status === 'buffering';
  const playbackButtonLabel = isPlaying ? 'Pausar' : 'Reproduzir';

  const pushTelemetryEvent = useCallback((event: PlayerTelemetryEvent) => {
    setTelemetryEvents((currentEvents) => {
      return [event, ...currentEvents].slice(0, MAX_PLAYER_TELEMETRY_EVENTS);
    });

    logPlayerDebugEvent(event);
  }, []);

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

  useEffect(() => {
    adapterRef.current?.destroy();
    adapterRef.current = null;
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

    if (!videoElement) {
      setStatus('idle');
      pushPlayerEvent(
        'VIDEO_ELEMENT_MISSING',
        'warn',
        'Elemento de vídeo ainda não está disponível.',
      );

      return;
    }

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

    const adapter =
      stream.kind === 'hls'
        ? createHlsAdapter(videoElement, {
            onTelemetryEvent: pushTelemetryEvent,
          })
        : stream.kind === 'mpegts'
          ? createMpegTsAdapter(videoElement)
          : createNativeVideoAdapter(videoElement);

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

    if (status === 'playing') {
      await adapter.pause();
      setStatus('paused');
      pushPlayerEvent('PAUSE_REQUESTED', 'info', 'Pausa solicitada pelo usuário.');
      return;
    }

    try {
      setStatus('loading');
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
  }, [pushPlayerEvent, status]);

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
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/');
  }, [navigate]);

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
              controls
              playsInline
              preload="metadata"
              onPlaying={() => {
                setStatus('playing');
                pushNativeVideoEvent(
                  'PLAYING',
                  'info',
                  'HTMLVideoElement entrou em estado playing.',
                );
              }}
              onPause={() => {
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
                setStatus('buffering');
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

                setStatus('error');
                setPlaybackError({
                  code: 'PLAYBACK_ERROR',
                  message: `Erro no elemento de vídeo: ${nativeMessage}`,
                  details: {
                    nativeCode,
                  },
                });

                pushNativeVideoEvent(
                  'ERROR',
                  'error',
                  'Erro detectado no HTMLVideoElement.',
                  {
                    nativeCode,
                    nativeMessage,
                  },
                );
              }}
            />

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
            disabled={!isPlaybackReady}
            onEnterPress={() => {
              void handleToggleFullscreen();
            }}
            onClick={() => {
              void handleToggleFullscreen();
            }}
          >
            {isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          </FocusableButton>
        </nav>
      </div>
    </main>
  );
}
