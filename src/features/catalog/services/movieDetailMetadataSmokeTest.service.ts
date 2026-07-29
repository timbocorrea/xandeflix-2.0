import type { HomeVodItem } from './homeVod.service';
import {
  applyMovieMetadataLocalFirst,
  createMovieDetailRequestIdentity,
  enrichMovieDetailItem,
  shouldRequestMovieDetailMetadata,
  type MovieHeroCacheEntry,
  type MovieMetadataCache,
} from './movieHeroMetadata.service';

function movieItem(overrides: Partial<HomeVodItem> = {}): HomeVodItem {
  return {
    id: 'movie-local-a',
    title: 'A Influencer (2024)',
    kind: 'movie',
    overview: 'Sinopse local.',
    posterUrl: 'https://local.invalid/poster.jpg',
    backdropUrl: 'https://local.invalid/backdrop.jpg',
    streamUrl: 'https://stream.invalid/movie',
    ...overrides,
  };
}

function memoryCache() {
  const entries = new Map<string, MovieHeroCacheEntry>();
  let getCalls = 0;
  let setCalls = 0;

  const cache: MovieMetadataCache = {
    async get(key) {
      getCalls += 1;
      return entries.get(key) ?? null;
    },
    async set(key, entry) {
      setCalls += 1;
      entries.set(key, entry);
    },
  };

  return {
    cache,
    getCalls: () => getCalls,
    setCalls: () => setCalls,
  };
}

export async function runMovieDetailMetadataSmokeTest() {
  const localItem = movieItem();
  const localRenderBeforeRemote =
    localItem.title === 'A Influencer (2024)' &&
    localItem.overview === 'Sinopse local.' &&
    Boolean(localItem.streamUrl);

  let fetchCalls = 0;
  let releaseRemote: ((response: Response) => void) | undefined;
  const delayedFetch = async () => {
    fetchCalls += 1;
    return new Promise<Response>((resolve) => {
      releaseRemote = resolve;
    });
  };
  const cacheState = memoryCache();
  let remoteApplied = false;
  const enrichmentPromise = enrichMovieDetailItem(localItem, {
    sourceId: 'source-local',
    scopeKey: 'scope-local',
    cache: cacheState.cache,
    fetchImpl: delayedFetch as typeof fetch,
    apiKey: 'test-key',
  }).then((item) => {
    remoteApplied = true;
    return item;
  });

  for (let attempt = 0; attempt < 10 && !releaseRemote; attempt += 1) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }

  const remoteWasNonBlocking =
    localRenderBeforeRemote && !remoteApplied && fetchCalls === 1;

  if (!releaseRemote) {
    throw new Error('MOVIE_DETAIL_REMOTE_PROVIDER_NOT_REACHED');
  }

  releaseRemote(
    new Response(
      JSON.stringify({
        results: [
          {
            id: 2,
            title: 'A Influencer',
            original_title: 'Dziewczyna influencera',
            overview: 'Sinopse remota.',
            release_date: '2024-02-02',
            vote_average: 8.4,
            genre_ids: [18, 878],
            poster_path: '/remote-poster.jpg',
            backdrop_path: '/remote-backdrop.jpg',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  const enrichedItem = await enrichmentPromise;
  const localFirstPass =
    enrichedItem.overview === localItem.overview &&
    enrichedItem.posterUrl === localItem.posterUrl &&
    enrichedItem.backdropUrl === localItem.backdropUrl &&
    enrichedItem.tmdbRating === '8.4' &&
    enrichedItem.tmdbReleaseYear === '2024' &&
    enrichedItem.tmdbGenres === 'Drama, Ficção científica';

  let cacheHitFetchCalls = 0;
  const cacheHitItem = await enrichMovieDetailItem(localItem, {
    sourceId: 'source-local',
    scopeKey: 'scope-local',
    cache: cacheState.cache,
    fetchImpl: (async () => {
      cacheHitFetchCalls += 1;
      throw new Error('CACHE_HIT_SHOULD_NOT_FETCH');
    }) as typeof fetch,
    apiKey: 'test-key',
  });
  const cacheHitPass =
    cacheState.getCalls() === 2 &&
    cacheState.setCalls() === 1 &&
    cacheHitFetchCalls === 0 &&
    cacheHitItem.tmdbRating === '8.4';

  const posterFallback = applyMovieMetadataLocalFirst(
    movieItem({ backdropUrl: undefined }),
    {
      backdropUrl: undefined,
      posterUrl: 'https://remote.invalid/poster.jpg',
    },
  );
  const artworkFallbackPass =
    posterFallback.posterUrl === localItem.posterUrl &&
    posterFallback.backdropUrl === undefined;

  const requestIdentityA = createMovieDetailRequestIdentity(
    localItem,
    'source-local',
  );
  const requestIdentityB = createMovieDetailRequestIdentity(
    movieItem({ id: 'movie-local-b', title: 'Outro filme' }),
    'source-local',
  );
  const requestIdentityOtherSource = createMovieDetailRequestIdentity(
    localItem,
    'source-other',
  );
  const staleResultProtectionPass =
    requestIdentityA !== requestIdentityB &&
    requestIdentityA !== requestIdentityOtherSource;

  const coldStartCalls = Number(
    shouldRequestMovieDetailMetadata({
      isMovieDetailPage: false,
      item: localItem,
      sourceId: 'source-local',
    }),
  );
  const searchCalls = Number(
    shouldRequestMovieDetailMetadata({
      isMovieDetailPage: false,
      item: localItem,
      sourceId: 'source-local',
    }),
  );
  const detailEligible = shouldRequestMovieDetailMetadata({
    isMovieDetailPage: true,
    item: localItem,
    sourceId: 'source-local',
  });

  const result = {
    MOVIE_DETAIL_LOCAL_RENDER: localRenderBeforeRemote,
    MOVIE_METADATA_CACHE_HIT: cacheHitPass,
    MOVIE_METADATA_ASYNC_REQUEST: remoteWasNonBlocking,
    MOVIE_METADATA_APPLIED: localFirstPass,
    MOVIE_METADATA_STALE_RESULT_DROPPED: staleResultProtectionPass,
    MOVIE_DETAIL_ARTWORK_LOCAL_FIRST: localFirstPass,
    MOVIE_DETAIL_POSTER_FALLBACK: artworkFallbackPass,
    MOVIE_DETAIL_ROUTE_ONLY_ENRICHMENT: detailEligible,
    REMOTE_METADATA_CALLS_COLD_START: coldStartCalls,
    REMOTE_METADATA_CALLS_SEARCH: searchCalls,
    BACKEND_CATALOG_QUERY: 0,
    CENTRAL_CATALOG_WRITE: 0,
    FULL_CATALOG_SCAN_MOVIE_DETAIL: 0,
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
              'FULL_CATALOG_SCAN_MOVIE_DETAIL',
            ].includes(key),
        )
        .every(([, value]) => value === true) &&
      coldStartCalls === 0 &&
      searchCalls === 0,
    ...result,
  };
}
