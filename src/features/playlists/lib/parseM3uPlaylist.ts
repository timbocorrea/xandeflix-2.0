import type { IptvChannel } from '../types/playlist';

type PendingChannelMetadata = {
  name?: string;
  logo?: string;
  groupTitle?: string;
  tvgId?: string;
  tvgName?: string;
};

type ParseM3uPlaylistOptions = {
  maxChannels?: number;
};

export type ParseM3uPlaylistProgress = {
  parsedLines: number;
  channelsParsed: number;
  extinfLines: number;
  playableUrlLines: number;
  firstNonEmptyLine: string;
};

export type ParseM3uPlaylistProgressiveOptions =
  ParseM3uPlaylistOptions & {
    batchSize?: number;
    yieldEveryLines?: number;
    onChannelsBatch?: (channels: IptvChannel[]) => void;
    onProgress?: (progress: ParseM3uPlaylistProgress) => void;
  };

export type ParseM3uPlaylistProgressiveResult = {
  channels: IptvChannel[];
  stats: ParseM3uPlaylistProgress;
};

export type ParseM3uPlaylistProgressiveStreamOptions =
  ParseM3uPlaylistProgressiveOptions & {
    onBytesReceived?: (bytesReceived: number) => void;
  };

const DEFAULT_PARSE_BATCH_SIZE = 250;
const DEFAULT_YIELD_EVERY_LINES = 1_200;

function parseAttributes(line: string) {
  const attributes: Record<string, string> = {};
  const attributeRegex = /([\w-]+)="([^"]*)"/g;

  for (const match of line.matchAll(attributeRegex)) {
    const [, key, value] = match;

    if (key) {
      attributes[key] = value ?? '';
    }
  }

  return attributes;
}

function parseChannelName(line: string) {
  const commaIndex = line.lastIndexOf(',');

  if (commaIndex === -1) {
    return undefined;
  }

  return line.slice(commaIndex + 1).trim() || undefined;
}

function isPlayableUrl(line: string) {
  const normalizedLine = line.trim().toLowerCase();

  return (
    normalizedLine.startsWith('http://') ||
    normalizedLine.startsWith('https://') ||
    normalizedLine.startsWith('rtmp://') ||
    normalizedLine.startsWith('rtsp://')
  );
}

function resolveMaxChannels(options?: ParseM3uPlaylistOptions) {
  const rawMaxChannels = options?.maxChannels;

  if (
    typeof rawMaxChannels !== 'number' ||
    !Number.isFinite(rawMaxChannels) ||
    rawMaxChannels <= 0
  ) {
    return undefined;
  }

  return Math.max(1, Math.floor(rawMaxChannels));
}

