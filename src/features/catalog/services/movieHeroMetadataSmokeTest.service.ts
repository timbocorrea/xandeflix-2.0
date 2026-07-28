import {
  enrichMovieHeroItems,
  MOVIE_HERO_CACHE_PREFIX,
  normalizeMovieTitle,
  parseMovieSearchIdentity,
} from './movieHeroMetadata.service';
import type { HomeVodItem } from './homeVod.service';
import { putLocalCatalogMetadata } from '@/features/localCatalog/services/localCatalogDb.service';

function sampleItem(id: string, title: string): HomeVodItem {
  return {
    id,
    title,
    kind: 'movie',
  };
}

export async function runMovieHeroMetadataSmokeTest() {
  // Q1: "A Influencer (2024)" -> cleanTitle="A Influencer", year="2024"
  const q1 = parseMovieSearchIdentity('A Influencer (2024)');
  const q1Pass =
    q1.cleanTitle === 'A Influencer' &&
    q1.year === '2024' &&
    q1.normalizedTitle === 'a influencer';

  // Q2: "1917" -> normalized title "1917", not empty
  const q2Title = normalizeMovieTitle('1917');
  const q2Identity = parseMovieSearchIdentity('1917');
  const q2Pass = q2Title === '1917' && q2Identity.cleanTitle === '1917' && q2Identity.normalizedTitle === '1917';

  // Q3: "1992" -> normalized title "1992", not empty
  const q3Title = normalizeMovieTitle('1992');
  const q3Identity = parseMovieSearchIdentity('1992');
  const q3Pass = q3Title === '1992' && q3Identity.cleanTitle === '1992' && q3Identity.normalizedTitle === '1992';

  // Q4 & Q5: Fetch metadata with mock fetchImpl
  let lastUrl = '';
  const mockFetch = async (input: RequestInfo | URL) => {
    lastUrl = String(input);
    if (lastUrl.includes('A%20Influencer') || lastUrl.includes('A+Influencer')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 1,
              title: 'Filme Totalmente Diferente',
              original_title: 'Unrelated Movie',
              backdrop_path: '/unrelated.jpg',
            },
            {
              id: 2,
              title: 'A Influencer',
              original_title: 'Dziewczyna influencera',
              release_date: '2024-02-02',
              backdrop_path: '/influencer-backdrop.jpg',
              poster_path: '/influencer-poster.jpg',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (lastUrl.includes('Diferente')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 3,
              title: 'Algum Outro Filme',
              original_title: 'Another Movie',
              backdrop_path: '/other.jpg',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };

  // Q4: Different title candidate -> rejected
  const [enrichedQ4] = await enrichMovieHeroItems(
    [sampleItem('m-diff', 'Titulo Que Nao Bate')],
    {
      sourceId: 'smoke-test-source-q4',
      fetchImpl: mockFetch,
      apiKey: 'test-key',
    },
  );
  const q4Pass = enrichedQ4?.backdropUrl === undefined;

  // Q5: Exact match -> accepted
  const [enrichedQ5] = await enrichMovieHeroItems(
    [sampleItem('m-inf', 'A Influencer (2024)')],
    {
      sourceId: 'smoke-test-source-q5',
      fetchImpl: mockFetch,
      apiKey: 'test-key',
    },
  );
  const q5Pass =
    enrichedQ5?.backdropUrl === 'https://image.tmdb.org/t/p/w780/influencer-backdrop.jpg' &&
    lastUrl.includes('query=A+Influencer') &&
    lastUrl.includes('year=2024');

  // Q6: Old v1 cache key is bypassed, new v2 key is used
  // Populate v1 cache with no_match for item
  const oldV1Key = `movie-hero-metadata:v1::smoke-test-source-q6::a influencer`;
  await putLocalCatalogMetadata({
    key: oldV1Key,
    value: {
      status: 'no_match',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    },
    updatedAt: new Date().toISOString(),
  }).catch(() => undefined);

  const [enrichedQ6] = await enrichMovieHeroItems(
    [sampleItem('m-inf-q6', 'A Influencer (2024)')],
    {
      sourceId: 'smoke-test-source-q6',
      fetchImpl: mockFetch,
      apiKey: 'test-key',
    },
  );
  const q6Pass =
    MOVIE_HERO_CACHE_PREFIX === 'movie-hero-metadata:v2' &&
    enrichedQ6?.backdropUrl === 'https://image.tmdb.org/t/p/w780/influencer-backdrop.jpg';

  const cases = {
    Q1: { pass: q1Pass, cleanTitle: q1.cleanTitle, year: q1.year },
    Q2: { pass: q2Pass, title: q2Title },
    Q3: { pass: q3Pass, title: q3Title },
    Q4: { pass: q4Pass },
    Q5: { pass: q5Pass, backdropUrl: enrichedQ5?.backdropUrl },
    Q6: { pass: q6Pass, cachePrefix: MOVIE_HERO_CACHE_PREFIX },
  };

  return {
    pass: Object.values(cases).every((c) => c.pass),
    cases,
  };
}
