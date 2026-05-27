import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';
import { isLiveChannel } from '@/features/playlists/lib/channelClassification';
import { listAuthorizedLicenseChannels } from '@/features/playlists/services/authorizedLicenseChannels.service';
import type {
  IptvChannel,
  PlaylistRuntimeStatus,
  PlaylistSource,
} from '@/features/playlists/types/playlist';
import {
  loadHomeVodCategoryItems,
  loadHomeVodSections,
  type HomeVodItem,
  type HomeVodSection,
} from '@/features/catalog/services/homeVod.service';
import { storeCachedSeriesEpisodes } from '@/features/catalog/services/seriesEpisodesCache.service';
import { getCatalogCategoryDefinition } from '@/features/catalog/services/catalogCategoryGroups.service';
import { storeCachedLiveTvCriticalChannels } from '@/features/live/services/liveTvCriticalCache.service';

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
  loadFromSource: (source: PlaylistSource) => Promise<void>;
};

export type RunAppBootstrapInput = {
  licenseCode?: string | null;
  deviceIdentifier?: string | null;
  runtime: AppBootstrapRuntimeInput;
  onProgress?: (progress: AppBootstrapProgress) => void;
};

export type AppBootstrapResult = {
  licenseCode: string;
  deviceIdentifier: string;
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

const APP_BOOTSTRAP_STORAGE_KEY = 'xandeflix:critical-bootstrap:v5';
const BOOTSTRAP_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const HOME_LIMIT_PER_SECTION = 12;
const HOME_LAUNCHES_LIMIT = 20;
const CATEGORY_FIRST_FOLD_LIMIT = 60;
const SERIES_EPISODES_PRECACHE_LIMIT = 500;
const SERIES_COLLECTIONS_PRECACHE_LIMIT = 4;
const LIVE_PREVIEW_PAGE_SIZE = 200;
const LIVE_PREVIEW_MAX_PAGES = 5;
const IMAGE_PRELOAD_LIMIT = 90;
const IMAGE_PRELOAD_CONCURRENCY = 6;
const IMAGE_PRELOAD_TIMEOUT_MS = 2500;

const TOTAL_BOOTSTRAP_STEPS = 7;

type AppBootstrapCacheEntry = {
  createdAt: number;
  result: AppBootstrapResult;
};

let appBootstrapCache: AppBootstrapCacheEntry | null = null;

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
    seriesItems: result.seriesItems.map((item) => ({ ...item })),
    warnings: [...result.warnings],
    seriesEpisodesPrecache: result.seriesEpisodesPrecache
      ? { ...result.seriesEpisodesPrecache }
      : undefined,
  };
}

function isBootstrapResultForActivation({
  result,
  licenseCode,
  deviceIdentifier,
}: {
  result: AppBootstrapResult;
  licenseCode: string;
  deviceIdentifier: string;
}) {
  return (
    normalizeLicenseCode(result.licenseCode) === normalizeLicenseCode(licenseCode) &&
    normalizeDeviceIdentifier(result.deviceIdentifier) ===
      normalizeDeviceIdentifier(deviceIdentifier)
  );
}

function readStoredBootstrapResult() {
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

    if (Date.now() - parsedValue.createdAt >= BOOTSTRAP_CACHE_TTL_MS) {
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
        result: cloneBootstrapResult(result),
      }),
    );
  } catch {
    // Cache persistente é otimização. Falha não deve impedir o app de abrir.
  }
}

