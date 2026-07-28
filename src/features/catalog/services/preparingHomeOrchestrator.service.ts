import {
  runAppBootstrap,
  type AppBootstrapProgress,
  type AppBootstrapResult,
  type RunAppBootstrapInput,
} from '@/features/bootstrap/services/appBootstrap.service';
import { env } from '@/config/env';

export type PreparingStep = 'loading' | 'ready' | 'error';

export type StoredLicenseActivationSummary = {
  licenseCode: string;
  deviceIdentifier: string;
} | null;

export type PreparingHomeOrchestratorState = {
  step: PreparingStep;
  bootstrapProgress: AppBootstrapProgress | null;
  localError: string | null;
  bootstrapWarning: string | null;
};

export type PreparingHomeOrchestratorInput = {
  getStoredActivation: () => StoredLicenseActivationSummary;
  clearActivation?: () => void;
  runBootstrap?: (input: RunAppBootstrapInput) => Promise<AppBootstrapResult>;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  runtime: RunAppBootstrapInput['runtime'];
  onStateChange: (state: PreparingHomeOrchestratorState) => void;
  runSmokeTestInBackground?: () => void;
};

export function runLocalCatalogSmokeTestInBackgroundDefault() {
  if (!env.localCatalogSmokeTestEnabled) {
    return;
  }

  console.warn('XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_START');

  void import('@/features/localCatalog/services/localCatalogSmokeTest.service')
    .then(({ runLocalCatalogSmokeTest }) => runLocalCatalogSmokeTest())
    .then((result) => {
      if (result.ok) {
        console.warn('XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT', JSON.stringify(result));
      } else {
        console.error('XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT', JSON.stringify(result));
      }
    })
    .catch((error: unknown) => {
      const errorResult = {
        ok: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'LOCAL_CATALOG_SMOKE_TEST_IMPORT_FAILED',
      };
      console.error('XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT', JSON.stringify(errorResult));
    });
}

export function createPreparingHomeOrchestrator({
  getStoredActivation,
  clearActivation,
  runBootstrap = runAppBootstrap,
  navigate,
  runtime,
  onStateChange,
  runSmokeTestInBackground = runLocalCatalogSmokeTestInBackgroundDefault,
}: PreparingHomeOrchestratorInput) {
  let isMounted = true;
  let attemptId = 0;
  let currentState: PreparingHomeOrchestratorState = {
    step: 'loading',
    bootstrapProgress: null,
    localError: null,
    bootstrapWarning: null,
  };

  function updateState(partial: Partial<PreparingHomeOrchestratorState>) {
    if (!isMounted) {
      return;
    }
    currentState = { ...currentState, ...partial };
    onStateChange(currentState);
  }

  function startAttempt() {
    const currentAttemptId = ++attemptId;

    updateState({
      step: 'loading',
      localError: null,
      bootstrapWarning: null,
      bootstrapProgress: null,
    });

    const storedActivation = getStoredActivation();

    if (!storedActivation?.licenseCode || !storedActivation.deviceIdentifier) {
      if (!isMounted || attemptId !== currentAttemptId) {
        return;
      }
      updateState({
        localError: 'Este aparelho precisa ser ativado antes de carregar a Home.',
        step: 'error',
      });

      globalThis.setTimeout(() => {
        if (isMounted && attemptId === currentAttemptId) {
          navigate('/settings', { replace: true });
        }
      }, 1800);

      return;
    }

    void runBootstrap({
      licenseCode: storedActivation.licenseCode,
      deviceIdentifier: storedActivation.deviceIdentifier,
      criticalOnly: true,
      runtime,
      onProgress: (nextProgress) => {
        if (!isMounted || attemptId !== currentAttemptId) {
          return;
        }

        updateState({
          bootstrapProgress: nextProgress,
          bootstrapWarning: nextProgress.warning ?? currentState.bootstrapWarning,
        });
      },
    })
      .then((result) => {
        if (!isMounted || attemptId !== currentAttemptId) {
          return;
        }

        updateState({
          bootstrapWarning: result.warnings[0] ?? null,
          step: 'ready',
        });

        runSmokeTestInBackground();
      })
      .catch((prepareError) => {
        if (!isMounted || attemptId !== currentAttemptId) {
          return;
        }

        updateState({
          localError:
            prepareError instanceof Error
              ? prepareError.message
              : 'Não foi possível preparar os dados iniciais do app.',
          step: 'error',
        });
      });
  }

  function unmount() {
    isMounted = false;
  }

  return {
    startAttempt,
    unmount,
    getState: () => currentState,
    getAttemptId: () => attemptId,
    changeLicense: () => {
      clearActivation?.();
      navigate('/login', { replace: true });
    },
  };
}
