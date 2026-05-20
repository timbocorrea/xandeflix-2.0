import { isVodChannel } from '@/features/playlists/lib/channelClassification';
import { listAuthorizedLicenseChannels } from '@/features/playlists/services/authorizedLicenseChannels.service';
import type { IptvChannel } from '@/features/playlists/types/playlist';

export type HomeVodKind = 'movie' | 'series' | 'unknown';

export type HomeVodItem = {
  id: string;
  title: string;
  subtitle?: string;
  overview?: string;
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
  launchesLimit?: number;
};

export type LoadHomeVodCategoryInput = {
  licenseCode: string;
  deviceIdentifier: string;
  groupTitles: string[];
  limit?: number;
};

const DEFAULT_LIMIT_PER_SECTION = 20;
const DEFAULT_CATEGORY_ITEMS_LIMIT = 800;
const HOME_VOD_CACHE_TTL_MS = 5 * 60 * 1000;
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

type HomeVodCacheEntry = {
  createdAt: number;
  sections: HomeVodSection[];
};

const homeVodSectionsCache = new Map<string, HomeVodCacheEntry>();

function cloneHomeVodSections(sections: HomeVodSection[]) {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item })),
  }));
}

function createHomeVodCacheKey({
  licenseCode,
  deviceIdentifier,
  limitPerSection = DEFAULT_LIMIT_PER_SECTION,
  launchesLimit = 20,
}: LoadHomeVodInput) {
  return [
    licenseCode,
    deviceIdentifier,
    limitPerSection,
    launchesLimit,
  ].join('::');
}

export function getCachedHomeVodSections(input: LoadHomeVodInput) {
  const cacheKey = createHomeVodCacheKey(input);
  const cachedEntry = homeVodSectionsCache.get(cacheKey);

  if (!cachedEntry) {
    return null;
  }

  if (Date.now() - cachedEntry.createdAt >= HOME_VOD_CACHE_TTL_MS) {
    homeVodSectionsCache.delete(cacheKey);
    return null;
  }

  return cloneHomeVodSections(cachedEntry.sections);
}

