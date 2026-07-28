import {
  getSeriesCollectionKey,
  type LocalCatalogSeriesIdentityInput,
} from '@/features/localCatalog/services/localCatalogSeriesIdentity.service';

import {
  createSeriesMetadataResolver,
  SERIES_METADATA_ERROR_TTL_MS,
  SERIES_METADATA_MATCHED_TTL_MS,
  SERIES_METADATA_NO_MATCH_TTL_MS,
} from './seriesMetadataResolver.service';
import type {
  ProviderLookupResult,
  ProviderSeriesMetadata,
  SeriesMetadataCache,
  SeriesMetadataProvider,
  SeriesMetadataQuery,
  SeriesMetadataResolution,
} from './seriesMetadata.types';
import { TvmazeSeriesMetadataProvider } from './tvmazeSeriesMetadata.provider';

const FIXED_NOW = Date.parse('2026-07-24T12:00:00.000Z');
const QUERY: SeriesMetadataQuery = {
  seriesKey: 'serie exemplo',
  canonicalTitle: 'Série Exemplo',
  originalTitle: 'Série Exemplo S01 E01',
};

function metadata(
  provider: 'tmdb' | 'tvmaze',
  overrides: Partial<ProviderSeriesMetadata> = {},
): ProviderSeriesMetadata {
  return {
    provider,
    providerId: provider === 'tmdb' ? '101' : '202',
    canonicalTitle: 'Série Exemplo',
    originalTitle: 'Series Example',
    releaseYear: '2024',
    overview: `${provider} overview`,
    genres: ['Drama'],
    rating: provider === 'tmdb' ? 8.4 : 7.9,
    voteCount: provider === 'tmdb' ? 500 : 120,
    posterUrl: `https://images.example/${provider}-poster.jpg`,
    backdropUrl: `https://images.example/${provider}-backdrop.jpg`,
    sourceUrl: `https://metadata.example/${provider}/series`,
    matchStatus: 'matched',
    updatedAt: new Date(FIXED_NOW).toISOString(),
    ...overrides,
  };
}

function fakeProvider(
  id: 'tmdb' | 'tvmaze',
  result:
    | ProviderLookupResult
    | (() => ProviderLookupResult | Promise<ProviderLookupResult>),
) {
  let calls = 0;
  const provider: SeriesMetadataProvider = {
    id,
    async lookup() {
      calls += 1;
      return typeof result === 'function' ? result() : result;
    },
  };

  return {
    provider,
    calls: () => calls,
    reset: () => {
      calls = 0;
    },
  };
}

function memoryCache() {
  const values = new Map<string, SeriesMetadataResolution>();
  const cache: SeriesMetadataCache = {
    async get(scopeKey, seriesKey) {
      return values.get(`${scopeKey}::${seriesKey}`) ?? null;
    },
    async set(scopeKey, seriesKey, resolution) {
      values.set(`${scopeKey}::${seriesKey}`, resolution);
    },
  };

  return cache;
}

function createResolver(
  primaryProvider: SeriesMetadataProvider,
  fallbackProvider: SeriesMetadataProvider,
  cache: SeriesMetadataCache = memoryCache(),
) {
  return createSeriesMetadataResolver({
    primaryProvider,
    fallbackProvider,
    cache,
    now: () => FIXED_NOW,
  });
}

function expiresIn(resolution: SeriesMetadataResolution) {
  return resolution.expiresAt - FIXED_NOW;
}

async function runCaseA() {
  const primary = fakeProvider('tmdb', {
    status: 'matched',
    metadata: metadata('tmdb'),
  });
  const fallback = fakeProvider('tvmaze', { status: 'no_match' });
  const result = await createResolver(
    primary.provider,
    fallback.provider,
  )({
    scopeKey: 'scope-a',
    query: QUERY,
  });

  return {
    pass:
      result.matchStatus === 'matched' &&
      fallback.calls() === 0 &&
      expiresIn(result) === SERIES_METADATA_MATCHED_TTL_MS,
    tvmazeCallCount: fallback.calls(),
  };
}

async function runCaseB() {
  const primary = fakeProvider('tmdb', {
    status: 'matched',
    metadata: metadata('tmdb', {
      posterUrl: undefined,
      backdropUrl: undefined,
    }),
  });
  const fallback = fakeProvider('tvmaze', {
    status: 'matched',
    metadata: metadata('tvmaze', {
      overview: 'TVmaze must not replace this field',
    }),
  });
  const result = await createResolver(
    primary.provider,
    fallback.provider,
  )({
    scopeKey: 'scope-b',
    query: QUERY,
  });

  return {
    pass:
      result.matchStatus === 'matched' &&
      result.metadata.overview === 'tmdb overview' &&
      result.metadata.posterUrl?.includes('tvmaze-poster') === true &&
      result.metadata.provenance.overview === 'tmdb' &&
      result.metadata.provenance.posterUrl === 'tvmaze' &&
      result.metadata.sourceUrls.tvmaze?.includes('/tvmaze/') === true,
  };
}

