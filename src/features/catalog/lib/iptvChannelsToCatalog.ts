import type { IptvChannel } from '@/features/playlists/types/playlist';
import type { CatalogItem, CatalogMediaType, CatalogSection } from '../types';

const MAX_SECTIONS = 4;
const MAX_ITEMS_PER_SECTION = 12;

function normalizeText(value?: string) {
  return value
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function safeId(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function cleanTitle(name: string) {
  return name
    .replace(
      /\b(fhd|hd|sd|4k|uhd|h265|hevc|dual audio|dublado|legendado)\b/gi,
      '',
    )
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\([^\)]*\b(19|20)\d{2}\b[^\)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[-|:]+$/g, '')
    .trim();
}

function extractYear(value: string) {
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match?.[0];
}

function inferMediaType(channel: IptvChannel): CatalogMediaType {
  const text = normalizeText(`${channel.groupTitle ?? ''} ${channel.name}`) ?? '';

  if (
    text.includes('serie') ||
    text.includes('series') ||
    text.includes('temporada') ||
    /\bs\d{1,2}\s*e\d{1,2}\b/i.test(channel.name)
  ) {
    return 'series';
  }

  return 'movie';
}

function isLiveOrChannelGroup(groupTitle?: string) {
  const group = normalizeText(groupTitle) ?? '';

  if (!group) {
    return false;
  }

  return (
    group.includes('canal') ||
    group.includes('canais') ||
    group.includes('ao vivo') ||
    group.includes('live') ||
    group.includes('tv ') ||
    group.endsWith(' tv') ||
    group.includes('news') ||
    group.includes('noticia') ||
    group.includes('jornal') ||
    group.includes('esporte') ||
    group.includes('sport') ||
    group.includes('radio')
  );
}

function isVodGroup(groupTitle?: string) {
  const group = normalizeText(groupTitle) ?? '';

  if (!group || isLiveOrChannelGroup(groupTitle)) {
    return false;
  }

  return (
    group.includes('filme') ||
    group.includes('filmes') ||
    group.includes('movie') ||
    group.includes('movies') ||
    group.includes('cinema') ||
    group.includes('vod') ||
    group.includes('serie') ||
    group.includes('series') ||
    group.includes('temporada')
  );
}

function isVodChannel(channel: IptvChannel) {
  if (isLiveOrChannelGroup(channel.groupTitle)) {
    return false;
  }

  if (isVodGroup(channel.groupTitle)) {
    return true;
  }

  const normalizedName = normalizeText(channel.name) ?? '';

  return (
    normalizedName.includes('filme') ||
    normalizedName.includes('movie') ||
    normalizedName.includes('serie') ||
    normalizedName.includes('season') ||
    /\b(19|20)\d{2}\b/.test(channel.name)
  );
}

function getSectionIntent(groupTitle?: string) {
  const normalized = normalizeText(groupTitle) ?? '';

  if (
    normalized.includes('serie') ||
    normalized.includes('series') ||
    normalized.includes('temporada')
  ) {
    return {
      eyebrow: 'Series da sua lista',
      title: groupTitle || 'Series',
      description: 'Series encontradas na lista IPTV autorizada para esta licenca.',
    };
  }

  return {
    eyebrow: 'Filmes da sua lista',
    title: groupTitle || 'Filmes da sua lista',
    description: 'Filmes encontrados na lista IPTV autorizada para esta licenca.',
  };
}

function getGenreFromGroup(groupTitle?: string) {
  if (!groupTitle?.trim()) {
    return undefined;
  }

  return groupTitle
    .replace(/\b(filmes?|series?|canais?|ao vivo|live|vod)\b/gi, '')
    .replace(/[-|:]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getTmdbImageUrl(value?: string) {
  if (!value?.trim()) {
    return undefined;
  }

  return value.includes('image.tmdb.org') ? value : undefined;
}

function mapChannelToCatalogItem(channel: IptvChannel, index: number): CatalogItem {
  const mediaType = inferMediaType(channel);
  const resolvedTitle = cleanTitle(channel.tvgName || channel.name) || channel.name;
  const year = extractYear(channel.name);
  const genre = getGenreFromGroup(channel.groupTitle);
  const tmdbLogo = getTmdbImageUrl(channel.logo);

  return {
    id: channel.id || `iptv-channel-${index}`,
    title: resolvedTitle,
    subtitle:
      mediaType === 'series'
        ? 'Serie da lista autorizada'
        : 'Filme da lista autorizada',
    streamUrl: channel.url,
    logoUrl: channel.logo ?? null,
    groupTitle: channel.groupTitle ?? null,
    posterUrl: tmdbLogo,
    thumbnailUrl: tmdbLogo,
    imageUrl: tmdbLogo,
    year,
    genres: genre ? [genre] : undefined,
    overview: `${resolvedTitle} encontrado na lista IPTV autorizada. Buscando capa e metadados no TMDB.`,
    mediaType,
  };
}

function getSectionPriority(section: CatalogSection) {
  const text = normalizeText(`${section.eyebrow} ${section.title}`) ?? '';

  if (text.includes('filme') || text.includes('movie') || text.includes('cinema')) {
    return 1;
  }

  if (text.includes('serie') || text.includes('series')) {
    return 2;
  }

  return 3;
}

function selectCatalogChannels(channels: IptvChannel[]) {
  return channels.filter((channel) => channel.url?.trim() && isVodChannel(channel));
}

export function buildCatalogSectionsFromIptvChannels(
  channels: IptvChannel[],
): CatalogSection[] {
  const catalogChannels = selectCatalogChannels(channels);

  if (catalogChannels.length === 0) {
    return [];
  }

  const grouped = new Map<string, IptvChannel[]>();

  catalogChannels.forEach((channel) => {
    const groupKey = channel.groupTitle?.trim() || 'Filmes da sua lista';
    const previous = grouped.get(groupKey) ?? [];

    if (previous.length < MAX_ITEMS_PER_SECTION) {
      previous.push(channel);
      grouped.set(groupKey, previous);
    }
  });

  return Array.from(grouped.entries())
    .map(([groupTitle, groupChannels], sectionIndex): CatalogSection => {
      const intent = getSectionIntent(groupTitle);

      return {
        id: `iptv-${safeId(groupTitle) || sectionIndex}`,
        eyebrow: intent.eyebrow,
        title: intent.title,
        description: intent.description,
        items: groupChannels.map(mapChannelToCatalogItem),
      };
    })
    .sort((current, next) => {
      const priorityDiff = getSectionPriority(current) - getSectionPriority(next);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return current.title.localeCompare(next.title, 'pt-BR', {
        sensitivity: 'base',
      });
    })
    .slice(0, MAX_SECTIONS);
}
