import { isVodChannel } from '@/features/playlists/lib/channelClassification';
import { listAuthorizedLicenseChannels } from '@/features/playlists/services/authorizedLicenseChannels.service';
import type { IptvChannel } from '@/features/playlists/types/playlist';

export type HomeVodKind = 'movie' | 'series' | 'unknown';

export type HomeVodItem = {
  id: string;
  title: string;
  episodeTitle?: string;
  subtitle?: string;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  streamUrl?: string;
  groupTitle?: string;
  tmdbId?: string;
  tmdbTitle?: string;
  tmdbGenres?: string;
  tmdbRating?: string;
  tmdbReleaseYear?: string;
  seriesKey?: string;
  episodeCount?: number;
  isSeriesCollection?: boolean;
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
  preferFresh?: boolean;
};

export type LoadHomeVodCategoryInput = {
  licenseCode: string;
  deviceIdentifier: string;
  groupTitles: string[];
  limit?: number;
};

const DEFAULT_LIMIT_PER_SECTION = 20;
const DEFAULT_CATEGORY_ITEMS_LIMIT = 800;
const HOME_VOD_CACHE_STORAGE_PREFIX = 'xandeflix:home-vod-sections:v10:';
const HOME_VOD_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

type HomeVodCacheEntry = {
  createdAt: number;
  sections: HomeVodSection[];
};

const homeVodSectionsCache = new Map<string, HomeVodCacheEntry>();

type HomeVodCategoryCacheEntry = {
  createdAt: number;
  items: HomeVodItem[];
};

const homeVodCategoryItemsCache = new Map<string, HomeVodCategoryCacheEntry>();

function normalizeCacheLicenseCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeCacheDeviceIdentifier(value: string) {
  return value.trim();
}

function cloneHomeVodSections(sections: HomeVodSection[]) {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item })),
  }));
}

function cloneHomeVodItems(items: HomeVodItem[]) {
  return items.map((item) => ({ ...item }));
}

function createHomeVodCacheKey({
  licenseCode,
  deviceIdentifier,
  limitPerSection = DEFAULT_LIMIT_PER_SECTION,
  launchesLimit = 20,
}: LoadHomeVodInput) {
  return [
    normalizeCacheLicenseCode(licenseCode),
    normalizeCacheDeviceIdentifier(deviceIdentifier),
    limitPerSection,
    launchesLimit,
  ].join('::');
}

function createHomeVodCategoryCacheKey({
  licenseCode,
  deviceIdentifier,
  groupTitles,
  limit = DEFAULT_CATEGORY_ITEMS_LIMIT,
}: LoadHomeVodCategoryInput) {
  return [
    normalizeCacheLicenseCode(licenseCode),
    normalizeCacheDeviceIdentifier(deviceIdentifier),
    limit,
    ...groupTitles.map(normalizeCatalogText).sort(),
  ].join('::');
}

function readStoredHomeVodSections(input: LoadHomeVodInput) {
  if (typeof window === 'undefined') {
    return null;
  }

  const cacheKey = createHomeVodCacheKey(input);

  try {
    const rawValue = window.localStorage.getItem(
      `${HOME_VOD_CACHE_STORAGE_PREFIX}${cacheKey}`,
    );

    if (!rawValue) {
      return null;
    }

    const entry = JSON.parse(rawValue) as HomeVodCacheEntry;

    if (!entry?.createdAt || !Array.isArray(entry.sections)) {
      window.localStorage.removeItem(`${HOME_VOD_CACHE_STORAGE_PREFIX}${cacheKey}`);
      return null;
    }

    if (Date.now() - entry.createdAt >= HOME_VOD_CACHE_TTL_MS) {
      window.localStorage.removeItem(`${HOME_VOD_CACHE_STORAGE_PREFIX}${cacheKey}`);
      return null;
    }

    return {
      cacheKey,
      entry: {
        createdAt: entry.createdAt,
        sections: cloneHomeVodSections(entry.sections),
      },
    };
  } catch {
    window.localStorage.removeItem(`${HOME_VOD_CACHE_STORAGE_PREFIX}${cacheKey}`);
    return null;
  }
}

