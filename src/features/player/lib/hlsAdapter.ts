import type {
  PlayerTelemetryEvent,
  UniversalPlayerAdapter,
  UniversalPlayerSource,
} from '../types/player';

type HlsErrorData = {
  fatal?: boolean;
  type?: string;
  details?: string;
  reason?: string;
  response?: {
    code?: number;
    text?: string;
  };
  networkDetails?: unknown;
  error?: unknown;
};

type HlsInstance = {
  loadSource: (source: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  on: (
    event: string,
    callback: (event: string, data: unknown) => void,
  ) => void;
};

type HlsConstructor = {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported: () => boolean;
  Events: {
    MANIFEST_PARSED: string;
    MEDIA_ATTACHED: string;
    FRAG_LOADED: string;
    ERROR: string;
  };
};

type HlsAdapterHooks = {
  onTelemetryEvent?: (event: PlayerTelemetryEvent) => void;
};

function createEventTimestamp() {
  return Date.now();
}

function emitHlsTelemetry(
  hooks: HlsAdapterHooks,
  name: string,
  level: PlayerTelemetryEvent['level'] = 'info',
  message?: string,
  data?: Record<string, unknown>,
) {
  hooks.onTelemetryEvent?.({
    source: 'hls',
    name,
    level,
    message,
    timestamp: createEventTimestamp(),
    data,
  });
}

function classifyErrorType(errorData: HlsErrorData) {
  const normalizedType = errorData.type?.toLowerCase() ?? 'unknown';
  const normalizedDetails = errorData.details?.toLowerCase() ?? '';

  if (normalizedType.includes('network')) {
    return 'NETWORK_ERROR';
  }

  if (normalizedType.includes('media')) {
    return 'MEDIA_ERROR';
  }

  if (normalizedDetails.includes('bufferstalled')) {
    return 'BUFFER_STALLED';
  }

  return null;
}

function buildErrorDataPayload(errorData: HlsErrorData) {
  return {
    fatal: Boolean(errorData.fatal),
    type: errorData.type ?? 'unknown',
    details: errorData.details ?? 'unknown',
    reason: errorData.reason ?? null,
    responseCode: errorData.response?.code ?? null,
    responseText: errorData.response?.text ?? null,
  };
}

function canPlayNativeHls(videoElement: HTMLVideoElement) {
  return Boolean(
    videoElement.canPlayType('application/vnd.apple.mpegurl') ||
      videoElement.canPlayType('application/x-mpegURL'),
  );
}

function waitForNativeHlsMetadata(videoElement: HTMLVideoElement) {
  if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('error', handleError);
    };

    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(
        videoElement.error ??
          new Error('Erro ao carregar stream HLS nativo.'),
      );
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata, {
      once: true,
    });

    videoElement.addEventListener('error', handleError, {
      once: true,
    });
  });
}

export function createHlsAdapter(
  videoElement: HTMLVideoElement,
  hooks: HlsAdapterHooks = {},
): UniversalPlayerAdapter {
  let hlsInstance: HlsInstance | null = null;

  return {
    kind: 'hls',

    async load(source: UniversalPlayerSource) {
      if (!source.url.trim()) {
        throw new Error('URL HLS não informada.');
      }

      videoElement.preload = 'metadata';

      if (canPlayNativeHls(videoElement)) {
        emitHlsTelemetry(
          hooks,
          'NATIVE_HLS_FALLBACK',
          'info',
          'Ambiente com suporte nativo a HLS.',
        );

        videoElement.src = source.url;
        videoElement.load();

        await waitForNativeHlsMetadata(videoElement);

        emitHlsTelemetry(
          hooks,
          'NATIVE_HLS_METADATA_READY',
          'info',
          'Metadados nativos HLS carregados.',
        );
        return;
      }

      emitHlsTelemetry(
        hooks,
        'HLS_DYNAMIC_IMPORT_START',
        'info',
        'Carregando hls.js via import dinâmico.',
      );

      const hlsModule = await import('hls.js');
      const Hls = hlsModule.default as unknown as HlsConstructor;

      if (!Hls.isSupported()) {
        emitHlsTelemetry(
          hooks,
          'HLS_NOT_SUPPORTED',
          'error',
          'HLS não é suportado neste ambiente.',
        );
        throw new Error('HLS não é suportado neste ambiente.');
      }

      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const settleResolve = () => {
          if (settled) return;

          settled = true;
          resolve();
        };

        const settleReject = (error: Error) => {
          if (settled) return;

          settled = true;
          reject(error);
        };

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });

        hlsInstance = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          emitHlsTelemetry(
            hooks,
            'MANIFEST_PARSED',
            'info',
            'Manifesto HLS interpretado.',
          );

          settleResolve();
        });

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          emitHlsTelemetry(
            hooks,
            'MEDIA_ATTACHED',
            'info',
            'Mídia anexada ao elemento de vídeo.',
          );
        });

        hls.on(Hls.Events.FRAG_LOADED, () => {
          emitHlsTelemetry(
            hooks,
            'FRAG_LOADED',
            'info',
            'Segmento HLS carregado.',
          );
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          const errorData = data as HlsErrorData;
          const payload = buildErrorDataPayload(errorData);
          const derivedErrorType = classifyErrorType(errorData);

          emitHlsTelemetry(
            hooks,
            'ERROR',
            errorData.fatal ? 'error' : 'warn',
            errorData.details
              ? `Erro HLS (${errorData.type ?? 'unknown'}): ${errorData.details}`
              : 'Erro HLS sem detalhes.',
            payload,
          );

          if (derivedErrorType) {
            emitHlsTelemetry(
              hooks,
              derivedErrorType,
              errorData.fatal ? 'error' : 'warn',
              `Classificação técnica: ${derivedErrorType}`,
              payload,
            );
          }

          if (!errorData.fatal) {
            return;
          }

          settleReject(
            new Error(
              `Erro fatal HLS: ${errorData.type ?? 'unknown'} / ${
                errorData.details ?? 'unknown'
              }`,
            ),
          );
        });

        hls.attachMedia(videoElement);
        hls.loadSource(source.url);
      });
    },

    async play() {
      await videoElement.play();
    },

    async pause() {
      videoElement.pause();
    },

    destroy() {
      hlsInstance?.destroy();
      hlsInstance = null;

      emitHlsTelemetry(
        hooks,
        'HLS_DESTROYED',
        'info',
        'Instância hls.js destruída.',
      );

      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
    },
  };
}
