import {
  clearStoredLicenseActivation,
  getStoredLicenseActivation,
} from '@/features/licensing/lib/licenseActivationStorage';
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';
import type {
  IptvChannel,
  PlaylistRuntimeAuthorizationContext,
  PlaylistRuntimeStatus,
  PlaylistSource,
} from '@/features/playlists/types/playlist';
import {
  clearHomeVodCache,
  loadHomeVodCategoryItems,
  loadHomeVodSections,
  type HomeVodItem,
  type HomeVodSection,
} from '@/features/catalog/services/homeVod.service';
import { getCachedSeriesHeroBackdropUrls } from '@/features/catalog/services/seriesHeroTmdb.service';
import { storeCachedSeriesEpisodes } from '@/features/catalog/services/seriesEpisodesCache.service';
import { loadLocalCatalogHomeVodSections } from '@/features/localCatalog/readModels/localCatalogHomeVodAdapter.service';
import { getCatalogCategoryDefinition } from '@/features/catalog/services/catalogCategoryGroups.service';
import { prepareHomePlaylist } from '@/features/catalog/services/prepareHomePlaylist.service';
import { clearValidatedLicenseSessionCache } from '@/features/licensing/services/licenseSessionValidation.service';
import { clearDiscoveryRuntimePresentationState } from '@/features/catalog/services/discoveryRuntimePresentationStore.service';
import { localCatalogRepository } from '@/features/localCatalog/repositories/localCatalogRepository.service';
import { isLocalCatalogReadable } from '@/features/localCatalog/services/localCatalogReadability.service';

import { runLocalCatalogSourceBindingMigration } from '@/features/localCatalog/services/localCatalogSourceBindingMigration.service';
import {
  createBoundedDiscoveryGenerationKey,
  isDiscoveryArtworkReady,
  resolveLocalCatalogDiscoverySnapshot,
} from '@/features/catalog/services/localCatalogDiscoverySnapshot.service';
import { resolveHomeHeroArtworkUrl } from '@/features/catalog/services/heroArtworkPolicy.service';
import {
  markDiscoveryPerformance,
  preloadCriticalHeroArtwork,
} from '@/features/catalog/services/discoveryPerformance.service';

import { notifyClientRuntimeAccessRevoked } from './clientRuntimeAccessEvents.service';

export type AppBootstrapStepId =
  | 'license'
  | 'playlist'
  | 'home'
  | 'live'
  | 'movies'
  | 'series'
  | 'images'
  | 'done';

export type AppBootstrapProgress = {
  stepId: AppBootstrapStepId;
  label: string;
  completedSteps: number;
  totalSteps: number;
  warning?: string;
};

export type AppBootstrapRuntimeInput = {
  currentChannelsCount: number;
  currentStatus: PlaylistRuntimeStatus;
  currentSourceId?: string;
  loadFromSource: (
    source: PlaylistSource,
    authorizationContext?: PlaylistRuntimeAuthorizationContext | null,
  ) => Promise<void>;
  loadFromChannels: (input: {
    source: PlaylistSource;
    channels: IptvChannel[];
  }) => void;
  clearRuntime: () => void;
};

export type RunAppBootstrapInput = {
  licenseCode?: string | null;
  deviceIdentifier?: string | null;
  runtime: AppBootstrapRuntimeInput;
  onProgress?: (progress: AppBootstrapProgress) => void;
  criticalOnly?: boolean;
};

export type AppBootstrapResult = {
  licenseCode: string;
  deviceIdentifier: string;
  sourceId: string;
  homeSections: HomeVodSection[];
  livePreviewChannels: IptvChannel[];
  movieItems: HomeVodItem[];
  seriesItems: HomeVodItem[];
  preloadedImages: number;
  failedImages: number;
  warnings: string[];
  seriesEpisodesPrecache?: {
    candidates: number;
    storedSeriesCount: number;
    storedEpisodeCount: number;
  };
};