function writeStoredHomeVodSections(
  input: LoadHomeVodInput,
  sections: HomeVodSection[],
) {
  if (typeof window === 'undefined' || sections.length === 0) {
    return;
  }

  const cacheKey = createHomeVodCacheKey(input);

  try {
    window.localStorage.setItem(
      `${HOME_VOD_CACHE_STORAGE_PREFIX}${cacheKey}`,
      JSON.stringify({
        createdAt: Date.now(),
        sections: cloneHomeVodSections(sections),
      } satisfies HomeVodCacheEntry),
    );
  } catch {
    // Cache persistente é otimização. Falha não deve impedir a Home.
  }
}

export function getCachedHomeVodSections(input: LoadHomeVodInput) {
  const cacheKey = createHomeVodCacheKey(input);
  const cachedEntry = homeVodSectionsCache.get(cacheKey);

  if (cachedEntry) {
    if (Date.now() - cachedEntry.createdAt < HOME_VOD_CACHE_TTL_MS) {
      return cloneHomeVodSections(cachedEntry.sections);
    }

    homeVodSectionsCache.delete(cacheKey);
  }

  const storedEntry = readStoredHomeVodSections(input);

  if (!storedEntry) {
    return null;
  }

  homeVodSectionsCache.set(cacheKey, {
    createdAt: storedEntry.entry.createdAt,
    sections: cloneHomeVodSections(storedEntry.entry.sections),
  });

  return cloneHomeVodSections(storedEntry.entry.sections);
}

