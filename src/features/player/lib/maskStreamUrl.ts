const SENSITIVE_QUERY_KEYS =
  /token|key|password|passwd|pass|user|username|auth|session|sid|login|hash|signature|sig/i;

const STREAM_CREDENTIAL_BASE_PATHS = new Set([
  'live',
  'movie',
  'series',
  'vod',
]);

function looksLikeStreamUrl(value: string) {
  return /^(https?:\/\/|rtmp:\/\/|rtsp:\/\/)/i.test(value);
}

function maskKnownXtreamPath(pathname: string) {
  const segments = pathname.split('/');

  return segments
    .map((segment, index) => {
      if (!segment) return segment;

      const previousSegment = segments[index - 1]?.toLowerCase();
      const previousPreviousSegment = segments[index - 2]?.toLowerCase();
      const normalizedSegment = segment.toLowerCase();
      const isStreamId = /^\d+(\.[a-z0-9]+)?$/i.test(segment);
      const hasMediaExtension = /\.(m3u8|mpd|ts|m2ts|mp4|m4v)$/i.test(segment);

      if (STREAM_CREDENTIAL_BASE_PATHS.has(normalizedSegment)) {
        return segment;
      }

      if (isStreamId || hasMediaExtension) {
        return segment;
      }

      if (
        STREAM_CREDENTIAL_BASE_PATHS.has(previousSegment) ||
        STREAM_CREDENTIAL_BASE_PATHS.has(previousPreviousSegment)
      ) {
        return '***';
      }

      return segment;
    })
    .join('/');
}

export function maskStreamUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) {
    return '';
  }

  const trimmedUrl = rawUrl.trim();

  if (!trimmedUrl) {
    return '';
  }

  const [urlWithoutHeaders, ...headerParts] = trimmedUrl.split('|');
  const maskedHeaderSuffix = headerParts.length > 0 ? '|...' : '';

  try {
    const parsedUrl = new URL(urlWithoutHeaders);

    if (parsedUrl.username) {
      parsedUrl.username = '***';
    }

    if (parsedUrl.password) {
      parsedUrl.password = '***';
    }

    parsedUrl.pathname = maskKnownXtreamPath(parsedUrl.pathname);

    Array.from(parsedUrl.searchParams.keys()).forEach((key) => {
      if (SENSITIVE_QUERY_KEYS.test(key)) {
        parsedUrl.searchParams.set(key, '***');
      }
    });

    return `${parsedUrl.toString()}${maskedHeaderSuffix}`;
  } catch {
    return trimmedUrl
      .replace(
        /(\/(?:live|movie|series|vod)\/)[^/]+\/[^/]+/i,
        '$1***/***',
      )
      .replace(
        /([?&](?:token|key|password|passwd|pass|user|username|auth|session|sid|login|hash|signature|sig)=)[^&]+/gi,
        '$1***',
      )
      .replace(/\|.+$/i, '|...');
  }
}

export function maskObjectStreamUrls<T>(payload: T): T {
  if (!payload || typeof payload !== 'object') {
    if (typeof payload === 'string' && looksLikeStreamUrl(payload)) {
      return maskStreamUrl(payload) as T;
    }

    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => maskObjectStreamUrls(item)) as T;
  }

  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).map(([key, value]) => {
      if (typeof value === 'string' && looksLikeStreamUrl(value)) {
        return [key, maskStreamUrl(value)];
      }

      return [key, maskObjectStreamUrls(value)];
    }),
  ) as T;
}