const APP_BOOTSTRAP_STORAGE_KEY = 'xandeflix:critical-bootstrap:v6';
const BOOTSTRAP_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const HOME_LIMIT_PER_SECTION = 12;
const HOME_LAUNCHES_LIMIT = 20;
const CATEGORY_FIRST_FOLD_LIMIT = 60;
const SERIES_EPISODES_PRECACHE_LIMIT = 500;
const SERIES_COLLECTIONS_PRECACHE_LIMIT = 4;
const IMAGE_PRELOAD_LIMIT = 60;
const IMAGE_PRELOAD_CONCURRENCY = 6;
const IMAGE_PRELOAD_TIMEOUT_MS = 2500;
const HOME_HERO_PRELOAD_ITEM_LIMIT = 5;
const SERIES_HERO_PRELOAD_ITEM_LIMIT = 10;
const SERIES_VISIBLE_CARD_PRELOAD_LIMIT = 15;
const HOME_VISIBLE_CARD_PRELOAD_LIMIT = 15;
const SERIES_LANDING_ITEMS_STORAGE_PREFIX = 'xandeflix:series-landing-items:v2:';
const LIVE_TV_CRITICAL_CACHE_STORAGE_KEY = 'xandeflix:live-tv-critical-cache:v5';
const SERIES_DETAIL_EPISODES_CACHE_PREFIX = 'xandeflix:series-detail-episodes:v1:';
const CATALOG_WARMUP_STORAGE_PREFIX = 'xandeflix.catalogVodWarmup:';
const CATALOG_WARMUP_REFRESH_STORAGE_KEY =
  'xandeflix:catalog-vod-warmup:last-refreshed-at';

type StoredSeriesLandingItemsEntry = {
  createdAt: number;
  items: HomeVodItem[];
};

function createSeriesLandingItemsCacheKey({
  licenseCode,
  deviceIdentifier,
}: {
  licenseCode: string;
  deviceIdentifier: string;
}) {
  return [
    licenseCode.trim().toUpperCase(),
    deviceIdentifier.trim(),
  ].join('::');
}

function cloneSeriesLandingItems(items: HomeVodItem[]) {
  return items.map((item) => {
    const clonedItem = { ...item };
    delete clonedItem.streamUrl;
    return clonedItem;
  });
}

function writeStoredSeriesLandingItemsForInitialOpen({
  licenseCode,
  deviceIdentifier,
  items,
}: {
  licenseCode: string;
  deviceIdentifier: string;
  items: HomeVodItem[];
}) {
  if (typeof window === 'undefined' || items.length === 0) {
    return;
  }

  const storageKey = `${SERIES_LANDING_ITEMS_STORAGE_PREFIX}${createSeriesLandingItemsCacheKey({
    licenseCode,
    deviceIdentifier,
  })}`;

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        createdAt: Date.now(),
        items: cloneSeriesLandingItems(items),
      } satisfies StoredSeriesLandingItemsEntry),
    );
  } catch {
    // Cache local é otimização. Falha não deve impedir a abertura do app.
  }
}

const TOTAL_BOOTSTRAP_STEPS = 7;

type AppBootstrapCacheEntry = {
  createdAt: number;
  result: AppBootstrapResult;
};

let appBootstrapCache: AppBootstrapCacheEntry | null = null;

const CLIENT_RUNTIME_ACCESS_STORAGE_KEYS = [
  APP_BOOTSTRAP_STORAGE_KEY,
  LIVE_TV_CRITICAL_CACHE_STORAGE_KEY,
  CATALOG_WARMUP_REFRESH_STORAGE_KEY,
];

const CLIENT_RUNTIME_ACCESS_STORAGE_PREFIXES = [
  SERIES_LANDING_ITEMS_STORAGE_PREFIX,
  SERIES_DETAIL_EPISODES_CACHE_PREFIX,
  CATALOG_WARMUP_STORAGE_PREFIX,
];

function clearClientRuntimeStorage(storage: Storage) {
  const storageKeysToRemove = new Set(CLIENT_RUNTIME_ACCESS_STORAGE_KEYS);

  for (let index = 0; index < storage.length; index += 1) {
    const storageKey = storage.key(index);

    if (
      storageKey &&
      CLIENT_RUNTIME_ACCESS_STORAGE_PREFIXES.some((prefix) =>
        storageKey.startsWith(prefix),
      )
    ) {
      storageKeysToRemove.add(storageKey);
    }
  }

  for (const storageKey of storageKeysToRemove) {
    storage.removeItem(storageKey);
  }
}

