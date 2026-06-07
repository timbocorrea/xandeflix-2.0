import type {
  NeutralContentIdentity,
  NeutralMediaType,
} from '@/features/neutralData/types/neutralContent.types';

export function normalizeNeutralText(value?: string | number | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeNeutralToken(value?: string | number | null): string {
  return normalizeNeutralText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function hasNeutralTmdbIdentity(
  identity: Pick<NeutralContentIdentity, 'tmdbId'>,
): boolean {
  const tmdbId = String(identity.tmdbId ?? '').trim();
  return tmdbId.length > 0;
}

export function buildNeutralContentFingerprint(input: {
  mediaType: NeutralMediaType;
  canonicalTitle?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}): string {
  const title = normalizeNeutralToken(input.canonicalTitle) || 'untitled';
  const season =
    input.seasonNumber === null || input.seasonNumber === undefined
      ? 's'
      : `s${input.seasonNumber}`;
  const episode =
    input.episodeNumber === null || input.episodeNumber === undefined
      ? 'e'
      : `e${input.episodeNumber}`;

  return [
    'neutral',
    input.mediaType,
    title,
    season,
    episode,
  ].join(':');
}

export function buildNeutralContentIdentity(
  input: Omit<NeutralContentIdentity, 'contentFingerprint'> & {
    contentFingerprint?: string | null;
  },
): NeutralContentIdentity {
  const canonicalTitle = input.canonicalTitle?.trim() || null;

  return {
    mediaType: input.mediaType,
    tmdbId: input.tmdbId ?? null,
    seasonNumber: input.seasonNumber ?? null,
    episodeNumber: input.episodeNumber ?? null,
    canonicalTitle,
    contentFingerprint:
      input.contentFingerprint?.trim() ||
      buildNeutralContentFingerprint({
        mediaType: input.mediaType,
        canonicalTitle,
        seasonNumber: input.seasonNumber,
        episodeNumber: input.episodeNumber,
      }),
  };
}

export function buildNeutralContentKey(
  identity: NeutralContentIdentity,
): string {
  const tmdbId = String(identity.tmdbId ?? '').trim();

  if (tmdbId) {
    return [
      'tmdb',
      identity.mediaType,
      tmdbId,
      identity.seasonNumber ?? '',
      identity.episodeNumber ?? '',
    ].join(':');
  }

  return (
    identity.contentFingerprint ||
    buildNeutralContentFingerprint({
      mediaType: identity.mediaType,
      canonicalTitle: identity.canonicalTitle,
      seasonNumber: identity.seasonNumber,
      episodeNumber: identity.episodeNumber,
    })
  );
}

export function isSameNeutralContent(
  first: NeutralContentIdentity,
  second: NeutralContentIdentity,
): boolean {
  return buildNeutralContentKey(first) === buildNeutralContentKey(second);
}
