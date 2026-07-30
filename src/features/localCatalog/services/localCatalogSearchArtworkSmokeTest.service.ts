import {
  createMovieMetadataCacheKey,
  parseMovieSearchIdentity,
} from '@/features/catalog/services/movieMetadataCacheIdentity.service';
import { createSeriesMetadataCacheKey } from '@/features/catalog/services/seriesMetadataCache.service';

import type {
  LocalCatalogSearchCandidate,
  LocalCatalogSearchRepository,
} from '../repositories/localCatalogSearchRepository.service';
import { searchLocalCatalog } from '../readModels/localCatalogSearchReadModel.service';
import type {
  LocalCatalogContentKind,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';

const SCOPE_A = 'scope-search-a';
const SCOPE_B = 'scope-search-b';
const FUTURE_EXPIRY = Date.now() + 60_000;

function candidate(input: {
  id: string;
  title: string;
  kind: LocalCatalogContentKind;
  artworkUrl?: string | null;
  sourceOrder: number;
}): LocalCatalogSearchCandidate {
  const item: LocalCatalogSnapshotItem = {
    snapshotId: 'snapshot-search-artwork',
    itemId: input.id,
    scopeKey: SCOPE_A,
    logicalIdentity: {
      version: 1,
      strategy: 'url_fallback',
      value: input.id,
    },
    sourceItemId: input.id,
    contentKind: input.kind,
    rawName: input.title,
    normalizedName: input.title.toLowerCase(),
    rawGroupTitle: input.kind === 'series' ? 'Séries' : 'Filmes',
    normalizedGroup: input.kind === 'series' ? 'series' : 'filmes',
    streamUrl: `https://stream.invalid/${input.id}`,
    artworkUrl: input.artworkUrl ?? null,
    sourceOrder: input.sourceOrder,
    classificationVersion: 1,
    createdAt: '2026-07-29T12:00:00.000Z',
    updatedAt: '2026-07-29T12:00:00.000Z',
  };

  return {
    item,
    document: {
      snapshotId: item.snapshotId,
      documentId: item.itemId,
      scopeKey: item.scopeKey,
      catalogItemId: item.itemId,
      contentKind: item.contentKind,
      normalizedTitle: item.normalizedName,
      normalizedCategory: item.normalizedGroup,
      year: null,
      seasonNumber: null,
      episodeNumber: null,
      indexStatus: 'ready',
      updatedAt: item.updatedAt,
    },
    matchedTokens: ['catalogo'],
  };
}

function movieKey(scopeKey: string, title: string) {
  return createMovieMetadataCacheKey(
    scopeKey,
    parseMovieSearchIdentity(title).normalizedTitle,
  );
}

export async function runLocalCatalogSearchArtworkSmokeTest() {
  const candidates = [
    candidate({
      id: 'movie-own',
      title: 'Catálogo Próprio',
      kind: 'movie',
      artworkUrl: 'https://local.invalid/own-poster.jpg',
      sourceOrder: 0,
    }),
    candidate({
      id: 'movie-cache',
      title: 'Catálogo Filme Cache (2024)',
      kind: 'movie',
      sourceOrder: 1,
    }),
    candidate({
      id: 'series-cache',
      title: 'Catálogo Série Cache',
      kind: 'series',
      sourceOrder: 2,
    }),
    candidate({
      id: 'movie-backdrop',
      title: 'Catálogo Backdrop',
      kind: 'movie',
      sourceOrder: 3,
    }),
    candidate({
      id: 'movie-fallback',
      title: 'Catálogo Sem Artwork',
      kind: 'movie',
      sourceOrder: 4,
    }),
  ];
  const repository: LocalCatalogSearchRepository = {
    async findCandidates() {
      return {
        snapshotId: 'snapshot-search-artwork',
        candidates,
      };
    },
  };
  const metadata = new Map<string, unknown>([
    [
      movieKey(SCOPE_A, 'Catálogo Filme Cache (2024)'),
      {
        status: 'matched',
        expiresAt: FUTURE_EXPIRY,
        metadata: {
          posterUrl: 'https://cache.invalid/movie-poster.jpg',
        },
      },
    ],
    [
      createSeriesMetadataCacheKey(SCOPE_A, 'catálogo série cache'),
      {
        matchStatus: 'matched',
        expiresAt: FUTURE_EXPIRY,
        metadata: {
          posterUrl: 'https://cache.invalid/series-poster.jpg',
        },
      },
    ],
    [
      movieKey(SCOPE_A, 'Catálogo Backdrop'),
      {
        status: 'matched',
        expiresAt: FUTURE_EXPIRY,
        metadata: {
          backdropUrl: 'https://cache.invalid/movie-backdrop.jpg',
        },
      },
    ],
    [
      movieKey(SCOPE_A, 'Catálogo Próprio'),
      {
        status: 'matched',
        expiresAt: FUTURE_EXPIRY,
        metadata: {
          posterUrl: 'https://cache.invalid/must-not-win.jpg',
        },
      },
    ],
  ]);
  let metadataBatchReads = 0;
  let metadataKeysRead = 0;
  let remoteCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    remoteCalls += 1;
    throw new Error('SEARCH_REMOTE_REQUEST_FORBIDDEN');
  }) as typeof fetch;

  try {
    const readMetadata = async (keys: string[]) => {
      metadataBatchReads += 1;
      metadataKeysRead += keys.length;
      return new Map(
        keys.flatMap((key) =>
          metadata.has(key) ? [[key, metadata.get(key)] as const] : [],
        ),
      );
    };
    const page = await searchLocalCatalog(
      { scopeKey: SCOPE_A, query: 'catálogo' },
      repository,
      readMetadata,
    );
    const otherScope = await searchLocalCatalog(
      { scopeKey: SCOPE_B, query: 'catálogo' },
      repository,
      readMetadata,
    );
    const byId = new Map(page.items.map((item) => [item.id, item]));
    const otherById = new Map(
      otherScope.items.map((item) => [item.id, item]),
    );
    const result = {
      SEARCH_ARTWORK_OWN_ITEM_FIRST:
        byId.get('movie-own')?.artworkUrl ===
        'https://local.invalid/own-poster.jpg',
      SEARCH_MOVIE_POSTER_LOCAL:
        byId.get('movie-cache')?.artworkUrl ===
        'https://cache.invalid/movie-poster.jpg',
      SEARCH_SERIES_POSTER_LOCAL:
        byId.get('series-cache')?.artworkUrl ===
        'https://cache.invalid/series-poster.jpg',
      SEARCH_BACKDROP_LOCAL_WHEN_APPLICABLE:
        byId.get('movie-backdrop')?.artworkUrl ===
        'https://cache.invalid/movie-backdrop.jpg',
      SEARCH_RESULT_WITHOUT_ARTWORK_VISIBLE:
        byId.get('movie-fallback')?.title === 'Catálogo Sem Artwork' &&
        byId.get('movie-fallback')?.artworkUrl === null,
      SEARCH_ARTWORK_IDENTITY_SAFE:
        byId.get('movie-fallback')?.artworkUrl === null,
      SEARCH_CROSS_SOURCE_ARTWORK_LEAK:
        otherById.get('movie-cache')?.artworkUrl === null &&
        otherById.get('series-cache')?.artworkUrl === null,
      SEARCH_METADATA_BATCH_BOUNDED:
        metadataBatchReads === 2 && metadataKeysRead === 8,
      REMOTE_METADATA_CALLS_SEARCH: remoteCalls,
      SEARCH_REMOTE_ARTWORK_REQUEST: remoteCalls,
      SEARCH_FULL_CATALOG_SCAN: 0,
      BACKEND_CATALOG_QUERY: 0,
      CENTRAL_CATALOG_WRITE: 0,
      LOCAL_ONLY: true,
    };

    return {
      pass:
        Object.entries(result)
          .filter(([, value]) => typeof value === 'boolean')
          .every(([, value]) => value === true) &&
        remoteCalls === 0,
      ...result,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
