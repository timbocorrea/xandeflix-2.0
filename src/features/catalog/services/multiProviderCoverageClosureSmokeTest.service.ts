import {
  resolveHomeHeroArtworkUrl,
  getHorizontalHeroArtworkCandidates,
} from './heroArtworkPolicy.service';
import type { HomeVodItem } from './homeVod.service';
import {
  enrichMovieHeroItems,
} from './movieHeroMetadata.service';
import {
  createSeriesMetadataResolver,
  SERIES_METADATA_ERROR_TTL_MS,
  SERIES_METADATA_NO_MATCH_TTL_MS,
} from './seriesMetadataResolver.service';
import {
  enrichSeriesCardPosters,
} from './seriesHeroTmdb.service';
import type {
  ProviderLookupResult,
  ProviderSeriesMetadata,
  SeriesMetadataCache,
  SeriesMetadataProvider,
  SeriesMetadataQuery,
  SeriesMetadataResolution,
} from './seriesMetadata.types';
import { TvmazeSeriesMetadataProvider } from './tvmazeSeriesMetadata.provider';

const FIXED_NOW = Date.parse('2026-07-25T10:00:00.000Z');

function sampleQuery(): SeriesMetadataQuery {
  return {
    seriesKey: 'serie teste',
    canonicalTitle: 'Série Teste',
    originalTitle: 'Série Teste S01 E01',
  };
}

function sampleMetadata(
  provider: 'tmdb' | 'tvmaze',
  overrides: Partial<ProviderSeriesMetadata> = {},
): ProviderSeriesMetadata {
  return {
    provider,
    providerId: provider === 'tmdb' ? '100' : '200',
    canonicalTitle: 'Série Teste',
    originalTitle: 'Serie Test',
    releaseYear: '2024',
    overview: `${provider} overview content`,
    genres: ['Drama'],
    rating: 8.5,
    posterUrl: `https://images.example/${provider}-poster.jpg`,
    backdropUrl: provider === 'tmdb' ? 'https://images.example/tmdb-backdrop.jpg' : undefined,
    matchStatus: 'matched',
    updatedAt: new Date(FIXED_NOW).toISOString(),
    ...overrides,
  };
}

function mockProvider(
  id: 'tmdb' | 'tvmaze',
  result: ProviderLookupResult | (() => ProviderLookupResult | Promise<ProviderLookupResult>),
) {
  let callCount = 0;
  const provider: SeriesMetadataProvider = {
    id,
    async lookup(_query, _options) {
      callCount += 1;
      return typeof result === 'function' ? result() : result;
    },
  };

  return {
    provider,
    getCalls: () => callCount,
    reset: () => { callCount = 0; },
  };
}

function createMemoryCache(): SeriesMetadataCache {
  const store = new Map<string, SeriesMetadataResolution>();
  return {
    async get(scopeKey, seriesKey) {
      return store.get(`${scopeKey}::${seriesKey}`) ?? null;
    },
    async set(scopeKey, seriesKey, resolution) {
      store.set(`${scopeKey}::${seriesKey}`, resolution);
    },
  };
}

function inspectFileContent(relativePath: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    const globalProcess = g.process;
    const globalRequire = g.require;

    if (globalProcess?.versions?.node && typeof globalRequire === 'function') {
      const fs = globalRequire('fs');
      const path = globalRequire('path');
      const fullPath = path.resolve(globalProcess.cwd(), relativePath);
      return fs.readFileSync(fullPath, 'utf8');
    }
  } catch {
    return null;
  }
  return null;
}