function createTmdbImageUrl(
  path: string | null | undefined,
  size: 'w342' | 'w780' | 'original',
) {
  if (!path) {
    return undefined;
  }

  if (path.startsWith('http')) {
    return path;
  }

  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

function inferVodKind(channel: IptvChannel): HomeVodKind {
  const groupTitle = channel.groupTitle?.toLowerCase() ?? '';
  const name = channel.name.toLowerCase();

  if (
    channel.contentKind === 'series' ||
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
    channel.contentKind === 'movie' ||
    groupTitle.includes('filme') ||
    groupTitle.includes('movie') ||
    groupTitle.includes('cinema') ||
    groupTitle.includes('vod')
  ) {
    return 'movie';
  }

  return 'unknown';
}

function normalizeCatalogText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isLaunchGroup(item: Pick<HomeVodItem, 'groupTitle'>) {
  const groupTitle = normalizeCatalogText(item.groupTitle);

  return (
    groupTitle.includes('lancamento') ||
    groupTitle.includes('lancamentos')
  );
}

function matchesAnyGroupTitle(
  item: Pick<HomeVodItem, 'groupTitle'>,
  groupTitles: string[],
) {
  const itemGroupTitle = normalizeCatalogText(item.groupTitle);

  return Boolean(
    itemGroupTitle &&
      groupTitles.some(
        (groupTitle) => normalizeCatalogText(groupTitle) === itemGroupTitle,
      ),
  );
}

function sortMostRecentHomeItems(current: HomeVodItem, next: HomeVodItem) {
  const currentYear = Number(
    current.subtitle?.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0,
  );
  const nextYear = Number(
    next.subtitle?.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0,
  );

  if (currentYear !== nextYear) {
    return nextYear - currentYear;
  }

  return current.title.localeCompare(next.title, 'pt-BR', {
    sensitivity: 'base',
  });
}

function createSubtitle(channel: IptvChannel) {
  const metadata = [
    channel.tmdbReleaseYear ? String(channel.tmdbReleaseYear) : null,
    channel.tmdbRating ? `Nota ${channel.tmdbRating.toFixed(1)}` : null,
  ].filter(Boolean);

  return metadata.length > 0 ? metadata.join(' • ') : channel.groupTitle;
}

function hasRenderableTmdbPoster(channel: IptvChannel) {
  return Boolean(
    channel.tmdbMatchStatus === 'matched' &&
      channel.tmdbPosterPath &&
      channel.tmdbTitle
  );
}

function mapChannelToHomeVodItem(channel: IptvChannel): HomeVodItem {
  const kind = inferVodKind(channel);

  return {
    id: channel.id,
    title: channel.tmdbTitle ?? channel.name,
    subtitle: createSubtitle(channel),
    overview: channel.tmdbOverview ?? undefined,
    posterUrl: createTmdbImageUrl(channel.tmdbPosterPath, 'w342'),
    backdropUrl: createTmdbImageUrl(channel.tmdbBackdropPath, 'w780'),
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
  launchesLimit = 20,
}: LoadHomeVodInput): Promise<HomeVodSection[]> {
  const cachedSections = getCachedHomeVodSections({
    licenseCode,
    deviceIdentifier,
    limitPerSection,
    launchesLimit,
  });

  if (cachedSections) {
    return cachedSections;
  }

  const cacheKey = createHomeVodCacheKey({
    licenseCode,
    deviceIdentifier,
    limitPerSection,
    launchesLimit,
  });

  const channels = await listAuthorizedLicenseChannels({
    licenseCode,
    deviceIdentifier,
    requireTmdbMatched: true,
    requireTmdbPoster: true,
  });

  const vodItems = channels
    .filter(isVodChannel)
    .filter(hasRenderableTmdbPoster)
    .map(mapChannelToHomeVodItem);

  const movieItems = vodItems.filter((item) => item.kind === 'movie');
  const launchItems = movieItems
    .filter(isLaunchGroup)
    .sort(sortMostRecentHomeItems);
  const regularMovieItems = movieItems.filter((item) => !isLaunchGroup(item));
  const seriesItems = vodItems.filter((item) => item.kind === 'series');
  const unknownVodItems = vodItems.filter((item) => item.kind === 'unknown');

  const movieSections: HomeVodSection[] = [];

  for (let index = 0; index < regularMovieItems.length; index += limitPerSection) {
    const railIndex = Math.floor(index / limitPerSection);
    const section = createSection({
      id:
        railIndex === 0
          ? 'home-vod-movies'
          : `home-vod-movies-${railIndex + 1}`,
      title:
        railIndex === 0
          ? 'Filmes da sua lista'
          : `Filmes da sua lista ${railIndex + 1}`,
      eyebrow: '',
      description: 'Conteúdos de filme liberados para esta licença.',
      items: regularMovieItems.slice(index, index + limitPerSection),
      limit: limitPerSection,
    });

    if (section) {
      movieSections.push(section);
    }
  }  const sections = [
    createSection({
      id: 'home-vod-launches',
      title: 'Lançamentos',
      eyebrow: '',
      description: 'Os 20 conteúdos mais atuais da categoria Lançamentos.',
      items: launchItems,
      limit: launchesLimit,
    }),
    ...movieSections,
    createSection({
      id: 'home-vod-series',
      title: 'Séries da sua lista',
      eyebrow: '',
      description: 'Séries liberadas para esta licença.',
      items: seriesItems,
      limit: limitPerSection,
    }),
    createSection({
      id: 'home-vod-other',
      title: 'Outros conteúdos VOD',
      eyebrow: '',
      description: 'Conteúdos sob demanda ainda sem categoria final.',
      items: unknownVodItems,
      limit: limitPerSection,
    }),
  ].filter((section): section is HomeVodSection => Boolean(section));

  homeVodSectionsCache.set(cacheKey, {
    createdAt: Date.now(),
    sections: cloneHomeVodSections(sections),
  });

  return sections;
}

export async function loadHomeVodCategoryItems({
  licenseCode,
  deviceIdentifier,
  groupTitles,
  limit = DEFAULT_CATEGORY_ITEMS_LIMIT,
}: LoadHomeVodCategoryInput): Promise<HomeVodItem[]> {
  const normalizedGroupTitles = groupTitles.filter((groupTitle) =>
    Boolean(normalizeCatalogText(groupTitle)),
  );

  if (normalizedGroupTitles.length === 0) {
    return [];
  }

  const channels = await listAuthorizedLicenseChannels({
    licenseCode,
    deviceIdentifier,
    pageSize: 500,
    maxPages: 20,
    requireTmdbMatched: true,
    requireTmdbPoster: true,
  });

  const items = channels
    .filter(isVodChannel)
    .filter(hasRenderableTmdbPoster)
    .map(mapChannelToHomeVodItem)
    .filter((item) => matchesAnyGroupTitle(item, normalizedGroupTitles));

  const shouldSortMostRecent = normalizedGroupTitles.some((groupTitle) =>
    normalizeCatalogText(groupTitle).includes('lancamento'),
  );
  const orderedItems = shouldSortMostRecent
    ? [...items].sort(sortMostRecentHomeItems)
    : items;

  return orderedItems.slice(0, limit);
}
