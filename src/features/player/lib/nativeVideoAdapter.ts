import type {
  UniversalPlayerAdapter,
  UniversalPlayerSource,
} from '../types/player';

function waitForVideoMetadata(videoElement: HTMLVideoElement) {
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
      reject(videoElement.error ?? new Error('Erro ao carregar vídeo nativo.'));
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata, {
      once: true,
    });

    videoElement.addEventListener('error', handleError, {
      once: true,
    });
  });
}

export function createNativeVideoAdapter(
  videoElement: HTMLVideoElement,
): UniversalPlayerAdapter {
  return {
    kind: 'mp4',

    async load(source: UniversalPlayerSource) {
      if (!source.url.trim()) {
        throw new Error('URL de vídeo não informada.');
      }

      videoElement.preload = 'metadata';
      videoElement.src = source.url;
      videoElement.load();

      await waitForVideoMetadata(videoElement);
    },

    async play() {
      await videoElement.play();
    },

    async pause() {
      videoElement.pause();
    },

    destroy() {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
    },
  };
}
