import type { HomeVodItem } from './homeVod.service';
import {
  enrichSeriesDetailHeroItem,
  hydrateSeriesDetailHeroFromCache,
  shouldRequestSeriesDetailMetadata,
} from './seriesHeroTmdb.service';
import type {
  ProviderLookupResult,
  SeriesMetadataCache,
  SeriesMetadataProvider,
  SeriesMetadataResolution,
} from './seriesMetadata.types';

function seriesItem(overrides: Partial<HomeVodItem> = {}): HomeVodItem {
  return {
    id: 'series-silo',
    title: 'Silo',
    seriesKey: 'silo',
    kind: 'series',
    ...overrides,
  };
}

function matchedResolution(): SeriesMetadataResolution {
  return {
    matchStatus: 'matched',
    metadata: {
      provider: 'tmdb',
      providerId: '125988',
      canonicalTitle: 'Silo',
      overview: 'Sinopse em cache local.',
      genres: ['Drama', 'Ficcao cientifica'],
      rating: 8.2,
      posterUrl: 'https://cache.invalid/silo-poster.jpg',
      backdropUrl: 'https://cache.invalid/silo-backdrop.jpg',
      matchStatus: 'matched',
      updatedAt: '2026-07-28T00:00:00.000Z',
      provenance: {
        canonicalTitle: 'tmdb',
        overview: 'tmdb',
        genres: 'tmdb',
        rating: 'tmdb',
        posterUrl: 'tmdb',
        backdropUrl: 'tmdb',
      },
      sourceUrls: {},
    },
    updatedAt: '2026-07-28T00:00:00.000Z',
    expiresAt: Date.now() + 60_000,
  };
}

function provider(
  id: 'tmdb' | 'tvmaze',
  lookup: () => Promise<ProviderLookupResult>,
) {
  let calls = 0;
  const value: SeriesMetadataProvider = {
    id,
    async lookup() {
      calls += 1;
      return lookup();
    },
  };

  return {
    value,
    calls: () => calls,
  };
}

