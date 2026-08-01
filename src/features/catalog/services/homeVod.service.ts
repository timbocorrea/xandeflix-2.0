import {
  loadLocalCatalogHomeVodCategoryItems,
  loadLocalCatalogHomeVodSections,
} from '@/features/localCatalog/readModels/localCatalogHomeVodAdapter.service';
import { getCatalogCategoryDefinition } from './catalogCategoryGroups.service';
import type { LocalCatalogArtworkCandidate } from '@/features/localCatalog/services/localCatalogArtwork.service';
import {
  dedupeLocalCatalogGroupTitles,
  normalizeLocalCatalogGroupIdentity,
} from '@/features/localCatalog/services/localCatalogGroupIdentity.service';
import { updateAppBootstrapHomeSections } from '@/features/bootstrap/services/appBootstrap.service';
import type {
  MetadataProviderId,
  SeriesMetadataField,
} from './seriesMetadata.types';

export type HomeVodKind = 'movie' | 'series' | 'unknown';

export type HomeVodItem = {
  id: string;
  title: string;
  episodeTitle?: string;
  subtitle?: string;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  artworkCandidates?: LocalCatalogArtworkCandidate[];
  streamUrl?: string;
  groupTitle?: string;
  tmdbId?: string;
  tmdbTitle?: string;
  tmdbGenres?: string;
  tmdbRating?: string;
  tmdbReleaseYear?: string;
  metadataProvider?: MetadataProviderId;
  metadataProviderId?: string;
  metadataProvenance?: Partial<
    Record<SeriesMetadataField, MetadataProviderId>
  >;
  metadataSourceUrls?: Partial<Record<MetadataProviderId, string>>;
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
  sourceId?: string;
  scopeKey?: string;
  sourceType?: 'm3u' | 'xtream' | 'manual' | 'unknown';
  limitPerSection?: number;
  launchesLimit?: number;
  preferFresh?: boolean;
};

export type LoadHomeVodCategoryInput = {
  licenseCode: string;
  deviceIdentifier: string;
  sourceId?: string;
  scopeKey?: string;
  groupTitles: string[];
  limit?: number;
  slug?: string;
};

const DEFAULT_LIMIT_PER_SECTION = 20;
const DEFAULT_CATEGORY_ITEMS_LIMIT = 800;
const HOME_VOD_CACHE_STORAGE_PREFIX = 'xandeflix:home-vod-sections:v11:';
const HOME_VOD_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const HOME_MOVIE_GROUP_TITLES =
  getCatalogCategoryDefinition('filmes')?.groupTitles ?? [];
const HOME_SERIES_GROUP_TITLES =
  getCatalogCategoryDefinition('series')?.groupTitles ?? [];

type HomeVodCacheEntry = {
  createdAt: number;
  sections: HomeVodSection[];
};

type HomeVodCategoryCacheEntry = {
  createdAt: number;
  items: HomeVodItem[];
};

const homeVodSectionsCache = new Map<string, HomeVodCacheEntry>();
const homeVodCategoryItemsCache = new Map<string, HomeVodCategoryCacheEntry>();

function normalizeCacheLicenseCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeCacheDeviceIdentifier(value: string) {
  return value.trim();
}

function normalizeCatalogText(value?: string | null) {
  return normalizeLocalCatalogGroupIdentity(value);
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
  sourceId,
  scopeKey,
  limitPerSection = DEFAULT_LIMIT_PER_SECTION,
  launchesLimit = 20,
}: LoadHomeVodInput) {
  return [
    normalizeCacheLicenseCode(licenseCode),
    normalizeCacheDeviceIdentifier(deviceIdentifier),
    sourceId?.trim() ?? '',
    scopeKey?.trim() ?? '',
    limitPerSection,
    launchesLimit,
  ].join('::');
}

function createHomeVodCategoryCacheKey({
  licenseCode,
  deviceIdentifier,
  sourceId,
  scopeKey,
  groupTitles,
  limit = DEFAULT_CATEGORY_ITEMS_LIMIT,
  slug,
}: LoadHomeVodCategoryInput) {
  return [
    normalizeCacheLicenseCode(licenseCode),
    normalizeCacheDeviceIdentifier(deviceIdentifier),
    sourceId?.trim() ?? '',
    scopeKey?.trim() ?? '',
    limit,
    slug ?? '',
    ...dedupeLocalCatalogGroupTitles(groupTitles).map(normalizeCatalogText).sort(),
  ].join('::');
}

