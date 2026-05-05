import type {
  UniversalPlayerAdapter,
  UniversalPlayerSource,
} from '../types/player';

type HlsErrorData = {
  fatal?: boolean;
  type?: string;
  details?: string;
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
    ERROR: string;
  };
};

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
        videoElement.src = source.url;
        videoElement.load();

        await waitForNativeHlsMetadata(videoElement);
        return;
      }

      const hlsModule = await import('hls.js');
      const Hls = hlsModule.default as unknown as HlsConstructor;

      if (!Hls.isSupported()) {
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
          settleResolve();
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          const errorData = data as HlsErrorData;

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

      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
    },
  };
}
