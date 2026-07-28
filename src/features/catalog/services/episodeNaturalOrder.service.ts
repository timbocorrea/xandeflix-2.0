import type { HomeVodItem } from './homeVod.service';

type ParsedEpisodeOrder = {
  seasonNumber: number | null;
  episodeNumber: number | null;
};

const EPISODE_PATTERNS: RegExp[] = [
  /\bS(\d{1,3})\s*-?\s*E(\d{1,4})\b/i,
  /\bT(\d{1,3})\s*-?\s*E(\d{1,4})\b/i,
  /\b(\d{1,3})x(\d{1,4})\b/i,
];

const EPISODE_ONLY_PATTERNS: RegExp[] = [
  /\bEpis[oó]dio\s*(\d{1,4})\b/i,
  /\bEp\.?\s*(\d{1,4})\b/i,
];

function toSafeNumber(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseEpisodeNaturalOrder(
  value?: string | null,
): ParsedEpisodeOrder {
  const text = value?.trim() ?? '';

  for (const pattern of EPISODE_PATTERNS) {
    const match = text.match(pattern);

    if (match) {
      return {
        seasonNumber: toSafeNumber(match[1]),
        episodeNumber: toSafeNumber(match[2]),
      };
    }
  }

  for (const pattern of EPISODE_ONLY_PATTERNS) {
    const match = text.match(pattern);

    if (match) {
      return {
        seasonNumber: null,
        episodeNumber: toSafeNumber(match[1]),
      };
    }
  }

  return {
    seasonNumber: null,
    episodeNumber: null,
  };
}

function getEpisodeOrder(item: HomeVodItem) {
  return parseEpisodeNaturalOrder(item.episodeTitle || item.title);
}

function compareNullableNumber(
  first: number | null,
  second: number | null,
) {
  if (first !== null && second !== null && first !== second) {
    return first - second;
  }

  if (first !== null && second === null) {
    return -1;
  }

  if (first === null && second !== null) {
    return 1;
  }

  return 0;
}

export function sortEpisodesNaturally(items: HomeVodItem[]) {
  return [...items].sort((first, second) => {
    const firstWithOrder = first as HomeVodItem & {
      seasonNumber?: number | null;
      episodeNumber?: number | null;
    };
    const secondWithOrder = second as HomeVodItem & {
      seasonNumber?: number | null;
      episodeNumber?: number | null;
    };
    const firstOrder = getEpisodeOrder(first);
    const secondOrder = getEpisodeOrder(second);
    const seasonOrder = compareNullableNumber(
      firstWithOrder.seasonNumber ?? firstOrder.seasonNumber,
      secondWithOrder.seasonNumber ?? secondOrder.seasonNumber,
    );

    if (seasonOrder !== 0) {
      return seasonOrder;
    }

    const episodeOrder = compareNullableNumber(
      firstWithOrder.episodeNumber ?? firstOrder.episodeNumber,
      secondWithOrder.episodeNumber ?? secondOrder.episodeNumber,
    );

    if (episodeOrder !== 0) {
      return episodeOrder;
    }

    return (first.episodeTitle || first.title).localeCompare(
      second.episodeTitle || second.title,
      'pt-BR',
      {
        numeric: true,
        sensitivity: 'base',
      },
    );
  });
}