function resolvePositiveIntegerOrFallback(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function forEachNonEmptyLine(
  content: string,
  onLine: (line: string) => boolean | void,
) {
  let lineStart = 0;

  for (let index = 0; index <= content.length; index += 1) {
    const charCode = content.charCodeAt(index);
    const reachedEnd = index === content.length;
    const isLineBreak = charCode === 10 || charCode === 13;

    if (!reachedEnd && !isLineBreak) {
      continue;
    }

    const line = content.slice(lineStart, index).trim();

    if (line) {
      const shouldContinue = onLine(line);

      if (shouldContinue === false) {
        return;
      }
    }

    if (charCode === 13 && content.charCodeAt(index + 1) === 10) {
      index += 1;
    }

    lineStart = index + 1;
  }
}

export function parseM3uPlaylist(
  content: string,
  options?: ParseM3uPlaylistOptions,
): IptvChannel[] {
  const maxChannels = resolveMaxChannels(options);
  const channels: IptvChannel[] = [];
  let pendingMetadata: PendingChannelMetadata | null = null;

  forEachNonEmptyLine(content, (line) => {
    if (line.startsWith('#EXTINF')) {
      const attributes = parseAttributes(line);

      pendingMetadata = {
        name: parseChannelName(line),
        logo: attributes['tvg-logo'],
        groupTitle: attributes['group-title'],
        tvgId: attributes['tvg-id'],
        tvgName: attributes['tvg-name'],
      };

      return true;
    }

    if (line.startsWith('#')) {
      return true;
    }

    if (!isPlayableUrl(line)) {
      return true;
    }

    const name =
      pendingMetadata?.name ||
      pendingMetadata?.tvgName ||
      `Canal ${channels.length + 1}`;

    channels.push({
      id: `${channels.length + 1}`,
      name,
      url: line,
      logo: pendingMetadata?.logo,
      groupTitle: pendingMetadata?.groupTitle,
      tvgId: pendingMetadata?.tvgId,
      tvgName: pendingMetadata?.tvgName,
    });

    pendingMetadata = null;

    return maxChannels === undefined || channels.length < maxChannels;
  });

  return channels;
}

async function yieldToMainThread() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function cloneProgress(
  progress: ParseM3uPlaylistProgress,
): ParseM3uPlaylistProgress {
  return {
    parsedLines: progress.parsedLines,
    channelsParsed: progress.channelsParsed,
    extinfLines: progress.extinfLines,
    playableUrlLines: progress.playableUrlLines,
    firstNonEmptyLine: progress.firstNonEmptyLine,
  };
}

export async function parseM3uPlaylistProgressive(
  content: string,
  options?: ParseM3uPlaylistProgressiveOptions,
): Promise<ParseM3uPlaylistProgressiveResult> {
  const maxChannels = resolveMaxChannels(options);
  const batchSize = resolvePositiveIntegerOrFallback(
    options?.batchSize,
    DEFAULT_PARSE_BATCH_SIZE,
  );
  const yieldEveryLines = resolvePositiveIntegerOrFallback(
    options?.yieldEveryLines,
    DEFAULT_YIELD_EVERY_LINES,
  );

  const channels: IptvChannel[] = [];
  const channelBatch: IptvChannel[] = [];
  let pendingMetadata: PendingChannelMetadata | null = null;
  const progress: ParseM3uPlaylistProgress = {
    parsedLines: 0,
    channelsParsed: 0,
    extinfLines: 0,
    playableUrlLines: 0,
    firstNonEmptyLine: '',
  };

  const flushBatch = () => {
    if (channelBatch.length === 0) {
      return;
    }

    options?.onChannelsBatch?.([...channelBatch]);
    channelBatch.length = 0;
  };

  let lineStart = 0;

  for (let index = 0; index <= content.length; index += 1) {
    const charCode = content.charCodeAt(index);
    const reachedEnd = index === content.length;
    const isLineBreak = charCode === 10 || charCode === 13;

    if (!reachedEnd && !isLineBreak) {
      continue;
    }

    const line = content.slice(lineStart, index).trim();

    if (line) {
      progress.parsedLines += 1;

      if (!progress.firstNonEmptyLine) {
        progress.firstNonEmptyLine = line;
      }

      if (line.startsWith('#EXTINF')) {
        progress.extinfLines += 1;
        const attributes = parseAttributes(line);

        pendingMetadata = {
          name: parseChannelName(line),
          logo: attributes['tvg-logo'],
          groupTitle: attributes['group-title'],
          tvgId: attributes['tvg-id'],
          tvgName: attributes['tvg-name'],
        };
      } else if (!line.startsWith('#') && isPlayableUrl(line)) {
        progress.playableUrlLines += 1;

        const name =
          pendingMetadata?.name ||
          pendingMetadata?.tvgName ||
          `Canal ${channels.length + 1}`;

        const channel: IptvChannel = {
          id: `${channels.length + 1}`,
          name,
          url: line,
          logo: pendingMetadata?.logo,
          groupTitle: pendingMetadata?.groupTitle,
          tvgId: pendingMetadata?.tvgId,
          tvgName: pendingMetadata?.tvgName,
        };

        channels.push(channel);
        channelBatch.push(channel);
        progress.channelsParsed = channels.length;
        pendingMetadata = null;

        if (channelBatch.length >= batchSize) {
          flushBatch();
        }

        if (maxChannels !== undefined && channels.length >= maxChannels) {
          break;
        }
      }

      if (progress.parsedLines % yieldEveryLines === 0) {
        flushBatch();
        options?.onProgress?.(cloneProgress(progress));
        await yieldToMainThread();
      }
    }

    if (charCode === 13 && content.charCodeAt(index + 1) === 10) {
      index += 1;
    }

    lineStart = index + 1;
  }

  flushBatch();
  options?.onProgress?.(cloneProgress(progress));

  return {
    channels,
    stats: progress,
  };
}

export async function parseM3uPlaylistProgressiveFromStream(
  stream: ReadableStream<Uint8Array>,
  options?: ParseM3uPlaylistProgressiveStreamOptions,
): Promise<ParseM3uPlaylistProgressiveResult> {
  const maxChannels = resolveMaxChannels(options);
  const batchSize = resolvePositiveIntegerOrFallback(
    options?.batchSize,
    DEFAULT_PARSE_BATCH_SIZE,
  );
  const yieldEveryLines = resolvePositiveIntegerOrFallback(
    options?.yieldEveryLines,
    DEFAULT_YIELD_EVERY_LINES,
  );

  const channels: IptvChannel[] = [];
  const channelBatch: IptvChannel[] = [];
  let pendingMetadata: PendingChannelMetadata | null = null;
  let bytesReceived = 0;

  const progress: ParseM3uPlaylistProgress = {
    parsedLines: 0,
    channelsParsed: 0,
    extinfLines: 0,
    playableUrlLines: 0,
    firstNonEmptyLine: '',
  };

  const flushBatch = () => {
    if (channelBatch.length === 0) {
      return;
    }

    options?.onChannelsBatch?.([...channelBatch]);
    channelBatch.length = 0;
  };

  const processLine = async (rawLine: string) => {
    const line = rawLine.trim();

    if (!line) {
      return true;
    }

    progress.parsedLines += 1;

    if (!progress.firstNonEmptyLine) {
      progress.firstNonEmptyLine = line;
    }

    if (line.startsWith('#EXTINF')) {
      progress.extinfLines += 1;
      const attributes = parseAttributes(line);

      pendingMetadata = {
        name: parseChannelName(line),
        logo: attributes['tvg-logo'],
        groupTitle: attributes['group-title'],
        tvgId: attributes['tvg-id'],
        tvgName: attributes['tvg-name'],
      };
    } else if (!line.startsWith('#') && isPlayableUrl(line)) {
      progress.playableUrlLines += 1;

      const name =
        pendingMetadata?.name ||
        pendingMetadata?.tvgName ||
        `Canal ${channels.length + 1}`;

      const channel: IptvChannel = {
        id: `${channels.length + 1}`,
        name,
        url: line,
        logo: pendingMetadata?.logo,
        groupTitle: pendingMetadata?.groupTitle,
        tvgId: pendingMetadata?.tvgId,
        tvgName: pendingMetadata?.tvgName,
      };

      channels.push(channel);
      channelBatch.push(channel);
      progress.channelsParsed = channels.length;
      pendingMetadata = null;

      if (channelBatch.length >= batchSize) {
        flushBatch();
      }

      if (maxChannels !== undefined && channels.length >= maxChannels) {
        flushBatch();
        options?.onProgress?.(cloneProgress(progress));
        return false;
      }
    }

    if (progress.parsedLines % yieldEveryLines === 0) {
      flushBatch();
      options?.onProgress?.(cloneProgress(progress));
      await yieldToMainThread();
    }

    return true;
  };

  const processChunkLines = async (buffer: string) => {
    let lineStart = 0;

    for (let index = 0; index < buffer.length; index += 1) {
      const charCode = buffer.charCodeAt(index);
      const isLineBreak = charCode === 10 || charCode === 13;

      if (!isLineBreak) {
        continue;
      }

      const shouldContinue = await processLine(buffer.slice(lineStart, index));

      if (!shouldContinue) {
        return {
          continueReading: false,
          remainingBuffer: '',
        };
      }

      if (charCode === 13 && buffer.charCodeAt(index + 1) === 10) {
        index += 1;
      }

      lineStart = index + 1;
    }

    return {
      continueReading: true,
      remainingBuffer: buffer.slice(lineStart),
    };
  };

  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let textBuffer = '';
  let keepReading = true;

  while (keepReading) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    bytesReceived += value.byteLength;
    options?.onBytesReceived?.(bytesReceived);
    textBuffer += decoder.decode(value, { stream: true });

    const chunkResult = await processChunkLines(textBuffer);
    keepReading = chunkResult.continueReading;
    textBuffer = chunkResult.remainingBuffer;
  }

  if (!keepReading) {
    await reader.cancel();
  } else {
    textBuffer += decoder.decode();

    if (textBuffer.trim()) {
      await processLine(textBuffer);
    }
  }

  flushBatch();
  options?.onProgress?.(cloneProgress(progress));

  return {
    channels,
    stats: progress,
  };
}
