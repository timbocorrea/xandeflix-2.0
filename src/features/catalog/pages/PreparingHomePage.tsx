import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { usePlaylistRuntime } from '@/features/playlists/providers/PlaylistRuntimeProvider';
import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import { prepareHomePlaylist } from '../services/prepareHomePlaylist.service';

const MIN_PREPARING_HOME_DELAY_MS = 1200;

type PreparingStep = 'loading' | 'ready' | 'error';

export function PreparingHomePage() {
  const navigate = useNavigate();
  const {
    channels,
    status,
    progress,
    error,
    loadFromSource,
  } = usePlaylistRuntime();

  const [step, setStep] = useState<PreparingStep>('loading');
  const [localError, setLocalError] = useState<string | null>(null);
  const hasStartedPreparingRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    if (hasStartedPreparingRef.current) {
      return () => {
        isActive = false;
      };
    }

    hasStartedPreparingRef.current = true;
    setStep('loading');
    setLocalError(null);

    const storedActivation = getStoredLicenseActivation();

    if (!storedActivation?.licenseCode) {
      setLocalError('Este aparelho precisa ser ativado antes de carregar a Home.');
      setStep('error');

      window.setTimeout(() => {
        navigate('/settings', { replace: true });
      }, 1800);

      return () => {
        isActive = false;
      };
    }

    void prepareHomePlaylist({
      currentChannelsCount: channels.length,
      currentStatus: status,
      loadFromSource,
    }).catch((prepareError) => {
      if (!isActive) {
        return;
      }

      setLocalError(
        prepareError instanceof Error
          ? prepareError.message
          : 'Não foi possível carregar a lista inicial.',
      );
      setStep('error');
    });

    return () => {
      isActive = false;
    };
  }, [channels.length, loadFromSource, status]);

  useEffect(() => {
    if (status === 'ready' && channels.length > 0) {
      setStep('ready');
    }
  }, [channels.length, status]);

  useEffect(() => {
    if (step !== 'ready') {
      return;
    }

    const timer = window.setTimeout(() => {
      navigate('/', { replace: true });
    }, MIN_PREPARING_HOME_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [navigate, step]);

  const progressLabel = useMemo(() => {
    if (progress?.phase === 'downloading') {
      return 'Baixando lista autorizada...';
    }

    if (progress?.phase === 'parsing') {
      return `Organizando canais e catálogo (${progress.channelsParsed} itens processados)...`;
    }

    if (progress?.phase === 'finalizing') {
      return 'Finalizando preparação da Home...';
    }

    if (step === 'error') {
      return localError ?? error ?? 'Falha ao preparar a Home.';
    }

    return 'Carregando lista inicial...';
  }, [error, localError, progress, step]);

  return (
    <main className="xf-app flex min-h-screen items-center justify-center bg-black px-8 text-white">
      <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-xf-red">
          Xandeflix
        </p>

        <h1 className="mt-4 text-3xl font-black md:text-5xl">
          Preparando sua Home
        </h1>

        <p className="mt-4 text-base font-semibold leading-relaxed text-xf-muted">
          Estamos carregando a lista completa antes de abrir a tela principal
          para evitar travamentos durante a navegação.
        </p>

        <div className="mx-auto mt-8 h-2 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-xf-red" />
        </div>

        <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-white/60">
          {progressLabel}
        </p>

        {step === 'error' && (
          <p className="mt-4 rounded-xl bg-red-950/70 px-4 py-3 text-sm font-semibold text-red-100">
            Verifique se este aparelho está autorizado e tente entrar novamente.
          </p>
        )}
      </section>
    </main>
  );
}
