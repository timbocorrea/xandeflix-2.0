import type {
  UniversalPlayerAdapter,
  UniversalPlayerSource,
} from '../types/player';

type MpegTsPlayer = {
  attachMediaElement: (element: HTMLMediaElement) => void;
  load: () => void;
  unload?: () => void;
  pause?: () => void;
  destroy: () => void;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type MpegTsApi = {
  isSupported: () => boolean;
  createPlayer: (
    mediaDataSource: Record<string, unknown>,
    config?: Record<string, unknown>,
  ) => MpegTsPlayer;
  Events?: {
    ERROR?: string;
  };
};

function waitForMetadata(videoElement: HTMLVideoElement, timeoutMs: number) {
  if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('error', handleError);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(
        videoElement.error ?? new Error('Erro ao carregar stream MPEG-TS.'),
      );
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Tempo limite ao preparar stream MPEG-TS.'));
    }, timeoutMs);

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata, {
      once: true,
    });
    videoElement.addEventListener('error', handleError, {
      once: true,
    });
  });
}

function resolveMpegTsApi(moduleValue: unknown): MpegTsApi | null {
  const candidate =
    moduleValue &&
    typeof moduleValue === 'object' &&
    'default' in moduleValue &&
    moduleValue.default
      ? moduleValue.default
      : moduleValue;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const api = candidate as Partial<MpegTsApi>;

  if (
    typeof api.isSupported !== 'function' ||
    typeof api.createPlayer !== 'function'
  ) {
    return null;
  }

  return api as MpegTsApi;
}

export function createMpegTsAdapter(
  videoElement: HTMLVideoElement,
): UniversalPlayerAdapter {
  let playerInstance: MpegTsPlayer | null = null;

  return {
    kind: 'mpegts',

    async load(source: UniversalPlayerSource) {
      if (!source.url.trim()) {
        throw new Error('URL MPEG-TS não informada.');
      }

      const mpegTsModule = await import('mpegts.js');
      const mpegTsApi = resolveMpegTsApi(mpegTsModule);

      if (!mpegTsApi) {
        throw new Error('Biblioteca mpegts.js inválida neste ambiente.');
      }

      if (!mpegTsApi.isSupported()) {
        throw new Error('MPEG-TS não é suportado neste ambiente.');
      }

      playerInstance?.destroy();
      playerInstance = null;

      videoElement.preload = 'metadata';

      const player = mpegTsApi.createPlayer(
        {
          type: 'mse',
          isLive: true,
          hasAudio: true,
          hasVideo: true,
          url: source.url,
        },
        {
          enableWorker: true,
          lazyLoad: false,
          autoCleanupSourceBuffer: true,
          stashInitialSize: 128,
          fixAudioTimestampGap: true,
        },
      );

      playerInstance = player;
      player.attachMediaElement(videoElement);

      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const settleResolve = () => {
          if (settled) {
            return;
          }

          settled = true;
          resolve();
        };

        const settleReject = (error: Error) => {
          if (settled) {
            return;
          }

          settled = true;
          reject(error);
        };

        const errorEventName = mpegTsApi.Events?.ERROR;

        if (errorEventName && typeof player.on === 'function') {
          player.on(errorEventName, (...args: unknown[]) => {
            let reason = 'erro desconhecido';

            if (args.length > 0) {
              try {
                reason =
                  typeof args[0] === 'string'
                    ? args[0]
                    : JSON.stringify(args[0]);
              } catch {
                reason = String(args[0]);
              }
            }

            settleReject(new Error(`Falha no mpegts.js: ${reason}`));
          });
        }

        try {
          player.load();
        } catch (error) {
          settleReject(
            error instanceof Error
              ? error
              : new Error('Falha ao iniciar player MPEG-TS.'),
          );
          return;
        }

        waitForMetadata(videoElement, 25_000)
          .then(settleResolve)
          .catch((error) => {
            settleReject(
              error instanceof Error
                ? error
                : new Error('Falha ao carregar metadados MPEG-TS.'),
            );
          });
      });
    },

    async play() {
      await videoElement.play();
    },

    async pause() {
      videoElement.pause();
      playerInstance?.pause?.();
    },

    destroy() {
      playerInstance?.pause?.();
      playerInstance?.unload?.();
      playerInstance?.destroy();
      playerInstance = null;

      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
    },
  };
}
