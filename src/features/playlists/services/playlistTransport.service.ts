import { Capacitor } from '@capacitor/core';

export const LOCAL_PLAYLIST_PROXY_PATH =
  '/__xandeflix/dev/playlist';

export type PlaylistTransportMode =
  | 'native-direct'
  | 'browser-development-local-proxy'
  | 'browser-production-direct';

type PlaylistTransportMethod = 'GET' | 'HEAD';

type FetchPlaylistTransportInput = {
  sourceUrl: string;
  method: PlaylistTransportMethod;
  signal?: AbortSignal;
};

function normalizeSourceUrl(sourceUrl: string) {
  const normalizedSourceUrl = sourceUrl.trim();

  if (!normalizedSourceUrl) {
    throw new Error('URL da playlist não informada.');
  }

  if (!/^https?:\/\//i.test(normalizedSourceUrl)) {
    throw new Error(
      'A URL da playlist deve começar com http:// ou https://.',
    );
  }

  return normalizedSourceUrl;
}

export function resolvePlaylistTransportMode(): PlaylistTransportMode {
  if (Capacitor.isNativePlatform()) {
    return 'native-direct';
  }

  if (import.meta.env.DEV) {
    return 'browser-development-local-proxy';
  }

  return 'browser-production-direct';
}

export async function fetchPlaylistTransport(
  input: FetchPlaylistTransportInput,
): Promise<Response> {
  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const transportMode = resolvePlaylistTransportMode();

  if (transportMode === 'browser-development-local-proxy') {
    return fetch(LOCAL_PLAYLIST_PROXY_PATH, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceUrl,
        upstreamMethod: input.method,
      }),
      signal: input.signal,
    });
  }

  return fetch(sourceUrl, {
    method: input.method,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
    signal: input.signal,
  });
}
