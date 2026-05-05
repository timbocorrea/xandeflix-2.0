import type { PlaylistDiagnostics } from '../types/playlist';

function sanitizeLine(line: string) {
  const trimmedLine = line.trim();

  if (trimmedLine.length > 160) {
    return `${trimmedLine.slice(0, 160)}...`;
  }

  return trimmedLine;
}

function isPlayableUrlLine(line: string) {
  const normalizedLine = line.trim().toLowerCase();

  return (
    normalizedLine.startsWith('http://') ||
    normalizedLine.startsWith('https://') ||
    normalizedLine.startsWith('rtmp://') ||
    normalizedLine.startsWith('rtsp://')
  );
}

function forEachNonEmptyLine(
  content: string,
  onLine: (line: string) => void,
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
      onLine(line);
    }

    if (charCode === 13 && content.charCodeAt(index + 1) === 10) {
      index += 1;
    }

    lineStart = index + 1;
  }
}

export function analyzeM3uPlaylist(content: string): PlaylistDiagnostics {
  let totalLines = 0;
  let extinfLines = 0;
  let playableUrlLines = 0;
  let firstNonEmptyLine = '';

  forEachNonEmptyLine(content, (line) => {
    totalLines += 1;

    if (totalLines === 1) {
      firstNonEmptyLine = sanitizeLine(line);
    }

    if (line.startsWith('#EXTINF')) {
      extinfLines += 1;
    }

    if (isPlayableUrlLine(line)) {
      playableUrlLines += 1;
    }
  });

  return {
    contentLength: content.length,
    totalLines,
    startsWithExtM3u: firstNonEmptyLine.startsWith('#EXTM3U'),
    extinfLines,
    playableUrlLines,
    firstNonEmptyLine,
  };
}