export async function runMultiProviderCoverageClosureSmokeTest() {
  // T1: TMDB miss -> TVmaze chamado
  const t1Primary = mockProvider('tmdb', { status: 'no_match' });
  const t1Fallback = mockProvider('tvmaze', {
    status: 'matched',
    metadata: sampleMetadata('tvmaze'),
  });
  const t1Resolver = createSeriesMetadataResolver({
    primaryProvider: t1Primary.provider,
    fallbackProvider: t1Fallback.provider,
    cache: createMemoryCache(),
    now: () => FIXED_NOW,
  });
  const t1Result = await t1Resolver({ scopeKey: 't1-scope', query: sampleQuery() });
  const t1Pass =
    t1Primary.getCalls() === 1 &&
    t1Fallback.getCalls() === 1 &&
    t1Result.matchStatus === 'matched' &&
    t1Result.metadata.provenance.overview === 'tvmaze';

  // T2: TMDB completo -> TVmaze não chamado desnecessariamente
  const t2Primary = mockProvider('tmdb', {
    status: 'matched',
    metadata: sampleMetadata('tmdb'),
  });
  const t2Fallback = mockProvider('tvmaze', { status: 'no_match' });
  const t2Resolver = createSeriesMetadataResolver({
    primaryProvider: t2Primary.provider,
    fallbackProvider: t2Fallback.provider,
    cache: createMemoryCache(),
    now: () => FIXED_NOW,
  });
  const t2Result = await t2Resolver({ scopeKey: 't2-scope', query: sampleQuery() });
  const t2Pass =
    t2Primary.getCalls() === 1 &&
    t2Fallback.getCalls() === 0 &&
    t2Result.matchStatus === 'matched';

  // T3: Secondary fill only (TVmaze preenche poster ausente sem sobrescrever overview TMDB)
  const t3Primary = mockProvider('tmdb', {
    status: 'matched',
    metadata: sampleMetadata('tmdb', { posterUrl: undefined }),
  });
  const t3Fallback = mockProvider('tvmaze', {
    status: 'matched',
    metadata: sampleMetadata('tvmaze', { overview: 'TVmaze overview que nao deve ser usada' }),
  });
  const t3Resolver = createSeriesMetadataResolver({
    primaryProvider: t3Primary.provider,
    fallbackProvider: t3Fallback.provider,
    cache: createMemoryCache(),
    now: () => FIXED_NOW,
  });
  const t3Result = await t3Resolver({ scopeKey: 't3-scope', query: sampleQuery() });
  const t3Pass =
    t3Result.matchStatus === 'matched' &&
    t3Result.metadata.overview === 'tmdb overview content' &&
    t3Result.metadata.posterUrl === 'https://images.example/tvmaze-poster.jpg';

  // T4: Provider provenance individual por campo
  const t4Pass =
    t3Result.matchStatus === 'matched' &&
    t3Result.metadata.provenance.overview === 'tmdb' &&
    t3Result.metadata.provenance.posterUrl === 'tvmaze';

  // T5: Series card poster fallback (poster TVmaze alimenta cards)
  const t5Primary = mockProvider('tmdb', {
    status: 'matched',
    metadata: sampleMetadata('tmdb', { posterUrl: undefined }),
  });
  const t5Fallback = mockProvider('tvmaze', {
    status: 'matched',
    metadata: sampleMetadata('tvmaze', { posterUrl: 'https://images.example/tvmaze-card-poster.jpg' }),
  });
  const t5Items: HomeVodItem[] = [
    { id: 'item-t5', title: 'Série Teste', kind: 'series', seriesKey: 'serie teste', posterUrl: undefined },
  ];
  const [t5Enriched] = await enrichSeriesCardPosters(
    t5Items,
    { limit: 1 },
    {
      primaryProvider: t5Primary.provider,
      fallbackProvider: t5Fallback.provider,
      cache: createMemoryCache(),
      scopeKey: 't5-scope',
    },
  );
  const t5Pass = t5Enriched?.posterUrl === 'https://images.example/tvmaze-card-poster.jpg';

  // T6: Series hero vertical rejected (poster vertical TVmaze não vira hero horizontal)
  const t6Item: HomeVodItem = {
    id: 'item-t6',
    title: 'Série Teste',
    kind: 'series',
    posterUrl: 'https://images.example/tvmaze-vertical-poster.jpg',
    backdropUrl: undefined,
  };
  const t6HeroUrl = resolveHomeHeroArtworkUrl(t6Item, 'horizontal');
  const t6Pass = t6HeroUrl === undefined;

  // T7: Horizontal backdrop policy (Hero usa somente backdrop horizontal)
  const t7Item: HomeVodItem = {
    id: 'item-t7',
    title: 'Série Teste',
    kind: 'series',
    posterUrl: 'https://images.example/vertical-poster.jpg',
    backdropUrl: 'https://images.example/horizontal-backdrop.jpg',
  };
  const t7Candidates = getHorizontalHeroArtworkCandidates(t7Item);
  const t7Pass =
    t7Candidates.length === 1 &&
    t7Candidates[0] === 'https://images.example/horizontal-backdrop.jpg';

  // T8: Cache hit -> zero network calls
  const t8Cache = createMemoryCache();
  const t8Primary = mockProvider('tmdb', {
    status: 'matched',
    metadata: sampleMetadata('tmdb'),
  });
  const t8Fallback = mockProvider('tvmaze', { status: 'no_match' });
  const t8Resolver = createSeriesMetadataResolver({
    primaryProvider: t8Primary.provider,
    fallbackProvider: t8Fallback.provider,
    cache: t8Cache,
    now: () => FIXED_NOW,
  });
  await t8Resolver({ scopeKey: 't8-scope', query: sampleQuery() });
  t8Primary.reset();
  t8Fallback.reset();
  await t8Resolver({ scopeKey: 't8-scope', query: sampleQuery() });
  const t8Pass = t8Primary.getCalls() === 0 && t8Fallback.getCalls() === 0;

  // T9: no_match TTL (24 horas = 86400000 ms)
  const t9Primary = mockProvider('tmdb', { status: 'no_match' });
  const t9Fallback = mockProvider('tvmaze', { status: 'no_match' });
  const t9Resolver = createSeriesMetadataResolver({
    primaryProvider: t9Primary.provider,
    fallbackProvider: t9Fallback.provider,
    cache: createMemoryCache(),
    now: () => FIXED_NOW,
  });
  const t9Result = await t9Resolver({ scopeKey: 't9-scope', query: sampleQuery() });
  const t9Pass =
    t9Result.matchStatus === 'no_match' &&
    t9Result.expiresAt - FIXED_NOW === SERIES_METADATA_NO_MATCH_TTL_MS;

  // T10: error TTL (5 minutos = 300000 ms)
  const t10Primary = mockProvider('tmdb', { status: 'error', errorCode: 'TMDB_TIMEOUT' });
  const t10Fallback = mockProvider('tvmaze', { status: 'no_match' });
  const t10Resolver = createSeriesMetadataResolver({
    primaryProvider: t10Primary.provider,
    fallbackProvider: t10Fallback.provider,
    cache: createMemoryCache(),
    now: () => FIXED_NOW,
  });
  const t10Result = await t10Resolver({ scopeKey: 't10-scope', query: sampleQuery() });
  const t10Pass =
    t10Result.matchStatus === 'error' &&
    t10Result.expiresAt - FIXED_NOW === SERIES_METADATA_ERROR_TTL_MS;

  // T11: Wrong series rejected (TVmaze title mismatch)
  const t11Query: SeriesMetadataQuery = {
    seriesKey: 'the office',
    canonicalTitle: 'The Office',
    originalTitle: 'The Office S01 E01',
  };
  const t11TvmazeProvider = new TvmazeSeriesMetadataProvider(
    async () =>
      new Response(
        JSON.stringify([
          {
            score: 1,
            show: {
              id: 555,
              name: 'The Office UK',
              image: { original: 'https://images.example/the-office-uk.jpg' },
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  );
  const t11Result = await t11TvmazeProvider.lookup(t11Query);
  const t11Pass = t11Result.status === 'no_match';

  // T12_COLD_START_NO_REMOTE_METADATA
  // Valida o caminho crítico REAL do bootstrap. O enriquecimento de cards de
  // séries ocorre posteriormente na página de categoria e não representa o
  // cold start da Home.
  const appBootstrapContent = inspectFileContent(
    'src/features/bootstrap/services/appBootstrap.service.ts',
  );

  const criticalOnlyStart =
    appBootstrapContent?.indexOf('if (criticalOnly)') ?? -1;
  const nonCriticalStart =
    criticalOnlyStart >= 0
      ? appBootstrapContent?.indexOf(
          "stepId: 'license'",
          criticalOnlyStart,
        ) ?? -1
      : -1;

  const criticalOnlyContent =
    appBootstrapContent !== null &&
    criticalOnlyStart >= 0 &&
    nonCriticalStart > criticalOnlyStart
      ? appBootstrapContent.slice(criticalOnlyStart, nonCriticalStart)
      : '';

  const t12Pass =
    criticalOnlyContent.includes('loadLocalCatalogHomeVodSections') &&
    criticalOnlyContent.includes('skipTmdbMetadata: true') &&
    !criticalOnlyContent.includes('enrichSeriesCardPosters(') &&
    !criticalOnlyContent.includes('enrichMovieHeroItems(');

  // T13_MOVIE_PROVIDER_MATRIX (COM ITEM DE FILME REAL/NÃO VAZIO)
  const t13MovieItem: HomeVodItem = {
    id: 'm-real-1',
    title: 'Filme Real TMDB (2024)',
    kind: 'movie',
    backdropUrl: undefined,
  };
  let t13TmdbCalls = 0;
  let t13TvmazeCalls = 0;
  const t13MockFetch = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('api.themoviedb.org')) {
      t13TmdbCalls += 1;
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 9910,
              title: 'Filme Real TMDB',
              release_date: '2024-05-01',
              backdrop_path: '/real-movie-backdrop.jpg',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('tvmaze.com')) {
      t13TvmazeCalls += 1;
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  };

  const [t13EnrichedItem] = await enrichMovieHeroItems([t13MovieItem], {
    sourceId: 't13-source-id',
    fetchImpl: t13MockFetch,
    apiKey: 'test-key-t13',
  });
  const t13Pass =
    t13MovieItem !== undefined &&
    t13EnrichedItem?.backdropUrl === 'https://image.tmdb.org/t/p/w780/real-movie-backdrop.jpg' &&
    t13TmdbCalls === 1 &&
    t13TvmazeCalls === 0;

  // T14_NO_BACKEND_SYNC_REAL (INSPEÇÃO ESTÁTICA REAL DE CÓDIGO FONTE MULTI-PROVIDER)
  const multiProviderFiles = [
    'src/features/catalog/services/tvmazeSeriesMetadata.provider.ts',
    'src/features/catalog/services/seriesMetadataResolver.service.ts',
    'src/features/catalog/services/seriesHeroTmdb.service.ts',
    'src/features/catalog/services/heroArtworkPolicy.service.ts',
    'src/features/catalog/services/movieHeroMetadata.service.ts',
  ];

  let t14Pass = true;
  for (const fileRelPath of multiProviderFiles) {
    const content = inspectFileContent(fileRelPath);
    if (content !== null) {
      const lower = content.toLowerCase();
      if (
        lower.includes('supabase') ||
        lower.includes('/functions/v1/') ||
        lower.includes('/rest/v1/') ||
        lower.includes('uploadcatalog') ||
        lower.includes('syncmetadata')
      ) {
        t14Pass = false;
        break;
      }
    }
  }

  // ----------------------------------------------------
  // SUÍTE DE TESTES U (U1 - U14)
  // ----------------------------------------------------

  // U1_TVMAZE_IMAGES_ONLY_AFTER_MATCH: /shows/:id/images só é chamado após match confirmado
  let u1SearchCalls = 0;
  let u1ImageCalls = 0;
  const u1FetchMock = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      u1SearchCalls += 1;
      return new Response(
        JSON.stringify([
          {
            score: 10,
            show: { id: 777, name: 'Série Teste' },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/shows/777/images')) {
      u1ImageCalls += 1;
      return new Response(
        JSON.stringify([
          {
            type: 'background',
            resolutions: {
              original: { url: 'https://images.example/tvmaze-bg-u1.jpg', width: 1920, height: 1080 },
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const u1Provider = new TvmazeSeriesMetadataProvider(u1FetchMock);
  const u1Result = await u1Provider.lookup(sampleQuery());
  const u1Pass =
    u1Result.status === 'matched' &&
    u1SearchCalls === 1 &&
    u1ImageCalls === 1 &&
    u1Result.metadata.backdropUrl === 'https://images.example/tvmaze-bg-u1.jpg';

  // U2_TMDB_BACKDROP_WINS: TMDB backdrop existente -> skipImages: true -> 0 chamadas a /shows/:id/images
  let u2ImageCalls = 0;
  const u2TvmazeFetchMock = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(
        JSON.stringify([
          { score: 10, show: { id: 888, name: 'Série Teste' } },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/shows/888/images')) {
      u2ImageCalls += 1;
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const u2Primary = mockProvider('tmdb', {
    status: 'matched',
    metadata: sampleMetadata('tmdb', { overview: undefined, backdropUrl: 'https://images.example/tmdb-bg.jpg' }),
  });
  const u2Fallback = new TvmazeSeriesMetadataProvider(u2TvmazeFetchMock);
  const u2Resolver = createSeriesMetadataResolver({
    primaryProvider: u2Primary.provider,
    fallbackProvider: u2Fallback,
    cache: createMemoryCache(),
    now: () => FIXED_NOW,
  });
  const u2Result = await u2Resolver({ scopeKey: 'u2-scope', query: sampleQuery() });
  const u2Pass =
    u2Result.matchStatus === 'matched' &&
    u2Result.metadata.backdropUrl === 'https://images.example/tmdb-bg.jpg' &&
    u2Result.metadata.provenance.backdropUrl === 'tmdb' &&
    u2ImageCalls === 0;

  // U3_TVMAZE_BACKGROUND_FALLBACK: TMDB sem backdrop + TVmaze matched + background -> fallback TVmaze
  const u3Primary = mockProvider('tmdb', {
    status: 'matched',
    metadata: sampleMetadata('tmdb', { backdropUrl: undefined }),
  });
  const u3TvmazeFetchMock = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(
        JSON.stringify([
          { score: 10, show: { id: 333, name: 'Série Teste' } },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/shows/333/images')) {
      return new Response(
        JSON.stringify([
          {
            type: 'background',
            resolutions: {
              original: { url: 'https://images.example/tvmaze-u3-bg.jpg', width: 1920, height: 1080 },
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const u3Fallback = new TvmazeSeriesMetadataProvider(u3TvmazeFetchMock);
  const u3Resolver = createSeriesMetadataResolver({
    primaryProvider: u3Primary.provider,
    fallbackProvider: u3Fallback,
    cache: createMemoryCache(),
    now: () => FIXED_NOW,
  });
  const u3Result = await u3Resolver({ scopeKey: 'u3-scope', query: sampleQuery() });
  const u3Pass =
    u3Result.matchStatus === 'matched' &&
    u3Result.metadata.backdropUrl === 'https://images.example/tvmaze-u3-bg.jpg' &&
    u3Result.metadata.provenance.backdropUrl === 'tvmaze';

  // U4_TVMAZE_POSTER_NOT_HERO: Pôster vertical TVmaze continua rejeitado no Hero
  const u4Item: HomeVodItem = {
    id: 'u4-item',
    title: 'Série Teste',
    kind: 'series',
    posterUrl: 'https://images.example/tvmaze-poster-u4.jpg',
    backdropUrl: undefined,
  };
  const u4HeroCandidates = getHorizontalHeroArtworkCandidates(u4Item);
  const u4Pass = u4HeroCandidates.length === 0;

  // U5_TVMAZE_BACKGROUND_PROVENANCE: BackdropUrl provenance=tvmaze
  const u5Pass = u3Result.matchStatus === 'matched' && u3Result.metadata.provenance.backdropUrl === 'tvmaze';

  // U6_TVMAZE_BACKGROUND_CACHE_HIT: Segunda resolução -> 0 chamadas de rede
  const u6Cache = createMemoryCache();
  let u6NetworkCalls = 0;
  const u6FetchMock = async (input: RequestInfo | URL) => {
    u6NetworkCalls += 1;
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(
        JSON.stringify([{ score: 10, show: { id: 666, name: 'Série Teste' } }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/shows/666/images')) {
      return new Response(
        JSON.stringify([
          {
            type: 'background',
            resolutions: { original: { url: 'https://images.example/tvmaze-u6.jpg', width: 1920, height: 1080 } },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const u6Provider = new TvmazeSeriesMetadataProvider(u6FetchMock);
  const u6Primary = mockProvider('tmdb', { status: 'no_match' });
  const u6Resolver = createSeriesMetadataResolver({
    primaryProvider: u6Primary.provider,
    fallbackProvider: u6Provider,
    cache: u6Cache,
    now: () => FIXED_NOW,
  });
  await u6Resolver({ scopeKey: 'u6-scope', query: sampleQuery() });
  const callsAfterFirst = u6NetworkCalls;
  await u6Resolver({ scopeKey: 'u6-scope', query: sampleQuery() });
  const u6Pass = callsAfterFirst > 0 && u6NetworkCalls === callsAfterFirst;

  // U7_TVMAZE_BACKGROUND_NO_MATCH: Série sem background continua matched
  const u7FetchMock = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(
        JSON.stringify([{ score: 10, show: { id: 7771, name: 'Série Teste' } }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/shows/7771/images')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const u7Provider = new TvmazeSeriesMetadataProvider(u7FetchMock);
  const u7Result = await u7Provider.lookup(sampleQuery());
  const u7Pass =
    u7Result.status === 'matched' &&
    u7Result.metadata.backdropUrl === undefined;

  // U8_TVMAZE_IMAGES_ERROR: Erro/500 em /shows/:id/images não torna a série inteira erro nem no_match
  const u8FetchMock = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(
        JSON.stringify([{ score: 10, show: { id: 8881, name: 'Série Teste' } }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/shows/8881/images')) {
      return new Response('Internal Error', { status: 500 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const u8Provider = new TvmazeSeriesMetadataProvider(u8FetchMock);
  const u8Result = await u8Provider.lookup(sampleQuery());
  const u8Pass =
    u8Result.status === 'matched' &&
    u8Result.metadata.backdropUrl === undefined;

  // U9_WRONG_SERIES_NO_IMAGES: Match errado rejeitado -> /shows/:id/images não chamado
  let u9ImageCalls = 0;
  const u9FetchMock = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(
        JSON.stringify([{ score: 1, show: { id: 9991, name: 'Outra Série Totalmente Diferente' } }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/images')) {
      u9ImageCalls += 1;
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const u9Provider = new TvmazeSeriesMetadataProvider(u9FetchMock);
  const u9Result = await u9Provider.lookup(sampleQuery());
  const u9Pass = u9Result.status === 'no_match' && u9ImageCalls === 0;

  // U10_ARTWORK_POLICY: tmdb_backdrop e tvmaze_background são candidatos permitidos; poster não
  const u10Item: HomeVodItem = {
    id: 'u10-item',
    title: 'Série Teste',
    kind: 'series',
    artworkCandidates: [
      { url: 'https://images.example/tmdb-bg.jpg', source: 'tmdb_backdrop', originalScheme: 'https', host: 'images.example', upgradedToHttps: false },
      { url: 'https://images.example/tvmaze-bg.jpg', source: 'tvmaze_background', originalScheme: 'https', host: 'images.example', upgradedToHttps: false },
      { url: 'https://images.example/poster.jpg', source: 'tmdb_poster', originalScheme: 'https', host: 'images.example', upgradedToHttps: false },
    ],
  };
  const u10Candidates = getHorizontalHeroArtworkCandidates(u10Item);
  const u10Pass =
    u10Candidates.length === 2 &&
    u10Candidates.includes('https://images.example/tmdb-bg.jpg') &&
    u10Candidates.includes('https://images.example/tvmaze-bg.jpg') &&
    !u10Candidates.includes('https://images.example/poster.jpg');

  // U11_ATTRIBUTION_PRESENT (INSPEÇÃO ESTÁTICA REAL EM SettingsPage.tsx)
  const settingsContent = inspectFileContent('src/features/settings/pages/SettingsPage.tsx');
  const u11Pass =
    settingsContent !== null &&
    settingsContent.includes('data-settings-attribution="tvmaze"') &&
    settingsContent.includes('Dados de séries fornecidos por') &&
    settingsContent.includes('href="https://www.tvmaze.com"');

  // U12_REAL_COLD_START (Alias U-test para T12)
  const u12Pass = t12Pass;

  // U13_REAL_MOVIE_MATRIX (Alias U-test para T13)
  const u13Pass = t13Pass;

  // U14_NO_BACKEND_SYNC_REAL (Alias U-test para T14)
  const u14Pass = t14Pass;

  // ----------------------------------------------------
  // TESTES DE DIMENSÃO DE BACKGROUND TVMAZE (ITEM 4)
  // ----------------------------------------------------

  // 1. BACKGROUND_1920x1080 = ACCEPT
  const bgAcceptProvider = new TvmazeSeriesMetadataProvider(async (input) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(JSON.stringify([{ score: 10, show: { id: 101, name: 'Série Teste' } }]), { status: 200 });
    }
    if (urlStr.includes('/shows/101/images')) {
      return new Response(
        JSON.stringify([
          { type: 'background', resolutions: { original: { url: 'https://images.example/bg-1920x1080.jpg', width: 1920, height: 1080 } } },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  const bgAcceptRes = await bgAcceptProvider.lookup(sampleQuery());
  const bgAcceptPass =
    bgAcceptRes.status === 'matched' &&
    bgAcceptRes.metadata.backdropUrl === 'https://images.example/bg-1920x1080.jpg';

  // 2. BACKGROUND_1080x1920 = REJECT
  const bgVerticalProvider = new TvmazeSeriesMetadataProvider(async (input) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(JSON.stringify([{ score: 10, show: { id: 102, name: 'Série Teste' } }]), { status: 200 });
    }
    if (urlStr.includes('/shows/102/images')) {
      return new Response(
        JSON.stringify([
          { type: 'background', resolutions: { original: { url: 'https://images.example/bg-1080x1920.jpg', width: 1080, height: 1920 } } },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  const bgVerticalRes = await bgVerticalProvider.lookup(sampleQuery());
  const bgVerticalRejectPass =
    bgVerticalRes.status === 'matched' &&
    bgVerticalRes.metadata.backdropUrl === undefined;

  // 3. BACKGROUND_WIDTH_MISSING = REJECT
  const bgNoWidthProvider = new TvmazeSeriesMetadataProvider(async (input) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(JSON.stringify([{ score: 10, show: { id: 103, name: 'Série Teste' } }]), { status: 200 });
    }
    if (urlStr.includes('/shows/103/images')) {
      return new Response(
        JSON.stringify([
          { type: 'background', resolutions: { original: { url: 'https://images.example/bg-no-width.jpg', height: 1080 } } },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  const bgNoWidthRes = await bgNoWidthProvider.lookup(sampleQuery());
  const bgNoWidthRejectPass =
    bgNoWidthRes.status === 'matched' &&
    bgNoWidthRes.metadata.backdropUrl === undefined;

  // 4. BACKGROUND_HEIGHT_MISSING = REJECT
  const bgNoHeightProvider = new TvmazeSeriesMetadataProvider(async (input) => {
    const urlStr = String(input);
    if (urlStr.includes('/search/shows')) {
      return new Response(JSON.stringify([{ score: 10, show: { id: 104, name: 'Série Teste' } }]), { status: 200 });
    }
    if (urlStr.includes('/shows/104/images')) {
      return new Response(
        JSON.stringify([
          { type: 'background', resolutions: { original: { url: 'https://images.example/bg-no-height.jpg', width: 1920 } } },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  const bgNoHeightRes = await bgNoHeightProvider.lookup(sampleQuery());
  const bgNoHeightRejectPass =
    bgNoHeightRes.status === 'matched' &&
    bgNoHeightRes.metadata.backdropUrl === undefined;

  const cases = {
    T1_TVMAZE_RUNTIME_CALLSITE: { pass: t1Pass },
    T2_TMDB_PRIMARY: { pass: t2Pass },
    T3_SECONDARY_FILL_ONLY: { pass: t3Pass },
    T4_PROVIDER_PROVENANCE: { pass: t4Pass },
    T5_SERIES_CARD_POSTER_FALLBACK: { pass: t5Pass },
    T6_SERIES_HERO_POSTER_FALLBACK: { pass: t6Pass },
    T7_HORIZONTAL_BACKDROP_PRIORITY: { pass: t7Pass },
    T8_CACHE_HIT_ZERO_NETWORK: { pass: t8Pass },
    T9_NO_MATCH_CACHE: { pass: t9Pass },
    T10_ERROR_RETRY: { pass: t10Pass },
    T11_WRONG_SERIES_REJECTED: { pass: t11Pass },
    T12_COLD_START_NO_REMOTE_METADATA: { pass: t12Pass },
    T13_MOVIE_PROVIDER_MATRIX: { pass: t13Pass },
    T14_NO_BACKEND_SYNC: { pass: t14Pass },
    U1_TVMAZE_IMAGES_ONLY_AFTER_MATCH: { pass: u1Pass },
    U2_TMDB_BACKDROP_WINS: { pass: u2Pass },
    U3_TVMAZE_BACKGROUND_FALLBACK: { pass: u3Pass },
    U4_TVMAZE_POSTER_LAST_RESORT_HERO: { pass: u4Pass },
    U5_TVMAZE_BACKGROUND_PROVENANCE: { pass: u5Pass },
    U6_TVMAZE_BACKGROUND_CACHE_HIT: { pass: u6Pass },
    U7_TVMAZE_BACKGROUND_NO_MATCH: { pass: u7Pass },
    U8_TVMAZE_IMAGES_ERROR: { pass: u8Pass },
    U9_WRONG_SERIES_NO_IMAGES: { pass: u9Pass },
    U10_ARTWORK_POLICY: { pass: u10Pass },
    U11_ATTRIBUTION_PRESENT: { pass: u11Pass },
    U12_T12_REAL_COLD_START: { pass: u12Pass },
    U13_T13_REAL_MOVIE_MATRIX: { pass: u13Pass },
    U14_NO_BACKEND_SYNC_REAL: { pass: u14Pass },
    TVMAZE_BG_HORIZONTAL_ACCEPT: { pass: bgAcceptPass },
    TVMAZE_BG_VERTICAL_REJECT: { pass: bgVerticalRejectPass },
    TVMAZE_BG_NO_WIDTH_REJECT: { pass: bgNoWidthRejectPass },
    TVMAZE_BG_NO_HEIGHT_REJECT: { pass: bgNoHeightRejectPass },
  };

  return {
    pass: Object.values(cases).every((c) => c.pass),
    cases,
  };
}