async function runCaseC() {
  const primary = fakeProvider('tmdb', {
    status: 'matched',
    metadata: metadata('tmdb', { overview: undefined }),
  });
  const fallback = fakeProvider('tvmaze', {
    status: 'matched',
    metadata: metadata('tvmaze', { overview: 'TVmaze overview resolvido' }),
  });
  const result = await createResolver(
    primary.provider,
    fallback.provider,
  )({
    scopeKey: 'scope-c',
    query: QUERY,
  });

  return {
    pass:
      result.matchStatus === 'matched' &&
      result.metadata.overview === 'TVmaze overview resolvido' &&
      result.metadata.provenance.overview === 'tvmaze',
    overviewSource:
      result.matchStatus === 'matched'
        ? result.metadata.provenance.overview
        : undefined,
  };
}

async function runCaseD() {
  const primary = fakeProvider('tmdb', { status: 'no_match' });
  const fallback = fakeProvider('tvmaze', { status: 'no_match' });
  const result = await createResolver(
    primary.provider,
    fallback.provider,
  )({
    scopeKey: 'scope-d',
    query: QUERY,
  });

  return {
    pass:
      result.matchStatus === 'no_match' &&
      expiresIn(result) === SERIES_METADATA_NO_MATCH_TTL_MS,
    matchStatus: result.matchStatus,
    ttlMs: expiresIn(result),
  };
}

async function runCaseE() {
  const primary = fakeProvider('tmdb', () => {
    throw new Error('TMDB_TIMEOUT');
  });
  const fallback = fakeProvider('tvmaze', { status: 'no_match' });
  const result = await createResolver(
    primary.provider,
    fallback.provider,
  )({
    scopeKey: 'scope-e',
    query: QUERY,
  });

  return {
    pass:
      result.matchStatus === 'error' &&
      expiresIn(result) === SERIES_METADATA_ERROR_TTL_MS,
    matchStatus: result.matchStatus,
    ttlMs: expiresIn(result),
  };
}

async function runCaseF() {
  const primary = fakeProvider('tmdb', {
    status: 'matched',
    metadata: metadata('tmdb'),
  });
  const fallback = fakeProvider('tvmaze', { status: 'no_match' });
  const resolver = createResolver(primary.provider, fallback.provider);

  await resolver({ scopeKey: 'scope-f-one', query: QUERY });
  primary.reset();
  fallback.reset();
  await resolver({ scopeKey: 'scope-f-one', query: QUERY });
  const sameScopePrimaryCalls = primary.calls();
  const sameScopeFallbackCalls = fallback.calls();
  await resolver({ scopeKey: 'scope-f-two', query: QUERY });

  return {
    pass:
      sameScopePrimaryCalls === 0 &&
      sameScopeFallbackCalls === 0 &&
      primary.calls() === 1,
    secondResolutionPrimaryCalls: sameScopePrimaryCalls,
    secondResolutionFallbackCalls: sameScopeFallbackCalls,
    differentScopePrimaryCalls: primary.calls(),
  };
}

async function runCaseG() {
  const slowFetch = ((
    _input: RequestInfo | URL,
    init?: RequestInit,
  ) =>
    new Promise<Response>((_resolve, reject) => {
      const rejectOnAbort = () =>
        reject(new DOMException('Aborted', 'AbortError'));

      if (init?.signal?.aborted) {
        rejectOnAbort();
        return;
      }

      init?.signal?.addEventListener('abort', rejectOnAbort, {
        once: true,
      });
    })) as typeof fetch;
  const provider = new TvmazeSeriesMetadataProvider(slowFetch, 15);
  const startedAt = Date.now();
  const result = await provider.lookup(QUERY);
  const elapsedMs = Date.now() - startedAt;

  return {
    pass:
      result.status === 'error' &&
      result.errorCode === 'TVMAZE_TIMEOUT' &&
      elapsedMs < 1000,
    status: result.status,
    errorCode: result.status === 'error' ? result.errorCode : undefined,
    elapsedMs,
  };
}

function identityInput(title: string): LocalCatalogSeriesIdentityInput {
  return {
    id: title,
    name: title,
    rawName: title,
    tvgName: null,
    groupTitle: 'Séries',
  };
}

function runCaseH() {
  const pairs = [
    ['Grizzy e os Lemmings S03 E16', 'Grizzy e os Lemmings S03 E17'],
    ['One Piece S01 E45', 'One Piece S01 E46'],
    ['Pokémon S18 E34', 'Pokémon S18 E35'],
    ['South Park S05 E02', 'South Park S05 E03'],
  ];
  const keys = pairs.map(([left, right]) => [
    getSeriesCollectionKey(identityInput(left)),
    getSeriesCollectionKey(identityInput(right)),
  ]);

  return {
    pass: keys.every(([left, right]) => left === right),
    keys,
  };
}

export async function runSeriesMetadataResolverSmokeTest() {
  const cases = {
    A: await runCaseA(),
    B: await runCaseB(),
    C: await runCaseC(),
    D: await runCaseD(),
    E: await runCaseE(),
    F: await runCaseF(),
    G: await runCaseG(),
    H: runCaseH(),
  };

  return {
    pass: Object.values(cases).every((result) => result.pass),
    cases,
  };
}
