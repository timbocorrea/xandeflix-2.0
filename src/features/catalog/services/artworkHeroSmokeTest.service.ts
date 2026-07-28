import {
  getSeriesCollectionKey,
  type LocalCatalogSeriesIdentityInput,
} from '@/features/localCatalog/services/localCatalogSeriesIdentity.service';

import {
  resolveHomeHeroArtworkUrl,
  resolveMovieCategoryHeroArtworkUrl,
  resolveMovieDetailHeroArtworkUrl,
} from './heroArtworkPolicy.service';
import type { HomeVodItem } from './homeVod.service';
import {
  createSeriesMetadataResolver,
} from './seriesMetadataResolver.service';
import {
  enrichSeriesCardPosters,
  isConfidentTmdbSeriesTitleMatch,
} from './seriesHeroTmdb.service';
import type {
  ProviderSeriesMetadata,
  SeriesMetadataCache,
  SeriesMetadataProvider,
  SeriesMetadataResolution,
} from './seriesMetadata.types';
import {
  isConfidentTvmazeTitleMatch,
  TvmazeSeriesMetadataProvider,
} from './tvmazeSeriesMetadata.provider';

const POSTER_URL = 'https://images.example/poster-vertical.jpg';
const BACKDROP_URL = 'https://images.example/backdrop-horizontal.jpg';

function item(overrides: Partial<HomeVodItem> = {}): HomeVodItem {
  return {
    id: 'series-example',
    title: 'Série Exemplo',
    kind: 'series',
    seriesKey: 'série exemplo',
    ...overrides,
  };
}

