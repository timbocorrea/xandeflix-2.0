import { Capacitor, CapacitorHttp } from '@capacitor/core';

import {
  parseM3uPlaylistProgressive,
  parseM3uPlaylistProgressiveFromStream,
  type ParseM3uPlaylistProgressiveOptions,
  type ParseM3uPlaylistProgressiveStreamOptions,
} from './parseM3uPlaylist';
import type {
  IptvChannel,
  LoadedPlaylist,
  PlaylistDiagnostics,
  PlaylistLoadProgress,
  PlaylistSource,
} from '../types/playlist';

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_PARSE_BATCH_SIZE = 300;
const DEFAULT_PARSE_YIELD_EVERY_LINES = 1_200;
const PROGRESS_UI_THROTTLE_MS = 120;
const PROGRESS_LOG_THROTTLE_MS = 1_000;
const PROGRESS_LOG_BYTES_STEP = 512 * 1024;
const PROGRESS_LOG_CHANNELS_STEP = 500;
const PROGRESS_LOG_TAG = 'XANDEFLIX_PLAYLIST_PROGRESS';
const DEFAULT_NATIVE_TEXT_FALLBACK_MAX_BYTES = 20 * 1024 * 1024;

function getEnvNumber(name: string, fallback: number) {
  const rawValue = (import.meta.env as Record<string, string | undefined>)[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function getOptionalEnvNumber(name: string) {
  const rawValue = (import.meta.env as Record<string, string | undefined>)[name];

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return undefined;
  }

  return Math.floor(parsedValue);
}

const PLAYLIST_REQUEST_TIMEOUT_MS = getEnvNumber(
  'VITE_DIRECT_SOURCE_TIMEOUT_MS',
  DEFAULT_REQUEST_TIMEOUT_MS,
);
const PARSE_BATCH_SIZE = getEnvNumber(
  'VITE_DIRECT_SOURCE_PARSE_BATCH_SIZE',
  DEFAULT_PARSE_BATCH_SIZE,
);
const PARSE_YIELD_EVERY_LINES = getEnvNumber(
  'VITE_DIRECT_SOURCE_PARSE_YIELD_EVERY_LINES',
  DEFAULT_PARSE_YIELD_EVERY_LINES,
);
const MAX_PLAYLIST_BYTES = getOptionalEnvNumber(
  'VITE_DIRECT_SOURCE_MAX_PLAYLIST_BYTES',
);
const MAX_PLAYLIST_CHANNELS = getOptionalEnvNumber(
  'VITE_DIRECT_SOURCE_MAX_CHANNELS',
);
const MAX_NATIVE_TEXT_FALLBACK_BYTES = getEnvNumber(
  'VITE_DIRECT_SOURCE_NATIVE_TEXT_FALLBACK_MAX_BYTES',
  DEFAULT_NATIVE_TEXT_FALLBACK_MAX_BYTES,
);

type LoadDirectSourcePlaylistOptions = {
  onProgress?: (progress: PlaylistLoadProgress) => void;
  onChannelsBatch?: (channels: IptvChannel[]) => void;
};

type ParsedPlaylistResult = {
  channels: IptvChannel[];
  stats: {
    parsedLines: number;
    channelsParsed: number;
    extinfLines: number;
    playableUrlLines: number;
    firstNonEmptyLine: string;
  };
  contentLength: number;
};

function createInitialProgress(): PlaylistLoadProgress {
  return {
    phase: 'downloading',
    bytesTotal: null,
    bytesReceived: 0,
    parsedLines: 0,
    channelsParsed: 0,
    extinfLines: 0,
    playableUrlLines: 0,
  };
}

function emitProgress(
  options: LoadDirectSourcePlaylistOptions | undefined,
  progress: PlaylistLoadProgress,
) {
  options?.onProgress?.({ ...progress });
}

function createProgressReporter(
  options: LoadDirectSourcePlaylistOptions | undefined,
  progress: PlaylistLoadProgress,
) {
  let lastUiEmitAt = 0;
  let lastLogAt = 0;
  let lastLoggedPhase = progress.phase;
  let lastLoggedBytes = -1;
  let lastLoggedChannels = -1;

  return (force = false) => {
    const now = Date.now();

    if (force || now - lastUiEmitAt >= PROGRESS_UI_THROTTLE_MS) {
      emitProgress(options, progress);
      lastUiEmitAt = now;
    }

    const shouldLog =
      force ||
      progress.phase !== lastLoggedPhase ||
      now - lastLogAt >= PROGRESS_LOG_THROTTLE_MS ||
      Math.abs(progress.bytesReceived - lastLoggedBytes) >= PROGRESS_LOG_BYTES_STEP ||
      Math.abs(progress.channelsParsed - lastLoggedChannels) >=
        PROGRESS_LOG_CHANNELS_STEP;

    if (shouldLog) {
      console.info(
        PROGRESS_LOG_TAG,
        JSON.stringify({
          phase: progress.phase,
          bytesReceived: progress.bytesReceived,
          bytesTotal: progress.bytesTotal,
          parsedLines: progress.parsedLines,
          channelsParsed: progress.channelsParsed,
          extinfLines: progress.extinfLines,
          playableUrlLines: progress.playableUrlLines,
          timestamp: new Date().toISOString(),
        }),
      );

      lastLogAt = now;
      lastLoggedPhase = progress.phase;
      lastLoggedBytes = progress.bytesReceived;
      lastLoggedChannels = progress.channelsParsed;
    }
  };
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createTimeoutError() {
  return new Error(
    `Tempo limite ao carregar a playlist (${Math.round(PLAYLIST_REQUEST_TIMEOUT_MS / 1000)}s).`,
  );
}

function sanitizeDiagnosticLine(line: string) {
  const trimmedLine = line.trim();

  if (trimmedLine.length > 160) {
    return `${trimmedLine.slice(0, 160)}...`;
  }

  return trimmedLine;
}

function readContentLengthFromHeaders(headers?: Record<string, string>) {
  if (!headers) {
    return null;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'content-length') {
      continue;
    }

    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue) && parsedValue >= 0) {
      return parsedValue;
    }
  }

  return null;
}