export function getCachedAppBootstrapResult() {
  const memoryCache = appBootstrapCache;

  if (memoryCache) {
    if (Date.now() - memoryCache.createdAt < BOOTSTRAP_CACHE_TTL_MS) {
      return cloneBootstrapResult(memoryCache.result);
    }

    appBootstrapCache = null;
  }

  const storedCache = readStoredBootstrapResult();

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

function isVodGroupTitleForLiveBootstrap(groupTitle?: string | null) {
  const normalizedGroupTitle = groupTitle
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (!normalizedGroupTitle) {
    return false;
  }

  return (
    /^filmes\s*\|/.test(normalizedGroupTitle) ||
    /^series\s*\|/.test(normalizedGroupTitle)
  );
}

function isLiveBootstrapChannel(channel: IptvChannel) {
  if (isVodGroupTitleForLiveBootstrap(channel.groupTitle)) {
    return false;
  }

  if (channel.contentKind) {
    return channel.contentKind === 'live';
  }

  return isLiveChannel(channel);
}

async function loadLivePreviewChannels({
  licenseCode,
  deviceIdentifier,
}: {
  licenseCode: string;
  deviceIdentifier: string;
}) {
  const channels = await listAuthorizedLicenseChannels({
    licenseCode,
    deviceIdentifier,
    pageSize: LIVE_PREVIEW_PAGE_SIZE,
    maxPages: LIVE_PREVIEW_MAX_PAGES,
    contentKind: 'live',
  });

  return channels.filter(isLiveBootstrapChannel);
}

async function loadCategoryFirstFold({
  slug,
  licenseCode,
  deviceIdentifier,
}: {
  slug: string;
  licenseCode: string;
  deviceIdentifier: string;
}) {
  const category = getCatalogCategoryDefinition(slug);

  if (!category) {
    return [];
  }

  return loadHomeVodCategoryItems({
    licenseCode,
    deviceIdentifier,
    groupTitles: category.groupTitles,
    limit: CATEGORY_FIRST_FOLD_LIMIT,
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
  homeSections,
}: {
  licenseCode: string;
  deviceIdentifier: string;
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
  void runtime;

  const cachedResult = getCachedAppBootstrapResult();

  if (
    cachedResult &&
    isBootstrapResultForActivation({
      result: cachedResult,
      licenseCode: normalizedLicenseCode,
      deviceIdentifier: normalizedDeviceIdentifier,
    })
  ) {
    storeCachedLiveTvCriticalChannels({
      licenseCode: normalizedLicenseCode,
      deviceIdentifier: normalizedDeviceIdentifier,
      channels: cachedResult.livePreviewChannels,
    });
    console.info('[XANDEFLIX_BOOTSTRAP_RESTORE_LIVE_CACHE]', {
      channels: cachedResult.livePreviewChannels.length,
    });

    emitProgress(onProgress, {
      stepId: 'done',
      label: 'Abrindo dados já preparados...',
      completedSteps: TOTAL_BOOTSTRAP_STEPS,
      totalSteps: TOTAL_BOOTSTRAP_STEPS,
    });

    return cachedResult;
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
    limitPerSection: HOME_LIMIT_PER_SECTION,
    launchesLimit: HOME_LAUNCHES_LIMIT,
  });

  emitProgress(onProgress, {
    stepId: 'live',
    label: 'Preparando Canais ao Vivo...',
    completedSteps: 3,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
  });

  let livePreviewChannels: IptvChannel[] = [];

  try {
    livePreviewChannels = await loadLivePreviewChannels({
      licenseCode: normalizedLicenseCode,
      deviceIdentifier: normalizedDeviceIdentifier,
    });

    storeCachedLiveTvCriticalChannels({
      licenseCode: normalizedLicenseCode,
      deviceIdentifier: normalizedDeviceIdentifier,
      channels: livePreviewChannels,
    });
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Live TV será carregada pelo runtime da playlist: ${error.message}`
        : 'Live TV será carregada pelo runtime da playlist.',
    );
  }

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
    ...collectImageUrlsFromHomeSections(homeSections),
    ...collectImageUrlsFromItems(movieItems),
    ...collectImageUrlsFromItems(seriesItems),
    ...collectImageUrlsFromChannels(livePreviewChannels),
  ]);

  const imagePreloadResult = await preloadImages(imageUrls);

  if (imagePreloadResult.failedImages > 0) {
    warnings.push(
      `${imagePreloadResult.failedImages} imagem(ns) crítica(s) não foram pré-carregadas dentro do tempo limite.`,
    );
  }

  const result: AppBootstrapResult = {
    licenseCode: normalizedLicenseCode,
    deviceIdentifier: normalizedDeviceIdentifier,
    homeSections,
    livePreviewChannels,
    movieItems,
    seriesItems,
    preloadedImages: imagePreloadResult.preloadedImages,
    failedImages: imagePreloadResult.failedImages,
    warnings,
    seriesEpisodesPrecache: seriesEpisodesPrecacheResult,
  };

  appBootstrapCache = {
    createdAt: Date.now(),
    result: cloneBootstrapResult(result),
  };
  writeStoredBootstrapResult(result);

  emitProgress(onProgress, {
    stepId: 'done',
    label: 'Finalizando...',
    completedSteps: TOTAL_BOOTSTRAP_STEPS,
    totalSteps: TOTAL_BOOTSTRAP_STEPS,
    warning: warnings[0],
  });

  return result;
}