function metadata(
  provider: 'tmdb' | 'tvmaze',
  overrides: Partial<ProviderSeriesMetadata> = {},
): ProviderSeriesMetadata {
  return {
    provider,
    providerId: provider === 'tmdb' ? '101' : '202',
    canonicalTitle: 'Série Exemplo',
    overview: `${provider} overview`,
    posterUrl: `${provider}-${POSTER_URL}`,
    backdropUrl: provider === 'tmdb' ? BACKDROP_URL : undefined,
    matchStatus: 'matched',
    updatedAt: '2026-07-24T12:00:00.000Z',
    ...overrides,
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

function countingProvider(
  id: 'tmdb' | 'tvmaze',
  providerMetadata: ProviderSeriesMetadata,
) {
  let calls = 0;
  const provider: SeriesMetadataProvider = {
    id,
    async lookup() {
      calls += 1;
      return { status: 'matched', metadata: providerMetadata };
    },
  };

  return { provider, calls: () => calls };
}

function runCaseI() {
  const heroItem = item({
    kind: 'movie',
    posterUrl: POSTER_URL,
    backdropUrl: BACKDROP_URL,
  });

  return {
    pass:
      resolveHomeHeroArtworkUrl(heroItem, 'horizontal') === BACKDROP_URL,
    selectedUrl: resolveHomeHeroArtworkUrl(heroItem, 'horizontal'),
  };
}

function runCaseJ() {
  const heroItem = item({ kind: 'movie', posterUrl: POSTER_URL });

  return {
    pass:
      resolveHomeHeroArtworkUrl(heroItem, 'horizontal') === undefined,
    selectedUrl: resolveHomeHeroArtworkUrl(heroItem, 'horizontal'),
  };
}

function runCaseK() {
  const heroItem = item({
    kind: 'movie',
    posterUrl: POSTER_URL,
    backdropUrl: BACKDROP_URL,
  });

  return {
    pass: resolveMovieCategoryHeroArtworkUrl(heroItem) === BACKDROP_URL,
    selectedUrl: resolveMovieCategoryHeroArtworkUrl(heroItem),
  };
}

function runCaseL() {
  const heroItem = item({
    kind: 'movie',
    posterUrl: POSTER_URL,
    backdropUrl: BACKDROP_URL,
  });

  return {
    pass: resolveMovieDetailHeroArtworkUrl(heroItem) === BACKDROP_URL,
    selectedUrl: resolveMovieDetailHeroArtworkUrl(heroItem),
  };
}

async function runCaseM() {
  const primary = countingProvider(
    'tmdb',
    metadata('tmdb', { posterUrl: undefined }),
  );
  const fallback = countingProvider(
    'tvmaze',
    metadata('tvmaze', {
      posterUrl: 'https://images.example/tvmaze-card-poster.jpg',
      backdropUrl: undefined,
    }),
  );
  const [enriched] = await enrichSeriesCardPosters(
    [item({ posterUrl: undefined, backdropUrl: undefined })],
    { limit: 1 },
    {
      primaryProvider: primary.provider,
      fallbackProvider: fallback.provider,
      cache: memoryCache(),
      scopeKey: 'scope-m',
    },
  );

  return {
    pass:
      enriched?.posterUrl ===
        'https://images.example/tvmaze-card-poster.jpg' &&
      enriched.backdropUrl === BACKDROP_URL &&
      String(enriched.backdropUrl) !== String(enriched.posterUrl) &&
      enriched.metadataProvenance?.posterUrl === 'tvmaze' &&
      enriched.metadataProvenance?.backdropUrl === 'tmdb',
    primaryCalls: primary.calls(),
    fallbackCalls: fallback.calls(),
    posterSource: enriched?.metadataProvenance?.posterUrl,
    backdropSource: enriched?.metadataProvenance?.backdropUrl,
  };
}

async function runCaseN() {
  const primary = countingProvider('tmdb', metadata('tmdb'));
  const fallback = countingProvider('tvmaze', metadata('tvmaze'));
  const resolver = createSeriesMetadataResolver({
    primaryProvider: primary.provider,
    fallbackProvider: fallback.provider,
    cache: memoryCache(),
  });
  const query = {
    seriesKey: 'série exemplo',
    canonicalTitle: 'Série Exemplo',
    originalTitle: 'Série Exemplo S01 E01',
  };

  await resolver({ scopeKey: 'scope-n', query });
  const callsAfterFirstResolution = primary.calls() + fallback.calls();
  await resolver({ scopeKey: 'scope-n', query });
  const secondResolutionProviderCalls =
    primary.calls() + fallback.calls() - callsAfterFirstResolution;

  return {
    pass: secondResolutionProviderCalls === 0,
    secondResolutionProviderCalls,
  };
}

async function runCaseO() {
  const primary = countingProvider('tmdb', metadata('tmdb'));
  const fallback = countingProvider('tvmaze', metadata('tvmaze'));
  const resolver = createSeriesMetadataResolver({
    primaryProvider: primary.provider,
    fallbackProvider: fallback.provider,
    cache: memoryCache(),
  });
  const query = {
    seriesKey: 'série exemplo',
    canonicalTitle: 'Série Exemplo',
    originalTitle: 'Série Exemplo S01 E01',
  };

  await resolver({ scopeKey: 'scope-o-a', query });
  const callsAfterScopeA = primary.calls() + fallback.calls();
  await resolver({ scopeKey: 'scope-o-b', query });
  const scopeBProviderCalls =
    primary.calls() + fallback.calls() - callsAfterScopeA;

  return {
    pass: scopeBProviderCalls > 0,
    scopeBProviderCalls,
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

async function runCaseP() {
  const query = {
    seriesKey: getSeriesCollectionKey(identityInput('The Office')),
    canonicalTitle: 'The Office',
    originalTitle: 'The Office S01 E01',
  };
  const differentSeriesKey = getSeriesCollectionKey(
    identityInput('The Office UK'),
  );
  const tvmazeProvider = new TvmazeSeriesMetadataProvider(
    async () =>
      new Response(
        JSON.stringify([
          {
            score: 1,
            show: {
              id: 999,
              name: 'The Office UK',
              image: { original: POSTER_URL },
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  );
  const tvmazeResult = await tvmazeProvider.lookup(query);
  const tmdbMatch = isConfidentTmdbSeriesTitleMatch(
    { name: 'The Office UK' },
    query.canonicalTitle,
  );
  const tvmazeMatch = isConfidentTvmazeTitleMatch('The Office UK', query);

  return {
    pass:
      query.seriesKey !== differentSeriesKey &&
      !tmdbMatch &&
      !tvmazeMatch &&
      tvmazeResult.status === 'no_match',
    firstSeriesKey: query.seriesKey,
    secondSeriesKey: differentSeriesKey,
    providerStatus: tvmazeResult.status,
  };
}

export async function runArtworkHeroSmokeTest() {
  const cases = {
    I: runCaseI(),
    J: runCaseJ(),
    K: runCaseK(),
    L: runCaseL(),
    M: await runCaseM(),
    N: await runCaseN(),
    O: await runCaseO(),
    P: await runCaseP(),
  };

  return {
    pass: Object.values(cases).every((result) => result.pass),
    cases,
  };
}
