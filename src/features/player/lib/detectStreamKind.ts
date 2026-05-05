import type { StreamDetectionResult, StreamKind } from '../types/stream';

function normalizeInput(value: string) {
  return value.trim();
}

function removeQueryAndHash(value: string) {
  return value.split('#')[0]?.split('?')[0]?.split('|')[0] ?? value;
}

function getExtension(value: string) {
  const cleanValue = removeQueryAndHash(value).toLowerCase();
  const lastDotIndex = cleanValue.lastIndexOf('.');

  if (lastDotIndex === -1) {
    return null;
  }

  return cleanValue.slice(lastDotIndex);
}

function detectByMimeType(mimeType?: string): StreamKind | null {
  if (!mimeType) return null;

  const normalizedMimeType = mimeType.toLowerCase();

  if (
    normalizedMimeType.includes('application/vnd.apple.mpegurl') ||
    normalizedMimeType.includes('application/x-mpegurl')
  ) {
    return 'hls';
  }

  if (
    normalizedMimeType.includes('application/dash+xml') ||
    normalizedMimeType.includes('video/vnd.mpeg.dash.mpd')
  ) {
    return 'dash';
  }

  if (
    normalizedMimeType.includes('video/mp2t') ||
    normalizedMimeType.includes('video/mpeg')
  ) {
    return 'mpegts';
  }

  if (normalizedMimeType.includes('video/mp4')) {
    return 'mp4';
  }

  return null;
}

function detectByExtension(extension: string | null): StreamKind {
  if (!extension) return 'unknown';

  if (extension === '.m3u8') {
    return 'hls';
  }

  if (extension === '.mpd') {
    return 'dash';
  }

  if (extension === '.ts' || extension === '.m2ts') {
    return 'mpegts';
  }

  if (extension === '.mp4' || extension === '.m4v') {
    return 'mp4';
  }

  return 'unknown';
}

function detectByUrlHints(url: string): StreamKind | null {
  const normalizedUrl = url.trim();

  if (!normalizedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    const output = (parsedUrl.searchParams.get('output') || '').toLowerCase();
    const type = (parsedUrl.searchParams.get('type') || '').toLowerCase();
    const pathLower = parsedUrl.pathname.toLowerCase();

    if (pathLower.endsWith('.m3u8')) {
      return 'hls';
    }

    if (pathLower.endsWith('.ts') || pathLower.endsWith('.m2ts')) {
      return 'mpegts';
    }

    if (output === 'hls' || output === 'm3u8' || type === 'hls' || type === 'm3u8') {
      return 'hls';
    }

    if (output === 'ts' || output === 'mpegts') {
      return 'mpegts';
    }

    // Padrão Xtream para live costuma vir sem extensão final.
    if (pathLower.includes('/live/')) {
      return 'mpegts';
    }
  } catch {
    const fallbackLower = normalizedUrl.toLowerCase();

    if (fallbackLower.includes('output=hls') || fallbackLower.includes('output=m3u8')) {
      return 'hls';
    }

    if (fallbackLower.includes('output=ts') || fallbackLower.includes('output=mpegts')) {
      return 'mpegts';
    }

    if (fallbackLower.includes('/live/')) {
      return 'mpegts';
    }
  }

  return null;
}

export function detectStreamKind(
  url: string,
  mimeType?: string,
): StreamDetectionResult {
  const normalizedUrl = normalizeInput(url);
  const extension = getExtension(normalizedUrl);

  return {
    kind:
      detectByMimeType(mimeType) ??
      detectByUrlHints(normalizedUrl) ??
      detectByExtension(extension),
    url: normalizedUrl,
    extension,
    mimeType,
  };
}