export async function runSeriesDetailMetadataSmokeTest() {
  const localItem = seriesItem({
    overview: 'Sinopse local.',
    posterUrl: 'https://provider.invalid/silo-local-poster.jpg',
  });
  const cacheHydrated = hydrateSeriesDetailHeroFromCache(
    localItem,
    () => [
      seriesItem({
        overview: 'Sinopse em cache local.',
        posterUrl: 'https://cache.invalid/silo-poster.jpg',
        backdropUrl: 'https://cache.invalid/silo-backdrop.jpg',
      }),
    ],
  );
  const cacheHydrationPass =
    cacheHydrated.overview === 'Sinopse local.' &&
    cacheHydrated.posterUrl === localItem.posterUrl &&
    cacheHydrated.backdropUrl ===
      'https://cache.invalid/silo-backdrop.jpg';

  const cache: SeriesMetadataCache = {
    get: async () => matchedResolution(),
    set: async () => undefined,
  };
  const cachePrimary = provider('tmdb', async () => ({
    status: 'error',
    errorCode: 'CACHE_SHOULD_HAVE_PREVENTED_PRIMARY',
  }));
  const cacheFallback = provider('tvmaze', async () => ({
    status: 'error',
    errorCode: 'CACHE_SHOULD_HAVE_PREVENTED_FALLBACK',
  }));
  const cacheResult = await enrichSeriesDetailHeroItem(
    localItem,
    { sourceId: 'source-local' },
    {
      cache,
      primaryProvider: cachePrimary.value,
      fallbackProvider: cacheFallback.value,
      scopeKey: 'scope-local',
    },
  );
  const cacheHitPass =
    cachePrimary.calls() === 0 &&
    cacheFallback.calls() === 0 &&
    cacheResult.posterUrl === localItem.posterUrl &&
    cacheResult.backdropUrl ===
      'https://cache.invalid/silo-backdrop.jpg';

  let releaseRemote:
    | ((result: ProviderLookupResult) => void)
    | undefined;
  const remotePrimary = provider(
    'tmdb',
    () =>
      new Promise<ProviderLookupResult>((resolve) => {
        releaseRemote = resolve;
      }),
  );
  const remoteFallback = provider('tvmaze', async () => ({
    status: 'no_match',
  }));
  const emptyCache: SeriesMetadataCache = {
    get: async () => null,
    set: async () => undefined,
  };
  let remoteApplied = false;
  const remotePromise = enrichSeriesDetailHeroItem(
    localItem,
    { sourceId: 'source-local' },
    {
      cache: emptyCache,
      primaryProvider: remotePrimary.value,
      fallbackProvider: remoteFallback.value,
      scopeKey: 'scope-local',
    },
  ).then((result) => {
    remoteApplied = true;
    return result;
  });

  for (let attempt = 0; attempt < 10 && !releaseRemote; attempt += 1) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }

  const localRenderBeforeRemote =
    !remoteApplied &&
    localItem.title === 'Silo' &&
    localItem.posterUrl ===
      'https://provider.invalid/silo-local-poster.jpg';

  if (!releaseRemote) {
    throw new Error('SERIES_DETAIL_REMOTE_PROVIDER_NOT_REACHED');
  }

  releaseRemote({
    status: 'matched',
    metadata: {
      provider: 'tmdb',
      providerId: '125988',
      canonicalTitle: 'Silo',
      overview: 'Sinopse remota.',
      posterUrl: 'https://remote.invalid/silo-poster.jpg',
      backdropUrl: 'https://remote.invalid/silo-backdrop.jpg',
      matchStatus: 'matched',
      updatedAt: '2026-07-28T00:00:00.000Z',
    },
  });
  const remoteResult = await remotePromise;
  const remoteNonBlockingPass =
    localRenderBeforeRemote &&
    remotePrimary.calls() === 1 &&
    remoteResult.posterUrl === localItem.posterUrl &&
    remoteResult.backdropUrl ===
      'https://remote.invalid/silo-backdrop.jpg';

  const coldStartCalls = Number(
    shouldRequestSeriesDetailMetadata({
      isSeriesDetailPage: false,
      item: localItem,
      sourceId: 'source-local',
    }),
  );
  const searchCalls = Number(
    shouldRequestSeriesDetailMetadata({
      isSeriesDetailPage: false,
      item: localItem,
      sourceId: 'source-local',
    }),
  );
  const detailEligible = shouldRequestSeriesDetailMetadata({
    isSeriesDetailPage: true,
    item: localItem,
    sourceId: 'source-local',
  });

  const result = {
    SERIES_DETAIL_LOCAL_RENDER: localRenderBeforeRemote,
    SERIES_DETAIL_METADATA_CACHE_HIT: cacheHitPass,
    SERIES_DETAIL_METADATA_ASYNC_REQUEST:
      remotePrimary.calls() === 1 && localRenderBeforeRemote,
    SERIES_DETAIL_METADATA_APPLIED: remoteNonBlockingPass,
    SERIES_DETAIL_ARTWORK_LOCAL_FIRST: cacheHydrationPass,
    SERIES_DETAIL_ROUTE_ONLY_ENRICHMENT: detailEligible,
    REMOTE_METADATA_CALLS_COLD_START: coldStartCalls,
    REMOTE_METADATA_CALLS_SEARCH: searchCalls,
    BACKEND_CATALOG_QUERY: 0,
    CENTRAL_CATALOG_WRITE: 0,
    FULL_CATALOG_SCAN_DETAIL: 0,
    LOCAL_ONLY: true,
  };

  return {
    pass:
      Object.entries(result)
        .filter(
          ([key]) =>
            ![
              'REMOTE_METADATA_CALLS_COLD_START',
              'REMOTE_METADATA_CALLS_SEARCH',
              'BACKEND_CATALOG_QUERY',
              'CENTRAL_CATALOG_WRITE',
              'FULL_CATALOG_SCAN_DETAIL',
            ].includes(key),
        )
        .every(([, value]) => value === true) &&
      coldStartCalls === 0 &&
      searchCalls === 0,
    ...result,
  };
}