export function clearClientRuntimeAccessState(): void {
  appBootstrapCache = null;
  clearValidatedLicenseSessionCache();
  clearStoredLicenseActivation({ markSignedOut: true });
  clearHomeVodCache();
  clearDiscoveryRuntimePresentationState();

  if (typeof window === 'undefined') {
    return;
  }

  try {
    clearClientRuntimeStorage(window.localStorage);
    clearClientRuntimeStorage(window.sessionStorage);
  } catch {
    // Runtime cache cleanup is best-effort; missing storage already means blocked.
  }

  notifyClientRuntimeAccessRevoked();
}

function normalizeLicenseCode(value?: string | null) {
  return value?.trim().toUpperCase() ?? '';
}

function normalizeDeviceIdentifier(value?: string | null) {
  return value?.trim() ?? '';
}

function cloneBootstrapResult(result: AppBootstrapResult): AppBootstrapResult {
  return {
    ...result,
    homeSections: result.homeSections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item })),
    })),
    livePreviewChannels: result.livePreviewChannels.map((channel) => ({
      ...channel,
    })),
    movieItems: result.movieItems.map((item) => ({ ...item })),
    seriesItems: cloneSeriesLandingItems(result.seriesItems),
    warnings: [...result.warnings],
    seriesEpisodesPrecache: result.seriesEpisodesPrecache
      ? { ...result.seriesEpisodesPrecache }
      : undefined,
  };
}

function createStoredBootstrapResult(result: AppBootstrapResult) {
  return {
    ...cloneBootstrapResult(result),
    // These datasets already have dedicated local caches and do not need to be
    // duplicated inside the bootstrap marker.
    livePreviewChannels: [],
    movieItems: [],
    seriesItems: [],
  };
}

function isBootstrapResultForScope({
  result,
  licenseCode,
  deviceIdentifier,
  sourceId,
}: {
  result: AppBootstrapResult;
  licenseCode: string;
  deviceIdentifier: string;
  sourceId: string;
}) {
  return (
    normalizeLicenseCode(result.licenseCode) === normalizeLicenseCode(licenseCode) &&
    normalizeDeviceIdentifier(result.deviceIdentifier) ===
      normalizeDeviceIdentifier(deviceIdentifier) &&
    result.sourceId?.trim() === sourceId.trim()
  );
}

export function isPopulatedBootstrapResult(
  result: AppBootstrapResult | null | undefined,
): boolean {
  if (!result) {
    return false;
  }

  return result.homeSections.some(
    (section) => section.items && section.items.length > 0,
  );
}


function readStoredBootstrapResult({
  allowExpired = false,
}: {
  allowExpired?: boolean;
} = {}) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(APP_BOOTSTRAP_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as AppBootstrapCacheEntry;

    if (!parsedValue?.result || !parsedValue.createdAt) {
      window.localStorage.removeItem(APP_BOOTSTRAP_STORAGE_KEY);
      return null;
    }

    if (
      !allowExpired &&
      Date.now() - parsedValue.createdAt >= BOOTSTRAP_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(APP_BOOTSTRAP_STORAGE_KEY);
      return null;
    }

    return parsedValue;
  } catch {
    window.localStorage.removeItem(APP_BOOTSTRAP_STORAGE_KEY);
    return null;
  }
}

function writeStoredBootstrapResult(result: AppBootstrapResult) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      APP_BOOTSTRAP_STORAGE_KEY,
      JSON.stringify({
        createdAt: Date.now(),
        result: createStoredBootstrapResult(result),
      }),
    );
  } catch {
    // Cache persistente é otimização. Falha não deve impedir o app de abrir.
  }
}

export function cacheAppBootstrapResultForSession(result: AppBootstrapResult) {
  appBootstrapCache = {
    createdAt: Date.now(),
    result: cloneBootstrapResult(result),
  };
  writeStoredBootstrapResult(result);
}

export function updateAppBootstrapHomeSections(
  sourceId: string,
  sections: HomeVodSection[],
) {
  const currentCache = appBootstrapCache;

  if (
    currentCache &&
    currentCache.result.sourceId.trim() === sourceId.trim() &&
    sections.length > 0
  ) {
    const updatedResult: AppBootstrapResult = {
      ...currentCache.result,
      homeSections: sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({ ...item })),
      })),
    };
    appBootstrapCache = {
      createdAt: Date.now(),
      result: cloneBootstrapResult(updatedResult),
    };
    writeStoredBootstrapResult(updatedResult);
  }
}

