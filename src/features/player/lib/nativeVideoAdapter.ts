import type {
  PlayerTelemetryEvent,
  UniversalPlayerAdapter,
  UniversalPlayerSource,
} from '../types/player';

const NATIVE_VIDEO_LOAD_TIMEOUT_MS = 15_000;

type NativeVideoAdapterOptions = {
  onTelemetryEvent?: (event: PlayerTelemetryEvent) => void;
};

function createNativeVideoTelemetryEvent(
  name: string,
  level: PlayerTelemetryEvent['level'],
  message?: string,
  data?: Record<string, unknown>,
): PlayerTelemetryEvent {
  return {
    source: 'native',
    name,
    level,
    message,
    data,
    timestamp: Date.now(),
  };
}

function normalizeUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getVideoDiagnostics(videoElement: HTMLVideoElement) {
  const mediaError = videoElement.error;

  return {
    readyState: videoElement.readyState,
    networkState: videoElement.networkState,
    currentSrc: videoElement.currentSrc || null,
    paused: videoElement.paused,
    ended: videoElement.ended,
    duration: Number.isFinite(videoElement.duration) ? videoElement.duration : null,
    videoWidth: videoElement.videoWidth,
    videoHeight: videoElement.videoHeight,
    errorCode: mediaError?.code ?? null,
    errorMessage: mediaError?.message || null,
  };
}

function buildVideoElementError(
  prefix: string,
  videoElement: HTMLVideoElement,
  cause?: unknown,
) {
  const diagnostics = getVideoDiagnostics(videoElement);
  const causeMessage = cause ? normalizeUnknownError(cause) : null;
  const nativeMessage =
    diagnostics.errorMessage || causeMessage || 'erro nativo sem descrição';

  const error = new Error(
    `${prefix}: ${nativeMessage} ` +
      `(readyState=${diagnostics.readyState}, networkState=${diagnostics.networkState}, errorCode=${diagnostics.errorCode ?? 'n/a'})`,
  );

  Object.assign(error, {
    diagnostics,
    cause,
  });

  return error;
}

function waitForNativeVideoReadiness(
  videoElement: HTMLVideoElement,
  pushTelemetry: (
    name: string,
    level: PlayerTelemetryEvent['level'],
    message?: string,
    data?: Record<string, unknown>,
  ) => void,
) {
  if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
    pushTelemetry(
      'LOAD_METADATA_ALREADY_AVAILABLE',
      'info',
      'Metadados MP4 já estavam disponíveis.',
      getVideoDiagnostics(videoElement),
    );

    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
      videoElement.removeEventListener('canplay', handleCanPlay);
      videoElement.removeEventListener('error', handleError);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    const resolveWithEvent = (eventName: string, message: string) => {
      cleanup();

      pushTelemetry(eventName, 'info', message, getVideoDiagnostics(videoElement));
      resolve();
    };

    const handleLoadedMetadata = () => {
      resolveWithEvent(
        'LOADED_METADATA',
        'HTMLVideoElement carregou metadados MP4.',
      );
    };

    const handleLoadedData = () => {
      resolveWithEvent(
        'LOADED_DATA',
        'HTMLVideoElement carregou dados iniciais MP4.',
      );
    };

    const handleCanPlay = () => {
      resolveWithEvent(
        'CAN_PLAY_DURING_LOAD',
        'HTMLVideoElement sinalizou canplay durante load MP4.',
      );
    };

    const handleError = () => {
      cleanup();

      const error = buildVideoElementError(
        'Erro ao carregar vídeo MP4 no HTMLVideoElement',
        videoElement,
      );

      pushTelemetry(
        'LOAD_ELEMENT_ERROR',
        'error',
        error.message,
        getVideoDiagnostics(videoElement),
      );

      reject(error);
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata, {
      once: true,
    });
    videoElement.addEventListener('loadeddata', handleLoadedData, { once: true });
    videoElement.addEventListener('canplay', handleCanPlay, { once: true });
    videoElement.addEventListener('error', handleError, { once: true });

    timeoutId = setTimeout(() => {
      cleanup();

      const error = buildVideoElementError(
        'Tempo limite ao preparar vídeo MP4 no HTMLVideoElement',
        videoElement,
      );

      pushTelemetry(
        'LOAD_TIMEOUT',
        'error',
        error.message,
        getVideoDiagnostics(videoElement),
      );

      reject(error);
    }, NATIVE_VIDEO_LOAD_TIMEOUT_MS);
  });
}

export function createNativeVideoAdapter(
  videoElement: HTMLVideoElement,
  options: NativeVideoAdapterOptions = {},
): UniversalPlayerAdapter {
  const pushTelemetry = (
    name: string,
    level: PlayerTelemetryEvent['level'],
    message?: string,
    data?: Record<string, unknown>,
  ) => {
    options.onTelemetryEvent?.(
      createNativeVideoTelemetryEvent(name, level, message, data),
    );
  };

  return {
    kind: 'mp4',

    async load(source: UniversalPlayerSource) {
      if (!source.url.trim()) {
        throw new Error('URL de vídeo não informada.');
      }

      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();

      videoElement.preload = 'auto';
      videoElement.crossOrigin = null;
      videoElement.src = source.url;

      pushTelemetry(
        'LOAD_START',
        'info',
        'Iniciando load MP4 no HTMLVideoElement.',
        getVideoDiagnostics(videoElement),
      );

      videoElement.load();

      pushTelemetry(
        'LOAD_CALLED',
        'info',
        'video.load() chamado para MP4.',
        getVideoDiagnostics(videoElement),
      );

      await waitForNativeVideoReadiness(videoElement, pushTelemetry);

      pushTelemetry(
        'LOAD_READY',
        'info',
        'MP4 pronto para tentativa de reprodução.',
        getVideoDiagnostics(videoElement),
      );
    },

    async play() {
      pushTelemetry(
        'PLAY_START',
        'info',
        'Chamando video.play() para MP4.',
        getVideoDiagnostics(videoElement),
      );

      try {
        await videoElement.play();

        pushTelemetry(
          'PLAY_RESOLVED',
          'info',
          'Promise de video.play() resolvida para MP4.',
          getVideoDiagnostics(videoElement),
        );
      } catch (error) {
        const playbackError = buildVideoElementError(
          'Falha no video.play() para MP4',
          videoElement,
          error,
        );

        pushTelemetry(
          'PLAY_REJECTED',
          'error',
          playbackError.message,
          getVideoDiagnostics(videoElement),
        );

        throw playbackError;
      }
    },

    async pause() {
      videoElement.pause();

      pushTelemetry(
        'PAUSE_CALLED',
        'info',
        'video.pause() chamado para MP4.',
        getVideoDiagnostics(videoElement),
      );
    },

    destroy() {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();

      pushTelemetry(
        'DESTROYED',
        'info',
        'Adapter MP4 destruído e src removido.',
        getVideoDiagnostics(videoElement),
      );
    },
  };
}