function readContentLengthFromResponse(response: Response) {
  const contentLength = Number(response.headers.get('content-length'));

  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return null;
  }

  return contentLength;
}

function ensurePlaylistWithinSizeLimit(contentLength: number | null) {
  if (!MAX_PLAYLIST_BYTES) {
    return;
  }

  if (contentLength === null || contentLength <= MAX_PLAYLIST_BYTES) {
    return;
  }

  throw new Error(
    `A playlist é muito grande (${formatMegabytes(contentLength)}). Limite atual: ${formatMegabytes(MAX_PLAYLIST_BYTES)}.`,
  );
}

function ensureLoadedContentWithinSizeLimit(content: string) {
  if (!MAX_PLAYLIST_BYTES) {
    return;
  }

  if (content.length <= MAX_PLAYLIST_BYTES) {
    return;
  }

  throw new Error(
    `A playlist recebida é muito grande (${formatMegabytes(content.length)}). Limite atual: ${formatMegabytes(MAX_PLAYLIST_BYTES)}.`,
  );
}

async function withTimeout<T>(promise: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createTimeoutError());
    }, PLAYLIST_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function runBrowserHeadCheck(
  sourceUrl: string,
  progress: PlaylistLoadProgress,
  reportProgress: (force?: boolean) => void,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PLAYLIST_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(sourceUrl, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return;
    }

    const contentLength = readContentLengthFromResponse(response);
    ensurePlaylistWithinSizeLimit(contentLength);

    if (contentLength !== null) {
      progress.bytesTotal = contentLength;
      reportProgress(true);
    }
  } catch {
    // Alguns servidores/CORS bloqueiam HEAD. Nesse caso seguimos para GET.
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runNativeHeadCheck(
  sourceUrl: string,
  progress: PlaylistLoadProgress,
  reportProgress: (force?: boolean) => void,
) {
  try {
    const response = await withTimeout(
      CapacitorHttp.request({
        url: sourceUrl,
        method: 'HEAD',
        headers: {
          Accept:
            'application/vnd.apple.mpegurl, application/x-mpegURL, audio/mpegurl, text/plain, */*',
          'User-Agent': 'Xandeflix/1.0',
        },
        connectTimeout: PLAYLIST_REQUEST_TIMEOUT_MS,
        readTimeout: PLAYLIST_REQUEST_TIMEOUT_MS,
      }),
    );

    if (response.status < 200 || response.status >= 300) {
      return;
    }

    const contentLength = readContentLengthFromHeaders(response.headers);
    ensurePlaylistWithinSizeLimit(contentLength);

    if (contentLength !== null) {
      progress.bytesTotal = contentLength;
      reportProgress(true);
    }
  } catch {
    // Alguns servidores recusam HEAD. Nesse caso seguimos para GET.
  }
}

async function fetchResponseWithTimeout(sourceUrl: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PLAYLIST_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw createTimeoutError();
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parsePlaylistFromResponse(
  response: Response,
  progress: PlaylistLoadProgress,
  options: LoadDirectSourcePlaylistOptions | undefined,
  reportProgress: (force?: boolean) => void,
): Promise<ParsedPlaylistResult> {
  if (!response.ok) {
    throw new Error(`Falha ao carregar playlist. HTTP ${response.status}.`);
  }

  const contentLength = readContentLengthFromResponse(response);
  ensurePlaylistWithinSizeLimit(contentLength);

  if (contentLength !== null) {
    progress.bytesTotal = contentLength;
  }

  const applyParseProgress = (parseProgress: {
    parsedLines: number;
    channelsParsed: number;
    extinfLines: number;
    playableUrlLines: number;
  }) => {
    progress.phase = 'parsing';
    progress.parsedLines = parseProgress.parsedLines;
    progress.channelsParsed = parseProgress.channelsParsed;
    progress.extinfLines = parseProgress.extinfLines;
    progress.playableUrlLines = parseProgress.playableUrlLines;
    reportProgress();
  };

  const streamOptions: ParseM3uPlaylistProgressiveStreamOptions = {
    maxChannels: MAX_PLAYLIST_CHANNELS,
    batchSize: PARSE_BATCH_SIZE,
    yieldEveryLines: PARSE_YIELD_EVERY_LINES,
    onChannelsBatch: options?.onChannelsBatch,
    onBytesReceived: (bytesReceived) => {
      if (MAX_PLAYLIST_BYTES && bytesReceived > MAX_PLAYLIST_BYTES) {
        throw new Error(
          `A playlist ultrapassou o limite configurado (${formatMegabytes(MAX_PLAYLIST_BYTES)}).`,
        );
      }

      progress.bytesReceived = bytesReceived;

      if (progress.bytesTotal === null) {
        progress.phase = 'downloading';
      }

      reportProgress();
    },
    onProgress: applyParseProgress,
  };

  if (response.body) {
    const parsedFromStream = await parseM3uPlaylistProgressiveFromStream(
      response.body,
      streamOptions,
    );

    const finalContentLength = progress.bytesReceived;

    if (progress.bytesTotal === null) {
      progress.bytesTotal = finalContentLength;
    }

    return {
      channels: parsedFromStream.channels,
      stats: parsedFromStream.stats,
      contentLength: finalContentLength,
    };
  }

  if (Capacitor.isNativePlatform()) {
    if (
      contentLength === null ||
      contentLength > MAX_NATIVE_TEXT_FALLBACK_BYTES
    ) {
      throw new Error(
        `A fonte não liberou stream incremental e o fallback em texto foi bloqueado para evitar travamento/OOM. Limite atual do fallback: ${formatMegabytes(MAX_NATIVE_TEXT_FALLBACK_BYTES)}.`,
      );
    }
  }

  const content = await response.text();
  ensureLoadedContentWithinSizeLimit(content);

  progress.phase = 'parsing';
  progress.bytesReceived = content.length;

  if (progress.bytesTotal === null) {
    progress.bytesTotal = content.length;
  }

  reportProgress(true);

  const parseOptions: ParseM3uPlaylistProgressiveOptions = {
    maxChannels: MAX_PLAYLIST_CHANNELS,
    batchSize: PARSE_BATCH_SIZE,
    yieldEveryLines: PARSE_YIELD_EVERY_LINES,
    onChannelsBatch: options?.onChannelsBatch,
    onProgress: applyParseProgress,
  };

  const parsedFromText = await parseM3uPlaylistProgressive(content, parseOptions);

  return {
    channels: parsedFromText.channels,
    stats: parsedFromText.stats,
    contentLength: content.length,
  };
}

async function loadAndParsePlaylist(
  sourceUrl: string,
  progress: PlaylistLoadProgress,
  options: LoadDirectSourcePlaylistOptions | undefined,
  reportProgress: (force?: boolean) => void,
) {
  if (Capacitor.isNativePlatform()) {
    await runNativeHeadCheck(sourceUrl, progress, reportProgress);
  } else {
    await runBrowserHeadCheck(sourceUrl, progress, reportProgress);
  }

  progress.phase = 'downloading';
  reportProgress(true);

  const response = await fetchResponseWithTimeout(sourceUrl);
  return parsePlaylistFromResponse(response, progress, options, reportProgress);
}

function buildDiagnostics(
  contentLength: number,
  stats: {
    totalLines: number;
    extinfLines: number;
    playableUrlLines: number;
    firstNonEmptyLine: string;
  },
): PlaylistDiagnostics {
  return {
    contentLength,
    totalLines: stats.totalLines,
    startsWithExtM3u: stats.firstNonEmptyLine.startsWith('#EXTM3U'),
    extinfLines: stats.extinfLines,
    playableUrlLines: stats.playableUrlLines,
    firstNonEmptyLine: sanitizeDiagnosticLine(stats.firstNonEmptyLine),
  };
}

export async function loadDirectSourcePlaylist(
  source: PlaylistSource,
  options?: LoadDirectSourcePlaylistOptions,
): Promise<LoadedPlaylist> {
  const sourceUrl = source.url.trim();

  if (!sourceUrl) {
    throw new Error('URL da playlist não informada.');
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    throw new Error('A URL da playlist deve começar com http:// ou https://.');
  }

  const progress = createInitialProgress();
  const reportProgress = createProgressReporter(options, progress);
  reportProgress(true);

  try {
    const parsed = await loadAndParsePlaylist(
      sourceUrl,
      progress,
      options,
      reportProgress,
    );

    progress.phase = 'finalizing';
    progress.parsedLines = parsed.stats.parsedLines;
    progress.channelsParsed = parsed.stats.channelsParsed;
    progress.extinfLines = parsed.stats.extinfLines;
    progress.playableUrlLines = parsed.stats.playableUrlLines;

    if (progress.bytesTotal === null) {
      progress.bytesTotal = parsed.contentLength;
    }

    progress.bytesReceived = Math.max(progress.bytesReceived, parsed.contentLength);
    reportProgress(true);

    const diagnostics = buildDiagnostics(parsed.contentLength, {
      totalLines: parsed.stats.parsedLines,
      extinfLines: parsed.stats.extinfLines,
      playableUrlLines: parsed.stats.playableUrlLines,
      firstNonEmptyLine: parsed.stats.firstNonEmptyLine,
    });

    return {
      channels: parsed.channels,
      total: parsed.channels.length,
      diagnostics,
    };
  } catch (error) {
    throw new Error(
      error instanceof TypeError
        ? 'Falha ao carregar playlist. Verifique conexão, CORS e disponibilidade da fonte.'
        : error instanceof Error
          ? error.message
          : 'Erro desconhecido ao carregar playlist.',
    );
  }
}
