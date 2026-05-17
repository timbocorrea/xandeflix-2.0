import type { IptvChannel } from '../types/playlist';

export type ChannelContentKind = 'live' | 'movie' | 'series' | 'unknown';

const MOVIE_GROUP_TERMS = [
  'filme',
  'filmes',
  'movie',
  'movies',
  'cinema',
  'vod',
  'lançamento',
  'lancamento',
  'estreia',
  'estreias',
];

const SERIES_GROUP_TERMS = [
  'serie',
  'series',
  'série',
  'séries',
  'temporada',
  'temporadas',
  'episodio',
  'episódio',
  'episodios',
  'episódios',
  'novela',
  'novelas',
];

const LIVE_GROUP_TERMS = [
  'canal',
  'canais',
  'ao vivo',
  'live',
  'tv',
  'news',
  'noticias',
  'notícias',
  'jornal',
  'esporte',
  'esportes',
  'sport',
  'sports',
  'radio',
  'rádio',
];

const SERIES_NAME_PATTERNS = [
  /\bs\d{1,2}\s*e\d{1,3}\b/i,
  /\b\d{1,2}x\d{1,3}\b/i,
  /\btemporada\s+\d{1,2}\b/i,
  /\bt\d{1,2}\s*e\d{1,3}\b/i,
];

const MOVIE_YEAR_PATTERN = /\b(19|20)\d{2}\b/;

function normalizeText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function includesAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => value.includes(normalizeText(term)));
}

export function getChannelDisplayGroup(channel: IptvChannel) {
  const groupTitle = channel.groupTitle?.trim();

  if (!groupTitle) {
    return 'Sem grupo';
  }

  return groupTitle.replace(/^canais\s*\|\s*/i, '').trim() || groupTitle;
}

export function classifyChannelContent(channel: IptvChannel): ChannelContentKind {
  const normalizedGroup = normalizeText(channel.groupTitle);
  const normalizedName = normalizeText(channel.name);
  const combinedText = `${normalizedGroup} ${normalizedName}`.trim();

  if (!combinedText) {
    return 'unknown';
  }

  if (includesAnyTerm(normalizedGroup, SERIES_GROUP_TERMS)) {
    return 'series';
  }

  if (SERIES_NAME_PATTERNS.some((pattern) => pattern.test(channel.name))) {
    return 'series';
  }

  if (includesAnyTerm(normalizedGroup, MOVIE_GROUP_TERMS)) {
    return 'movie';
  }

  if (
    MOVIE_YEAR_PATTERN.test(channel.name) &&
    !includesAnyTerm(normalizedGroup, LIVE_GROUP_TERMS)
  ) {
    return 'movie';
  }

  if (includesAnyTerm(normalizedGroup, LIVE_GROUP_TERMS)) {
    return 'live';
  }

  return 'unknown';
}

export function isLiveChannel(channel: IptvChannel) {
  const kind = classifyChannelContent(channel);

  return kind === 'live' || kind === 'unknown';
}

export function isVodChannel(channel: IptvChannel) {
  const kind = classifyChannelContent(channel);

  return kind === 'movie' || kind === 'series';
}