export function invalidateAppBootstrapHomeCatalogCache(sourceId: string) {
  const normalizedSourceId = sourceId.trim();

  if (!normalizedSourceId) {
    return;
  }

  if (appBootstrapCache?.result.sourceId.trim() === normalizedSourceId) {
    appBootstrapCache = null;
  }

  if (typeof window === 'undefined') {
    return;
  }

  try {
    const storedCache = readStoredBootstrapResult();

    if (storedCache?.result.sourceId.trim() === normalizedSourceId) {
      window.localStorage.removeItem(APP_BOOTSTRAP_STORAGE_KEY);
    }
  } catch {
    // Invalidação local best-effort; a geração ACTIVE permanece canônica.
  }
}

export function getCachedAppBootstrapResult({
  allowExpired = false,
}: {
  allowExpired?: boolean;
} = {}) {
  const memoryCache = appBootstrapCache;

  if (memoryCache) {
    if (
      allowExpired ||
      Date.now() - memoryCache.createdAt < BOOTSTRAP_CACHE_TTL_MS
    ) {
      return cloneBootstrapResult(memoryCache.result);
    }

    appBootstrapCache = null;
  }

  const storedCache = readStoredBootstrapResult({ allowExpired });

  if (!storedCache) {
    return null;
  }

  appBootstrapCache = {
    createdAt: storedCache.createdAt,
    result: cloneBootstrapResult(storedCache.result),
  };

  return cloneBootstrapResult(storedCache.result);
}

function emitProgress(
  onProgress: RunAppBootstrapInput['onProgress'],
  progress: AppBootstrapProgress,
) {
  onProgress?.(progress);
}

function collectImageUrlsFromHomeSections(sections: HomeVodSection[]) {
  return sections.flatMap((section) =>
    section.items.flatMap((item) => [
      item.backdropUrl,
      item.posterUrl,
    ]),
  );
}

function collectImageUrlsFromItems(items: HomeVodItem[]) {
  return items.flatMap((item) => [item.backdropUrl, item.posterUrl]);
}

function collectHomeHeroImageUrls(sections: HomeVodSection[]) {
  const uniqueItems = new Map<string, HomeVodItem>();

  for (const item of sections.flatMap((section) => section.items)) {
    if (!uniqueItems.has(item.id)) {
      uniqueItems.set(item.id, item);
    }
  }

  return Array.from(uniqueItems.values())
    .sort(
      (left, right) =>
        Number(Boolean(right.backdropUrl)) - Number(Boolean(left.backdropUrl)),
    )
    .slice(0, HOME_HERO_PRELOAD_ITEM_LIMIT)
    .flatMap((item) => [item.backdropUrl, item.posterUrl]);
}

function collectSeriesHeroImageUrls(items: HomeVodItem[]) {
  return [...items]
    .sort(
      (left, right) =>
        Number(Boolean(right.backdropUrl)) - Number(Boolean(left.backdropUrl)),
    )
    .slice(0, SERIES_HERO_PRELOAD_ITEM_LIMIT)
    .flatMap((item) => [item.backdropUrl, item.posterUrl]);
}

function collectPosterImageUrlsFromItems(items: HomeVodItem[], limit: number) {
  return Array.from(
    new Set(
      items
        .map((item) => item.posterUrl?.trim())
        .filter((url): url is string => Boolean(url)),
    ),
  ).slice(0, limit);
}

function collectImageUrlsFromChannels(channels: IptvChannel[]) {
  return channels.map((channel) => channel.logo);
}

function uniqueImageUrls(urls: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      urls
        .map((url) => url?.trim())
        .filter((url): url is string => Boolean(url)),
    ),
  ).slice(0, IMAGE_PRELOAD_LIMIT);
}

function preloadImage(url: string): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const image = new Image();
    let isDone = false;

    const finish = (ok: boolean) => {
      if (isDone) {
        return;
      }

      isDone = true;
      window.clearTimeout(timeout);
      resolve(ok);
    };

    const timeout = window.setTimeout(() => {
      finish(false);
    }, IMAGE_PRELOAD_TIMEOUT_MS);

    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

