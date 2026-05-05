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

export function analyzeM3uPlaylist(content: string): PlaylistDiagnostics {
  const lines = content.split(/\r?\n/);
  const nonEmptyLines = lines
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    contentLength: content.length,
    totalLines: nonEmptyLines.length,
    startsWithExtM3u: nonEmptyLines[0]?.startsWith('#EXTM3U') ?? false,
    extinfLines: nonEmptyLines.filter((line) => line.startsWith('#EXTINF'))
      .length,
    playableUrlLines: nonEmptyLines.filter(isPlayableUrlLine).length,
    firstNonEmptyLine: sanitizeLine(nonEmptyLines[0] ?? ''),
  };
}
