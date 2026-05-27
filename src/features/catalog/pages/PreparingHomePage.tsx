import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { usePlaylistRuntime } from '@/features/playlists/providers/PlaylistRuntimeProvider';
import {
  clearStoredLicenseActivation,
  getStoredLicenseActivation,
} from '@/features/licensing/lib/licenseActivationStorage';
import {
  runAppBootstrap,
  type AppBootstrapProgress,
} from '@/features/bootstrap/services/appBootstrap.service';
import { startCatalogVodWarmup } from '@/features/catalog/services/catalogWarmup.service';

const MIN_PREPARING_HOME_DELAY_MS = 900;

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
  const [bootstrapProgress, setBootstrapProgress] =
    useState<AppBootstrapProgress | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [bootstrapWarning, setBootstrapWarning] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
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
    setBootstrapWarning(null);
    setBootstrapProgress(null);

    const storedActivation = getStoredLicenseActivation();

    if (!storedActivation?.licenseCode || !storedActivation.deviceIdentifier) {
      setLocalError('Este aparelho precisa ser ativado antes de carregar a Home.');
      setStep('error');

      window.setTimeout(() => {
        navigate('/settings', { replace: true });
      }, 1800);

      return () => {
        isActive = false;
      };
    }

    void runAppBootstrap({
      licenseCode: storedActivation.licenseCode,
      deviceIdentifier: storedActivation.deviceIdentifier,
      runtime: {
        currentChannelsCount: channels.length,
        currentStatus: status,
        loadFromSource,
      },
      onProgress: (nextProgress) => {
        if (!isActive) {
          return;
        }

        setBootstrapProgress(nextProgress);

        if (nextProgress.warning) {
          setBootstrapWarning(nextProgress.warning);
        }
      },
    })
      .then((result) => {
        if (!isActive) {
          return;
        }

        setBootstrapWarning(result.warnings[0] ?? null);

        // Chamar warmup do catálogo VOD de forma não bloqueante em background
        void startCatalogVodWarmup({
          licenseCode: result.licenseCode,
          deviceIdentifier: result.deviceIdentifier,
        });

        setStep('ready');
      })
      .catch((prepareError) => {
        if (!isActive) {
          return;
        }

        setLocalError(
          prepareError instanceof Error
            ? prepareError.message
            : 'Não foi possível preparar os dados iniciais do app.',
        );
        setStep('error');
      });

    return () => {
      isActive = false;
    };
  }, [channels.length, loadFromSource, navigate, retryKey, status]);

  useEffect(() => {
    if (step !== 'ready') {
      return;
    }

    const timer = window.setTimeout(() => {
      navigate('/', { replace: true });
    }, MIN_PREPARING_HOME_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [navigate, step]);

  function handleRetry() {
    hasStartedPreparingRef.current = false;
    setLocalError(null);
    setBootstrapWarning(null);
    setBootstrapProgress(null);
    setStep('loading');
    setRetryKey((current) => current + 1);
  }

  function handleChangeLicense() {
    clearStoredLicenseActivation();
    navigate('/login', { replace: true });
  }

  const progressLabel = useMemo(() => {
    if (step === 'error') {
      return localError ?? error ?? 'Falha ao preparar a Home.';
    }

    if (bootstrapProgress?.stepId === 'playlist') {
      if (progress?.phase === 'downloading') {
        return 'Baixando lista autorizada...';
      }

      if (progress?.phase === 'parsing') {
        return `Organizando canais e catálogo (${progress.channelsParsed} itens processados)...`;
      }

      if (progress?.phase === 'finalizing') {
        return 'Finalizando lista autorizada...';
      }
    }

    if (step === 'ready') {
      return 'Tudo pronto. Abrindo Xandeflix...';
    }

    return bootstrapProgress?.label ?? 'Iniciando preparação...';
  }, [bootstrapProgress, error, localError, progress, step]);

  const progressPercent = useMemo(() => {
    if (step === 'ready') {
      return 100;
    }

    if (!bootstrapProgress) {
      return 12;
    }

    return Math.max(
      12,
      Math.min(
        100,
        Math.round(
          (bootstrapProgress.completedSteps / bootstrapProgress.totalSteps) * 100,
        ),
      ),
    );
  }, [bootstrapProgress, step]);

  return (
    <main className="xf-app flex min-h-screen items-center justify-center bg-black px-8 text-white">
      <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-xf-red">
          Xandeflix
        </p>

        <h1 className="mt-4 text-3xl font-black md:text-5xl">
          Preparando seu app
        </h1>

        <p className="mt-4 text-base font-semibold leading-relaxed text-xf-muted">
          Estamos carregando somente os dados críticos para abrir Home, Canais
          ao Vivo, Filmes e Séries sem tela vazia inicial.
        </p>

        <div className="mx-auto mt-8 h-2 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-xf-red transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-white/60">
          {progressLabel}
        </p>

        {bootstrapWarning && step !== 'error' && (
          <p className="mt-4 rounded-xl bg-yellow-950/40 px-4 py-3 text-xs font-semibold text-yellow-100">
            {bootstrapWarning}
          </p>
        )}

        {step === 'error' && (
          <div className="mt-6 flex flex-col gap-4">
            <p className="rounded-xl bg-red-950/70 px-4 py-3 text-sm font-semibold text-red-100">
              Verifique se este aparelho está autorizado, se a licença possui
              uma lista IPTV ativa e tente novamente.
            </p>

            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-xl bg-xf-red px-5 py-3 text-sm font-black text-white transition hover:bg-red-700"
              >
                Tentar novamente
              </button>

              <button
                type="button"
                onClick={handleChangeLicense}
                className="rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20"
              >
                Trocar licença
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