async function preloadImages(urls: string[]) {
  let preloadedImages = 0;
  let failedImages = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const currentIndex = cursor;
      cursor += 1;

      const didLoad = await preloadImage(urls[currentIndex]);

      if (didLoad) {
        preloadedImages += 1;
      } else {
        failedImages += 1;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(IMAGE_PRELOAD_CONCURRENCY, urls.length) },
    () => worker(),
  );

  await Promise.all(workers);

  return {
    preloadedImages,
    failedImages,
  };
}

async function loadCategoryFirstFold({
  slug,
  licenseCode,
  deviceIdentifier,
  sourceId,
}: {
  slug: string;
  licenseCode: string;
  deviceIdentifier: string;
  sourceId?: string;
}) {
  const category = getCatalogCategoryDefinition(slug);

  if (!category) {
    return [];
  }

  return loadHomeVodCategoryItems({
    licenseCode,
    deviceIdentifier,
    sourceId,
    groupTitles: category.groupTitles,
    limit: CATEGORY_FIRST_FOLD_LIMIT,
    slug,
  });
}

function isSeriesCollectionPrecacheCandidate(item: HomeVodItem) {
  return Boolean(
    item.kind === 'series' &&
      item.isSeriesCollection &&
      item.groupTitle &&
      (item.tmdbId || item.tmdbTitle),
  );
}

function getSeriesPrecacheIdentity(item: HomeVodItem) {
  return item.tmdbId
    ? `tmdb:${item.tmdbId}`
    : `title:${item.groupTitle ?? ''}:${item.tmdbTitle ?? item.title}`;
}

async function precacheSeriesEpisodesFromHomeSections({
  licenseCode,
  deviceIdentifier,
  sourceId,
  homeSections,
}: {
  licenseCode: string;
  deviceIdentifier: string;
  sourceId?: string;
  homeSections: HomeVodSection[];
}) {
  const candidates = homeSections
    .flatMap((section) => section.items)
    .filter(isSeriesCollectionPrecacheCandidate);

  const uniqueCandidates = new Map<string, HomeVodItem>();

  for (const candidate of candidates) {
    const identity = getSeriesPrecacheIdentity(candidate);

    if (!uniqueCandidates.has(identity)) {
      uniqueCandidates.set(identity, candidate);
    }

    if (uniqueCandidates.size >= SERIES_COLLECTIONS_PRECACHE_LIMIT) {
      break;
    }
  }

  let storedSeriesCount = 0;
  let storedEpisodeCount = 0;

  for (const candidate of uniqueCandidates.values()) {
    if (!candidate.groupTitle) {
      continue;
    }

    const episodes = await loadHomeVodCategoryItems({
      licenseCode,
      deviceIdentifier,
      sourceId,
      groupTitles: [candidate.groupTitle],
      limit: SERIES_EPISODES_PRECACHE_LIMIT,
    });

    const filteredEpisodes = episodes.filter((episode) => {
      if (candidate.tmdbId && episode.tmdbId) {
        return String(episode.tmdbId) === String(candidate.tmdbId);
      }

      if (candidate.tmdbTitle && episode.tmdbTitle) {
        return (
          episode.tmdbTitle.trim().toLowerCase() ===
          candidate.tmdbTitle.trim().toLowerCase()
        );
      }

      return false;
    });

    if (filteredEpisodes.length === 0) {
      continue;
    }

    storeCachedSeriesEpisodes(
      {
        licenseCode,
        deviceIdentifier,
        groupTitles: [candidate.groupTitle],
        tmdbId: candidate.tmdbId,
        tmdbTitle: candidate.tmdbTitle ?? candidate.title,
      },
      filteredEpisodes,
    );

    storedSeriesCount += 1;
    storedEpisodeCount += filteredEpisodes.length;
  }

  return {
    candidates: uniqueCandidates.size,
    storedSeriesCount,
    storedEpisodeCount,
  };
}

