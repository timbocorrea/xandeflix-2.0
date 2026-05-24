const EPISODE_PLAYBACK_PROGRESS_PREFIX = 'xandeflix:episode-playback-progress:v1:';

export type EpisodePlaybackProgressStatus = 'not-started' | 'played';

export type EpisodePlaybackProgressInput = {
  episodeId?: string | null;
  streamUrl?: string | null;
  title?: string | null;
  seriesTitle?: string | null;
  seriesGroupTitle?: string | null;
  seriesTmdbId?: string | null;
  seriesTmdbTitle?: string | null;
  episodeIndex?: number | null;
};

export type EpisodePlaybackProgressRecord = {
  status: EpisodePlaybackProgressStatus;
  startedAt: number;
  updatedAt: number;
  playCount: number;
  lastPositionSeconds?: number | null;
};

function normalizeProgressKeyPart(value: string | number | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getEpisodePlaybackProgressKey(
  input: EpisodePlaybackProgressInput,
) {
  const episodeIdentity =
    normalizeProgressKeyPart(input.episodeId) ||
    normalizeProgressKeyPart(input.streamUrl) ||
    [
      normalizeProgressKeyPart(input.seriesTmdbId),
      normalizeProgressKeyPart(input.seriesTmdbTitle),
      normalizeProgressKeyPart(input.seriesTitle),
      normalizeProgressKeyPart(input.seriesGroupTitle),
      normalizeProgressKeyPart(input.episodeIndex),
      normalizeProgressKeyPart(input.title),
    ]
      .filter(Boolean)
      .join('__');

  if (!episodeIdentity) {
    return null;
  }

  return `${EPISODE_PLAYBACK_PROGRESS_PREFIX}${episodeIdentity}`;
}

export function readEpisodePlaybackProgress(
  input: EpisodePlaybackProgressInput,
): EpisodePlaybackProgressRecord | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const key = getEpisodePlaybackProgressKey(input);

    if (!key) {
      return null;
    }

    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<EpisodePlaybackProgressRecord>;

    if (parsed.status !== 'played') {
      return null;
    }

    return {
      status: 'played',
      startedAt:
        typeof parsed.startedAt === 'number' ? parsed.startedAt : Date.now(),
      updatedAt:
        typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      playCount:
        typeof parsed.playCount === 'number' && parsed.playCount > 0
          ? parsed.playCount
          : 1,
      lastPositionSeconds:
        typeof parsed.lastPositionSeconds === 'number'
          ? parsed.lastPositionSeconds
          : null,
    };
  } catch {
    return null;
  }
}

export function hasEpisodePlaybackProgress(input: EpisodePlaybackProgressInput) {
  return readEpisodePlaybackProgress(input)?.status === 'played';
}

export function markEpisodePlaybackStarted(
  input: EpisodePlaybackProgressInput,
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const key = getEpisodePlaybackProgressKey(input);

    if (!key) {
      return;
    }

    const currentRecord = readEpisodePlaybackProgress(input);
    const now = Date.now();

    const nextRecord: EpisodePlaybackProgressRecord = {
      status: 'played',
      startedAt: currentRecord?.startedAt ?? now,
      updatedAt: now,
      playCount: (currentRecord?.playCount ?? 0) + 1,
      lastPositionSeconds: currentRecord?.lastPositionSeconds ?? null,
    };

    window.localStorage.setItem(key, JSON.stringify(nextRecord));
  } catch {
    // Progresso local best-effort. Falha nao deve bloquear reproducao.
  }
}