export function getCachedHomeVodCategoryItems(input: LoadHomeVodCategoryInput) {
  const cacheKey = createHomeVodCategoryCacheKey(input);
  const cachedEntry = homeVodCategoryItemsCache.get(cacheKey);

  if (!cachedEntry) {
    return null;
  }

  if (Date.now() - cachedEntry.createdAt >= HOME_VOD_CACHE_TTL_MS) {
    homeVodCategoryItemsCache.delete(cacheKey);
    return null;
  }

  return cloneHomeVodItems(cachedEntry.items);
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

function inferVodKind(channel: IptvChannel): HomeVodItem['kind'] {
  const groupTitle = normalizeCatalogText(channel.groupTitle);

  if (
    /^series\s*\|/.test(groupTitle) ||
    groupTitle.includes('serie') ||
    groupTitle.includes('series') ||
    groupTitle.includes('seriado') ||
    groupTitle.includes('seriados') ||
    groupTitle.includes('temporada') ||
    groupTitle.includes('novela') ||
    groupTitle.includes('novelas') ||
    groupTitle.includes('dorama') ||
    groupTitle.includes('doramas')
  ) {
    return 'series';
  }

  if (
    /^filmes\s*\|/.test(groupTitle) ||
    groupTitle.includes('filme') ||
    groupTitle.includes('filmes') ||
    groupTitle.includes('cinema') ||
    groupTitle.includes('vod')
  ) {
    return 'movie';
  }

  if (channel.contentKind === 'series') {
    return 'series';
  }

  if (channel.contentKind === 'movie') {
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




function normalizeTrustedTmdbImageUrl(
  value?: string | null,
  size: 'w342' | 'w780' = 'w342',
) {
  const imageUrl = value?.trim();

  if (!imageUrl) {
    return undefined;
  }

  if (imageUrl.startsWith('https://image.tmdb.org/t/p/')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('/')) {
    return createTmdbImageUrl(imageUrl, size);
  }

  if (/^[A-Za-z0-9_-].*\.(jpg|jpeg|png|webp)$/i.test(imageUrl)) {
    return createTmdbImageUrl(`/${imageUrl}`, size);
  }

  return undefined;
}

function pickTrustedTmdbArtworkUrl(
  channel: IptvChannel,
  keys: string[],
  size: 'w342' | 'w780',
) {
  const artwork = channel as IptvChannel &
    Record<string, string | null | undefined>;

  for (const key of keys) {
    const imageUrl = normalizeTrustedTmdbImageUrl(artwork[key], size);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return undefined;
}




function getChannelPosterUrl(channel: IptvChannel) {
  return (
    normalizeTrustedTmdbImageUrl(channel.tmdbPosterPath, 'w342') ??
    pickTrustedTmdbArtworkUrl(
      channel,
      [
        'tmdbPosterUrl',
        'tmdb_poster_url',
        'tmdbPosterPath',
        'tmdb_poster_path',
        'posterUrl',
        'poster_url',
      ],
      'w342',
    )
  );
}

function getChannelBackdropUrl(channel: IptvChannel) {
  return (
    normalizeTrustedTmdbImageUrl(channel.tmdbBackdropPath, 'w780') ??
    normalizeTrustedTmdbImageUrl(channel.tmdbPosterPath, 'w780') ??
    pickTrustedTmdbArtworkUrl(
      channel,
      [
        'tmdbBackdropUrl',
        'tmdb_backdrop_url',
        'tmdbBackdropPath',
        'tmdb_backdrop_path',
        'tmdbPosterUrl',
        'tmdb_poster_url',
        'tmdbPosterPath',
        'tmdb_poster_path',
        'posterUrl',
        'poster_url',
      ],
      'w780',
    )
  );
}

function mapChannelToHomeVodItem(channel: IptvChannel): HomeVodItem {
  const kind = inferVodKind(channel);
  const tmdbMetadata = channel as IptvChannel & {
    tmdbGenres?: string | null;
    tmdb_genres?: string | null;
    tmdbRating?: string | number | null;
    tmdb_rating?: string | number | null;
    tmdbReleaseYear?: string | number | null;
    tmdb_release_year?: string | number | null;
  };

  return {
    id: channel.id,
    kind,
    title: channel.tmdbTitle ?? channel.name,
    episodeTitle: channel.name,
    subtitle: createSubtitle(channel),
    overview: channel.tmdbOverview ?? undefined,
    posterUrl: getChannelPosterUrl(channel),
    backdropUrl: getChannelBackdropUrl(channel),
    streamUrl: channel.url,
    groupTitle: channel.groupTitle ?? undefined,
    tmdbId:
      (channel as IptvChannel & { tmdbId?: string | number | null }).tmdbId ===
        null ||
      (channel as IptvChannel & { tmdbId?: string | number | null }).tmdbId ===
        undefined
        ? undefined
        : String(
            (channel as IptvChannel & { tmdbId?: string | number | null })
              .tmdbId,
          ),
    tmdbTitle: channel.tmdbTitle ?? undefined,
    tmdbGenres: tmdbMetadata.tmdbGenres ?? tmdbMetadata.tmdb_genres ?? undefined,
    tmdbRating:
      tmdbMetadata.tmdbRating === null ||
      tmdbMetadata.tmdbRating === undefined
        ? tmdbMetadata.tmdb_rating === null ||
          tmdbMetadata.tmdb_rating === undefined
          ? undefined
          : String(tmdbMetadata.tmdb_rating)
        : String(tmdbMetadata.tmdbRating),
    tmdbReleaseYear:
      tmdbMetadata.tmdbReleaseYear === null ||
      tmdbMetadata.tmdbReleaseYear === undefined
        ? tmdbMetadata.tmdb_release_year === null ||
          tmdbMetadata.tmdb_release_year === undefined
          ? undefined
          : String(tmdbMetadata.tmdb_release_year)
        : String(tmdbMetadata.tmdbReleaseYear),
  };
}

function isLiveGroupTitleForHome(groupTitle?: string | null) {
  const normalizedGroupTitle = normalizeCatalogText(groupTitle);

  if (!normalizedGroupTitle) {
    return false;
  }

  if (
    normalizedGroupTitle === 'filmes e series' ||
    normalizedGroupTitle === 'filmes e series 24h'
  ) {
    return true;
  }

  return (
    normalizedGroupTitle.startsWith('canais') ||
    normalizedGroupTitle.startsWith('canal') ||
    normalizedGroupTitle.startsWith('tv ') ||
    normalizedGroupTitle.startsWith('tv|') ||
    normalizedGroupTitle.includes('ao vivo')
  );
}

function isVodGroupTitleForHome(groupTitle?: string | null) {
  const normalizedGroupTitle = normalizeCatalogText(groupTitle);

  if (!normalizedGroupTitle || isLiveGroupTitleForHome(groupTitle)) {
    return false;
  }

  return (
    /^filmes\s*\|/.test(normalizedGroupTitle) ||
    /^series\s*\|/.test(normalizedGroupTitle) ||
    normalizedGroupTitle.includes('serie') ||
    normalizedGroupTitle.includes('series') ||
    normalizedGroupTitle.includes('seriado') ||
    normalizedGroupTitle.includes('seriados') ||
    normalizedGroupTitle.includes('temporada') ||
    normalizedGroupTitle.includes('novela') ||
    normalizedGroupTitle.includes('novelas') ||
    normalizedGroupTitle.includes('dorama') ||
    normalizedGroupTitle.includes('doramas') ||
    normalizedGroupTitle.includes('anime') ||
    normalizedGroupTitle.includes('infantil') ||
    normalizedGroupTitle.includes('desenho')
  );
}

function isVodChannelForHome(channel: IptvChannel) {
  if (isLiveGroupTitleForHome(channel.groupTitle)) {
    return false;
  }

  if (channel.contentKind) {
    return channel.contentKind === 'movie' || channel.contentKind === 'series';
  }

  if (isVodGroupTitleForHome(channel.groupTitle)) {
    return isVodChannel(channel);
  }

  return isVodChannel(channel);
}

function normalizeSectionId(value: string) {
  return normalizeCatalogText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sortItemsByTitle(firstItem: HomeVodItem, secondItem: HomeVodItem) {
  const posterScore =
    Number(Boolean(secondItem.posterUrl)) - Number(Boolean(firstItem.posterUrl));

  if (posterScore !== 0) {
    return posterScore;
  }

  return firstItem.title.localeCompare(secondItem.title, 'pt-BR');
}

function cleanSeriesEpisodeTitle(value: string) {
  return value
    .replace(/\s*S\d{1,2}\s*E\d{1,4}.*$/i, '')
    .replace(/\s*\d{1,2}x\d{1,4}.*$/i, '')
    .replace(/\s+Ep(?:is[oó]dio)?\s*\d+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSeriesCollectionKey(item: HomeVodItem) {
  if (item.tmdbId) {
    return `tmdb:${item.tmdbId}`;
  }

  const title = item.tmdbTitle || cleanSeriesEpisodeTitle(item.title);

  return `title:${normalizeCatalogText(item.groupTitle)}:${normalizeCatalogText(title)}`;
}

function createSeriesCollectionItems(items: HomeVodItem[]) {
  const collections = new Map<
    string,
    { representative: HomeVodItem; episodes: HomeVodItem[] }
  >();

  for (const item of items) {

    const key = getSeriesCollectionKey(item);
    const current = collections.get(key);

    if (!current) {
      collections.set(key, {
        representative: item,
        episodes: [item],
      });
      continue;
    }

    current.episodes.push(item);

    if (!current.representative.posterUrl && item.posterUrl) {
      current.representative = item;
    }
  }

  return Array.from(collections.entries())
    .map(([seriesKey, collection]) => {
      const representative = collection.representative;
      const title =
        representative.tmdbTitle ||
        cleanSeriesEpisodeTitle(representative.title) ||
        representative.title;

      return {
        ...representative,
        id: `series-collection-${seriesKey.replace(/[^a-z0-9]+/gi, '-')}`,
        title,
        subtitle:
          collection.episodes.length === 1
            ? '1 episodio'
            : `${collection.episodes.length} episodios`,
        streamUrl: undefined,
        seriesKey,
        episodeCount: collection.episodes.length,
        isSeriesCollection: true,
      };
    })
    .sort(sortItemsByTitle);
}

function createCategorySections({
  items,
  sectionPrefix,
  maxItemsPerSection,
}: {
  items: HomeVodItem[];
  sectionPrefix: string;
  maxItemsPerSection: number;
}) {
  const groupedItems = new Map<string, HomeVodItem[]>();

  for (const item of items) {
    const groupTitle = item.groupTitle?.trim();

    if (!groupTitle) {
      continue;
    }

    const currentItems = groupedItems.get(groupTitle) ?? [];
    currentItems.push(item);
    groupedItems.set(groupTitle, currentItems);
  }

  return Array.from(groupedItems.entries())
    .sort(([firstTitle], [secondTitle]) =>
      firstTitle.localeCompare(secondTitle, 'pt-BR'),
    )
    .map(([groupTitle, groupItems]) =>
      createSection({
        id: `${sectionPrefix}-${normalizeSectionId(groupTitle)}`,
        title: groupTitle,
        eyebrow: '',
        description: `Conteúdos da categoria ${groupTitle} liberados para esta licença.`,
        items: [...groupItems].sort(sortItemsByTitle),
        limit: maxItemsPerSection,
      }),
    )
    .filter((section): section is HomeVodSection => Boolean(section));
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
  preferFresh = false,
}: LoadHomeVodInput): Promise<HomeVodSection[]> {
  const cacheInput = {
    licenseCode,
    deviceIdentifier,
    limitPerSection,
    launchesLimit,
  };

  if (!preferFresh) {
    const cachedSections = getCachedHomeVodSections(cacheInput);

    if (cachedSections) {
      return cachedSections;
    }
  }

  const cacheKey = createHomeVodCacheKey(cacheInput);

  const channels = await listAuthorizedLicenseChannels({
    licenseCode,
    deviceIdentifier,
    pageSize: 500,
    maxPages: 10,
    requireTmdbMatched: false,
    requireTmdbPoster: false,
    contentKinds: ['movie', 'series'],
  });

  const vodItems = channels
    .filter(isVodChannelForHome)
    .map(mapChannelToHomeVodItem);

  const movieItems = vodItems.filter((item) => item.kind === 'movie');
  const launchItems = movieItems
    .filter(isLaunchGroup)
    .sort(sortMostRecentHomeItems);
  const regularMovieItems = movieItems.filter((item) => !isLaunchGroup(item));
  const seriesItems = vodItems.filter((item) => item.kind === 'series');
  const unknownVodItems = vodItems.filter((item) => item.kind === 'unknown');

  const movieCategorySections = createCategorySections({
    items: regularMovieItems,
    sectionPrefix: 'home-vod-movie-category',
    maxItemsPerSection: limitPerSection,
  });

  const seriesCategorySections = createCategorySections({
    items: createSeriesCollectionItems(seriesItems),
    sectionPrefix: 'home-vod-series-category',
    maxItemsPerSection: limitPerSection,
  });

  const sections = [
    createSection({
      id: 'home-vod-launches',
      title: 'Lançamentos',
      eyebrow: '',
      description: 'Os conteúdos mais atuais da categoria Lançamentos.',
      items: launchItems,
      limit: launchesLimit,
    }),
    ...movieCategorySections,
    ...seriesCategorySections,
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
  writeStoredHomeVodSections(cacheInput, sections);

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

  const cachedItems = getCachedHomeVodCategoryItems({
    licenseCode,
    deviceIdentifier,
    groupTitles: normalizedGroupTitles,
    limit,
  });

  if (cachedItems) {
    return cachedItems;
  }

  // Determinar contentKinds apropriados com base nos groupTitles da categoria
  let categoryContentKinds: Array<'movie' | 'series'> = ['movie', 'series'];
  const hasMovieKeywords = normalizedGroupTitles.some((title) => {
    const norm = normalizeCatalogText(title);
    return norm.includes('filme') || norm.includes('lancamento');
  });
  const hasSeriesKeywords = normalizedGroupTitles.some((title) => {
    const norm = normalizeCatalogText(title);
    return norm.includes('serie');
  });

  if (hasMovieKeywords && !hasSeriesKeywords) {
    categoryContentKinds = ['movie'];
  } else if (hasSeriesKeywords && !hasMovieKeywords) {
    categoryContentKinds = ['series'];
  }

  const channels = await listAuthorizedLicenseChannels({
    licenseCode,
    deviceIdentifier,
    pageSize: 500,
    maxPages: 10,
    requireTmdbMatched: false,
    requireTmdbPoster: false,
    contentKinds: categoryContentKinds,
  });

  const items = channels
    .filter(isVodChannel)
    .map(mapChannelToHomeVodItem)
    .filter((item) => matchesAnyGroupTitle(item, normalizedGroupTitles));

  const shouldSortMostRecent = normalizedGroupTitles.some((groupTitle) =>
    normalizeCatalogText(groupTitle).includes('lancamento'),
  );
  const orderedItems = shouldSortMostRecent
    ? [...items].sort(sortMostRecentHomeItems)
    : items;
  const limitedItems = orderedItems.slice(0, limit);

  homeVodCategoryItemsCache.set(
    createHomeVodCategoryCacheKey({
      licenseCode,
      deviceIdentifier,
      groupTitles: normalizedGroupTitles,
      limit,
    }),
    {
      createdAt: Date.now(),
      items: cloneHomeVodItems(limitedItems),
    },
  );

  return limitedItems;
}