export async function runAppBootstrap({
  licenseCode,
  deviceIdentifier,
  runtime,
  onProgress,
  criticalOnly = false,
}: RunAppBootstrapInput): Promise<AppBootstrapResult> {
  const storedActivation = getStoredLicenseActivation();
  const normalizedLicenseCode = normalizeLicenseCode(
    licenseCode ?? storedActivation?.licenseCode,
  );
  const normalizedDeviceIdentifier = normalizeDeviceIdentifier(
    deviceIdentifier ??
      storedActivation?.deviceIdentifier ??
      getOrCreateDeviceIdentifier(),
  );
  const warnings: string[] = [];
  let resolvedSourceId = runtime.currentSourceId;
  let resolvedLocalCatalogScopeKey: string | null = null;
  const cachedResultBeforePreparation = getCachedAppBootstrapResult({
    allowExpired: criticalOnly,
  });
  const knownReadableSourceId =
    cachedResultBeforePreparation &&
    normalizeLicenseCode(cachedResultBeforePreparation.licenseCode) ===
      normalizedLicenseCode &&
    normalizeDeviceIdentifier(cachedResultBeforePreparation.deviceIdentifier) ===
      normalizedDeviceIdentifier
      ? cachedResultBeforePreparation.sourceId
      : undefined;

  if (
    normalizedLicenseCode &&
    normalizedDeviceIdentifier &&
    runtime.currentSourceId?.trim() &&
    cachedResultBeforePreparation &&
    isPopulatedBootstrapResult(cachedResultBeforePreparation) &&
    isBootstrapResultForScope({
      result: cachedResultBeforePreparation,
      licenseCode: normalizedLicenseCode,
      deviceIdentifier: normalizedDeviceIdentifier,
      sourceId: runtime.currentSourceId,
    })
  ) {
    emitProgress(onProgress, {
      stepId: 'done',
      label: 'Abrindo dados da sessão...',
      completedSteps: TOTAL_BOOTSTRAP_STEPS,
      totalSteps: TOTAL_BOOTSTRAP_STEPS,
    });

    return cachedResultBeforePreparation;
  }

  if (normalizedLicenseCode && normalizedDeviceIdentifier) {
    try {
      const preparedSource = await prepareHomePlaylist({
        licenseCode: normalizedLicenseCode,
        deviceIdentifier: normalizedDeviceIdentifier,
        currentChannelsCount: runtime.currentChannelsCount,
        currentStatus: runtime.currentStatus,
        currentSourceId: runtime.currentSourceId,
        knownReadableSourceId,
        loadFromSource: runtime.loadFromSource,
        loadFromChannels: runtime.loadFromChannels,
        clearRuntime: runtime.clearRuntime,
      });

      resolvedSourceId = preparedSource.source.sourceId;
      resolvedLocalCatalogScopeKey = preparedSource.localCatalogScopeKey;
      markDiscoveryPerformance('license_valid');

      if (resolvedSourceId) {
        void runLocalCatalogSourceBindingMigration({
          authorizedSourceId: resolvedSourceId,
          licenseCode: normalizedLicenseCode,
          deviceIdentifier: normalizedDeviceIdentifier,
        }).catch(() => undefined);
      }
    } catch (prepareError) {
      console.warn('[XANDEFLIX_LOCAL_CATALOG_BACKGROUND_PREPARE_FAILED]', {
        errorCode: 'LOCAL_CATALOG_BACKGROUND_PREPARE_FAILED',
        errorName:
          prepareError instanceof Error
            ? prepareError.name
            : 'UnknownError',
      });
      throw prepareError;
    }
  }

  const cachedResult = getCachedAppBootstrapResult({
    allowExpired: criticalOnly,
  });

  if (
    cachedResult &&
    isPopulatedBootstrapResult(cachedResult) &&
    resolvedSourceId?.trim() &&
    isBootstrapResultForScope({
      result: cachedResult,
      licenseCode: normalizedLicenseCode,
      deviceIdentifier: normalizedDeviceIdentifier,
      sourceId: resolvedSourceId,
    })
  ) {
    emitProgress(onProgress, {
      stepId: 'done',
      label: 'Abrindo dados já preparados...',
      completedSteps: TOTAL_BOOTSTRAP_STEPS,
      totalSteps: TOTAL_BOOTSTRAP_STEPS,
    });

    return cachedResult;
  }

  if (criticalOnly) {
    if (!resolvedSourceId?.trim()) {
      throw new Error('Não foi possível resolver a fonte autorizada deste aparelho.');
    }

    emitProgress(onProgress, {
      stepId: 'home',
      label: 'Carregando início da Home...',
      completedSteps: 2,
      totalSteps: TOTAL_BOOTSTRAP_STEPS,
    });

    const movieGroupTitles =
      getCatalogCategoryDefinition('filmes')?.groupTitles ?? [];
    const seriesGroupTitles =
      getCatalogCategoryDefinition('series')?.groupTitles ?? [];

    const homeSections = await loadLocalCatalogHomeVodSections({
      sourceId: resolvedSourceId.trim(),
      scopeKey: resolvedLocalCatalogScopeKey ?? undefined,
      maxSections: 4,
      itemsPerSection: 20,
      movieGroupTitles: movieGroupTitles.slice(0, 2),
      seriesGroupTitles: seriesGroupTitles.slice(0, 2),
      skipTmdbMetadata: true,
      allowLegacyFallback: false,
    });
    markDiscoveryPerformance('local_catalog_ready');
    const criticalDiscoveryCandidates = homeSections.flatMap(
      (section) => section.items,
    );
    const criticalGenerationKey = createBoundedDiscoveryGenerationKey({
      sourceId: resolvedSourceId.trim(),
      candidates: criticalDiscoveryCandidates,
    });
    const criticalHeroSnapshot = resolveLocalCatalogDiscoverySnapshot({
      scope: {
        licenseCode: normalizedLicenseCode,
        deviceIdentifier: normalizedDeviceIdentifier,
        sourceId: resolvedSourceId.trim(),
      },
      surfaceKey: 'home',
      sectionKey: 'hero',
      generationKey: criticalGenerationKey,
      candidates: criticalDiscoveryCandidates,
      slotCount: Math.min(5, criticalDiscoveryCandidates.length),
      historyKind: 'HOME_HERO',
      isArtworkReady: isDiscoveryArtworkReady,
    });
    markDiscoveryPerformance('discovery_snapshot_ready');
    preloadCriticalHeroArtwork(
      resolveHomeHeroArtworkUrl(
        criticalHeroSnapshot.items[0],
        'horizontal',
      ),
    );

    const criticalResult: AppBootstrapResult = {
      licenseCode: normalizedLicenseCode,
      deviceIdentifier: normalizedDeviceIdentifier,
      sourceId: resolvedSourceId.trim(),
      homeSections,
      livePreviewChannels: [],
      movieItems: [],
      seriesItems: [],
      preloadedImages: 0,
      failedImages: 0,
      warnings,
      seriesEpisodesPrecache: {
        candidates: 0,
        storedSeriesCount: 0,
        storedEpisodeCount: 0,
      },
    };

    const isConfirmedMetadataReadable = await localCatalogRepository
      .getImportMetadata(resolvedSourceId.trim())
      .then(isLocalCatalogReadable)
      .catch(() => false);

    if (isPopulatedBootstrapResult(criticalResult) || isConfirmedMetadataReadable) {
      cacheAppBootstrapResultForSession(criticalResult);
    }

    emitProgress(onProgress, {
      stepId: 'done',
      label: 'Abrindo catálogo local...',
      completedSteps: TOTAL_BOOTSTRAP_STEPS,
      totalSteps: TOTAL_BOOTSTRAP_STEPS,
      warning: warnings[0],
    });


    return criticalResult;
  }

  emitProgress(onProgress, {
    stepId: 'license',
    label: 'Validando licença...',
    completedSteps: 0,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
  });

  if (!normalizedLicenseCode || !normalizedDeviceIdentifier) {
    throw new Error('Este aparelho precisa ser ativado antes de preparar a Home.');
  }

  emitProgress(onProgress, {
    stepId: 'playlist',
    label: 'Validando dados autorizados...',
    completedSteps: 1,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
  });

  emitProgress(onProgress, {
    stepId: 'home',
    label: 'Preparando Home...',
    completedSteps: 2,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
  });

  const homeSections = await loadHomeVodSections({
    licenseCode: normalizedLicenseCode,
    deviceIdentifier: normalizedDeviceIdentifier,
    sourceId: resolvedSourceId,
    limitPerSection: HOME_LIMIT_PER_SECTION,
    launchesLimit: HOME_LAUNCHES_LIMIT,
  });

  emitProgress(onProgress, {
    stepId: 'live',
    label: 'Preparando Canais ao Vivo...',
    completedSteps: 3,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
  });

  const livePreviewChannels: IptvChannel[] = [];

  emitProgress(onProgress, {
    stepId: 'movies',
    label: 'Preparando Filmes...',
    completedSteps: 4,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
  });

  const movieItems = await loadCategoryFirstFold({
    slug: 'filmes-lancamentos',
    licenseCode: normalizedLicenseCode,
    deviceIdentifier: normalizedDeviceIdentifier,
    sourceId: resolvedSourceId,
  });

  emitProgress(onProgress, {
    stepId: 'series',
    label: 'Preparando Séries...',
    completedSteps: 5,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
  });

  const seriesItems = await loadCategoryFirstFold({
    slug: 'series',
    licenseCode: normalizedLicenseCode,
    deviceIdentifier: normalizedDeviceIdentifier,
    sourceId: resolvedSourceId,
  });

  writeStoredSeriesLandingItemsForInitialOpen({
    licenseCode: normalizedLicenseCode,
    deviceIdentifier: normalizedDeviceIdentifier,
    items: seriesItems,
  });

  const seriesEpisodesPrecacheResult = {
    candidates: 0,
    storedSeriesCount: 0,
    storedEpisodeCount: 0,
  };

  // Start precaching in the background without blocking the critical bootstrap path
  void precacheSeriesEpisodesFromHomeSections({
    licenseCode: normalizedLicenseCode,
    deviceIdentifier: normalizedDeviceIdentifier,
    sourceId: resolvedSourceId,
    homeSections,
  }).then((precacheResult) => {
    console.info('[XANDEFLIX_BOOTSTRAP_SERIES_PRECACHE_BG_SUCCESS]', precacheResult);
  }).catch((precacheError) => {
    console.warn('[XANDEFLIX_BOOTSTRAP_SERIES_PRECACHE_BG_FAILED]', precacheError);
  });

  emitProgress(onProgress, {
    stepId: 'images',
    label: 'Carregando capas e logos...',
    completedSteps: 6,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
  });

  const imageUrls = uniqueImageUrls([
    ...collectHomeHeroImageUrls(homeSections),
    ...getCachedSeriesHeroBackdropUrls(SERIES_HERO_PRELOAD_ITEM_LIMIT),
    ...collectSeriesHeroImageUrls(seriesItems),
    ...collectPosterImageUrlsFromItems(
      seriesItems,
      SERIES_VISIBLE_CARD_PRELOAD_LIMIT,
    ),
    ...collectPosterImageUrlsFromItems(
      homeSections.flatMap((section) => section.items),
      HOME_VISIBLE_CARD_PRELOAD_LIMIT,
    ),
    ...collectImageUrlsFromHomeSections(homeSections),
    ...collectImageUrlsFromItems(movieItems),
    ...collectImageUrlsFromItems(seriesItems),
    ...collectImageUrlsFromChannels(livePreviewChannels),
  ]);

  const imagePreloadResult = { preloadedImages: 0, failedImages: 0 };
  void preloadImages(imageUrls).catch(() => undefined);

  if (imagePreloadResult.failedImages > 0) {
    warnings.push(
      `${imagePreloadResult.failedImages} imagem(ns) crítica(s) não foram pré-carregadas dentro do tempo limite.`,
    );
  }

  const result: AppBootstrapResult = {
    licenseCode: normalizedLicenseCode,
    deviceIdentifier: normalizedDeviceIdentifier,
    sourceId: resolvedSourceId?.trim() ?? '',
    homeSections,
    livePreviewChannels,
    movieItems,
    seriesItems,
    preloadedImages: 0,
    failedImages: 0,
    warnings,
    seriesEpisodesPrecache: seriesEpisodesPrecacheResult,
  };

  cacheAppBootstrapResultForSession(result);

  emitProgress(onProgress, {
    stepId: 'done',
    label: 'Finalizando...',
    completedSteps: TOTAL_BOOTSTRAP_STEPS,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
    warning: warnings[0],
  });

  return result;
}
