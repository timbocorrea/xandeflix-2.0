import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { FocusableButton } from '@/components/tv/FocusableButton';
import { createNativeVideoAdapter } from '../lib/nativeVideoAdapter';
import { prepareUniversalPlayerSource } from '../lib/playerFactory';
import type {
  PlayerError,
  PlayerStatus,
  UniversalPlayerAdapter,
} from '../types/player';

export default function UniversalPlayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const adapterRef = useRef<UniversalPlayerAdapter | null>(null);

  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [playbackError, setPlaybackError] = useState<PlayerError | null>(null);

  const streamUrl = searchParams.get('src') ?? '';
  const title = searchParams.get('title') ?? 'Conteúdo Xandeflix';

  const preparation = useMemo(() => {
    return prepareUniversalPlayerSource({
      url: streamUrl,
      title,
    });
  }, [streamUrl, title]);

  const stream = preparation.ok ? preparation.stream : preparation.stream;
  const preparationError = preparation.ok ? null : preparation.error;
  const currentError = playbackError ?? preparationError;

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
      return;
    }

    const videoElement = videoRef.current;

    if (!videoElement) {
      setStatus('idle');
      return;
    }

    const adapter = createNativeVideoAdapter(videoElement);
    adapterRef.current = adapter;

    let isCancelled = false;

    setStatus('loading');

    adapter
      .load({
        url: streamUrl,
        title,
      })
      .then(() => {
        if (isCancelled) return;
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (isCancelled) return;

        setStatus('error');
        setPlaybackError({
          code: 'PLAYBACK_ERROR',
          message: 'Não foi possível carregar o vídeo nativo.',
          details: error,
        });
      });

    return () => {
      isCancelled = true;
      adapter.destroy();

      if (adapterRef.current === adapter) {
        adapterRef.current = null;
      }
    };
  }, [preparation, streamUrl, title]);

  const handlePlay = useCallback(async () => {
    if (!adapterRef.current) return;

    try {
      setStatus('loading');
      await adapterRef.current.play();
      setStatus('playing');
    } catch (error) {
      setStatus('error');
      setPlaybackError({
        code: 'PLAYBACK_ERROR',
        message: 'Não foi possível iniciar a reprodução.',
        details: error,
      });
    }
  }, []);

  const handlePause = useCallback(async () => {
    if (!adapterRef.current) return;

    await adapterRef.current.pause();
    setStatus('paused');
  }, []);

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
            Adapter MP4 nativo ativo. HLS, DASH e MPEGTS continuam bloqueados
            até receberem adapters com import dinâmico.
          </p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              className="aspect-video w-full bg-black"
              controls
              playsInline
              preload="metadata"
              onPlaying={() => setStatus('playing')}
              onPause={() => setStatus('paused')}
              onWaiting={() => setStatus('buffering')}
              onCanPlay={() => {
                setStatus((currentStatus) =>
                  currentStatus === 'loading' ? 'ready' : currentStatus,
                );
              }}
            />
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-6">
            <p className="text-sm font-bold uppercase text-xf-muted">
              Estado da preparação
            </p>

            {preparation.ok && status !== 'error' ? (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-lg font-black text-emerald-200">
                  Fonte MP4 preparada com vídeo nativo.
                </p>

                <p className="mt-2 text-sm text-emerald-100/80">
                  Status: {status}
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
                  Status: {status}
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
                  {streamUrl || 'nenhuma URL informada'}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <nav className="mt-8 flex gap-4">
          <FocusableButton
            focusKey="player-back-button"
            className="rounded-xl bg-white px-6 py-4 text-lg font-black text-black"
            onEnterPress={() => navigate('/')}
          >
            Voltar ao catálogo
          </FocusableButton>

          <FocusableButton
            focusKey="player-play-button"
            className="rounded-xl bg-xf-red px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!preparation.ok || status === 'loading'}
            onEnterPress={handlePlay}
          >
            Reproduzir
          </FocusableButton>

          <FocusableButton
            focusKey="player-pause-button"
            className="rounded-xl bg-white/10 px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!preparation.ok}
            onEnterPress={handlePause}
          >
            Pausar
          </FocusableButton>
        </nav>
      </div>
    </main>
  );
}