function readStoredHomeVodSections(input: LoadHomeVodInput) {
  if (typeof window === 'undefined') {
    return null;
  }

  const cacheKey = createHomeVodCacheKey(input);
  const storageKey = `${HOME_VOD_CACHE_STORAGE_PREFIX}${cacheKey}`;

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return null;
    }

    const entry = JSON.parse(rawValue) as HomeVodCacheEntry;

    if (
      !entry?.createdAt ||
      !Array.isArray(entry.sections) ||
      Date.now() - entry.createdAt >= HOME_VOD_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return {
      createdAt: entry.createdAt,
      sections: cloneHomeVodSections(entry.sections),
    };
  } catch {
    window.localStorage.removeItem(storageKey);
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

  try {
    window.localStorage.setItem(
      `${HOME_VOD_CACHE_STORAGE_PREFIX}${createHomeVodCacheKey(input)}`,
      JSON.stringify({
        createdAt: Date.now(),
        sections: cloneHomeVodSections(sections),
      } satisfies HomeVodCacheEntry),
    );
  } catch {
    // Cache local é apenas uma otimização do endpoint.
  }
}

export function clearHomeVodCache(): void {
  homeVodSectionsCache.clear();
  homeVodCategoryItemsCache.clear();

  if (typeof window === 'undefined') {
    return;
  }

  try {
    const storageKeysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);

      if (storageKey?.startsWith(HOME_VOD_CACHE_STORAGE_PREFIX)) {
        storageKeysToRemove.push(storageKey);
      }
    }

    for (const storageKey of storageKeysToRemove) {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Limpeza best-effort do cache privado do endpoint.
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

  homeVodSectionsCache.set(cacheKey, storedEntry);
  return cloneHomeVodSections(storedEntry.sections);
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

export async function loadHomeVodSections(
  input: LoadHomeVodInput,
  localSectionsLoader: typeof loadLocalCatalogHomeVodSections =
    loadLocalCatalogHomeVodSections,
): Promise<HomeVodSection[]> {
  const {
    sourceId,
    limitPerSection = DEFAULT_LIMIT_PER_SECTION,
    preferFresh = false,
  } = input;

  if (!preferFresh) {
    const cachedSections = getCachedHomeVodSections(input);

    if (cachedSections) {
      return cachedSections;
    }
  }

  if (!sourceId?.trim()) {
    return [];
  }

  try {
    const sections = await localSectionsLoader({
      sourceId,
      scopeKey: input.scopeKey,
      maxSections: Math.max(
        8,
        dedupeLocalCatalogGroupTitles(HOME_MOVIE_GROUP_TITLES).length +
          dedupeLocalCatalogGroupTitles(HOME_SERIES_GROUP_TITLES).length,
      ),
      itemsPerSection: limitPerSection,
      movieGroupTitles: HOME_MOVIE_GROUP_TITLES,
      seriesGroupTitles: HOME_SERIES_GROUP_TITLES,
    });

    if (sections.length > 0) {
      const cacheKey = createHomeVodCacheKey(input);
      homeVodSectionsCache.set(cacheKey, {
        createdAt: Date.now(),
        sections: cloneHomeVodSections(sections),
      });
      writeStoredHomeVodSections(input, sections);
      if (sourceId?.trim()) {
        updateAppBootstrapHomeSections(sourceId, sections);
      }
    }

    return sections;
  } catch (error) {
    console.warn('[XANDEFLIX_HOME_LOCAL_CATALOG_READ_FAILED]', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return [];
  }
}

function resolveCategoryContentKinds(
  groupTitles: string[],
  slug?: string,
): Array<'movie' | 'series'> {
  if (slug?.startsWith('series')) {
    return ['series'];
  }

  if (slug?.startsWith('filmes') || slug === 'filmes') {
    return ['movie'];
  }

  const normalizedGroupTitles = groupTitles.map(normalizeCatalogText);
  const hasSeries = normalizedGroupTitles.some((title) =>
    title.includes('serie'),
  );
  const hasMovies = normalizedGroupTitles.some(
    (title) => title.includes('filme') || title.includes('lancamento'),
  );

  if (hasSeries && !hasMovies) {
    return ['series'];
  }

  if (hasMovies && !hasSeries) {
    return ['movie'];
  }

  return ['movie', 'series'];
}

export async function loadHomeVodCategoryItems(
  input: LoadHomeVodCategoryInput,
): Promise<HomeVodItem[]> {
  const {
    sourceId,
    groupTitles,
    limit = DEFAULT_CATEGORY_ITEMS_LIMIT,
    slug,
  } = input;
  const normalizedGroupTitles = dedupeLocalCatalogGroupTitles(groupTitles);

  if (!sourceId?.trim() || normalizedGroupTitles.length === 0) {
    return [];
  }

  const cachedItems = getCachedHomeVodCategoryItems(input);

  if (cachedItems) {
    return cachedItems;
  }

  try {
    const items = await loadLocalCatalogHomeVodCategoryItems({
      sourceId,
      scopeKey: input.scopeKey,
      groupTitles: normalizedGroupTitles,
      contentKinds: resolveCategoryContentKinds(normalizedGroupTitles, slug),
      limit,
    });

    homeVodCategoryItemsCache.set(createHomeVodCategoryCacheKey(input), {
      createdAt: Date.now(),
      items: cloneHomeVodItems(items),
    });

    return items;
  } catch (error) {
    console.warn('[XANDEFLIX_CATEGORY_LOCAL_CATALOG_READ_FAILED]', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return [];
  }
}
