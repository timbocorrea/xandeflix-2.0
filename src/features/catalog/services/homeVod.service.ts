import { isVodChannel } from '@/features/playlists/lib/channelClassification';
import { listAuthorizedLicenseChannels } from '@/features/playlists/services/authorizedLicenseChannels.service';
import type { IptvChannel } from '@/features/playlists/types/playlist';

export type HomeVodKind = 'movie' | 'series' | 'unknown';

export type HomeVodItem = {
  id: string;
  title: string;
  subtitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  streamUrl: string;
  groupTitle?: string;
  kind: HomeVodKind;
};

export type HomeVodSection = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  items: HomeVodItem[];
};

export type LoadHomeVodInput = {
  licenseCode: string;
  deviceIdentifier: string;
  limitPerSection?: number;
};

const DEFAULT_LIMIT_PER_SECTION = 20;

function inferVodKind(channel: IptvChannel): HomeVodKind {
  const groupTitle = channel.groupTitle?.toLowerCase() ?? '';
  const name = channel.name.toLowerCase();

  if (
    groupTitle.includes('serie') ||
    groupTitle.includes('série') ||
    groupTitle.includes('series') ||
    groupTitle.includes('séries') ||
    /\bs\d{1,2}\s*e\d{1,3}\b/i.test(name) ||
    /\b\d{1,2}x\d{1,3}\b/i.test(name)
  ) {
    return 'series';
  }

  if (
    groupTitle.includes('filme') ||
    groupTitle.includes('movie') ||
    groupTitle.includes('cinema') ||
    groupTitle.includes('vod')
  ) {
    return 'movie';
  }

  return 'unknown';
}

function mapChannelToHomeVodItem(channel: IptvChannel): HomeVodItem {
  const kind = inferVodKind(channel);

  return {
    id: channel.id,
    title: channel.name,
    subtitle: channel.groupTitle,
    streamUrl: channel.url,
    groupTitle: channel.groupTitle,
    kind,
  };
}

function createSection({
  id,
  title,
  eyebrow,
  description,
  items,
  limit,
}: {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  items: HomeVodItem[];
  limit: number;
}): HomeVodSection | null {
  const sectionItems = items.slice(0, limit);

  if (sectionItems.length === 0) {
    return null;
  }

  return {
    id,
    title,
    eyebrow,
    description,
    items: sectionItems,
  };
}

export async function loadHomeVodSections({
  licenseCode,
  deviceIdentifier,
  limitPerSection = DEFAULT_LIMIT_PER_SECTION,
}: LoadHomeVodInput): Promise<HomeVodSection[]> {
  const channels = await listAuthorizedLicenseChannels({
    licenseCode,
    deviceIdentifier,
  });

  const vodItems = channels
    .filter(isVodChannel)
    .map(mapChannelToHomeVodItem);

  const movieItems = vodItems.filter((item) => item.kind === 'movie');
  const seriesItems = vodItems.filter((item) => item.kind === 'series');
  const unknownVodItems = vodItems.filter((item) => item.kind === 'unknown');

  return [
    createSection({
      id: 'home-vod-movies',
      title: 'Filmes da sua lista',
      eyebrow: 'VOD autorizado',
      description: 'Conteúdos de filme liberados para esta licença.',
      items: movieItems,
      limit: limitPerSection,
    }),
    createSection({
      id: 'home-vod-series',
      title: 'Séries da sua lista',
      eyebrow: 'VOD autorizado',
      description: 'Séries liberadas para esta licença.',
      items: seriesItems,
      limit: limitPerSection,
    }),
    createSection({
      id: 'home-vod-other',
      title: 'Outros conteúdos VOD',
      eyebrow: 'VOD autorizado',
      description: 'Conteúdos sob demanda ainda sem categoria final.',
      items: unknownVodItems,
      limit: limitPerSection,
    }),
  ].filter((section): section is HomeVodSection => Boolean(section));
}
