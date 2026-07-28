import {
  mapLocalCatalogItemToHomeVodItem,
} from '../readModels/localCatalogHomeVodAdapter.service';
import type {
  LocalCatalogItem,
  LocalTmdbMetadata,
} from '../types/localCatalog.types';
import {
  classifyLocalCatalogArtworkUrl,
  resolveLocalCatalogArtwork,
} from './localCatalogArtwork.service';

export type LocalCatalogArtworkSmokeTestResult = {
  ok: boolean;
  tvgValidHttps: boolean;
  tvgValidHttpClassified: boolean;
  tvgInvalid: boolean;
  tmdbPosterFallback: boolean;
  tmdbBackdropFallback: boolean;
  tmdbJoinBySourceItemId: boolean;
  itemWithoutAnyArtwork: boolean;
  homeArtworkResolution: boolean;
  moviesArtworkResolution: boolean;
  seriesArtworkResolution: boolean;
  noStreamUrlAsArtwork: boolean;
};

const ITEM_ID = 'artwork-smoke-item';

function item(
  contentKind: 'movie' | 'series',
  tvgLogo: string | null,
): LocalCatalogItem {
  return {
    id: ITEM_ID,
    sourceId: 'artwork-smoke-source',
    sourceType: 'm3u',
    name: 'Item de teste',
    rawName: 'Item de teste',
    normalizedName: 'item de teste',
    groupTitle: 'Grupo de teste',
    normalizedGroup: 'grupo de teste',
    contentKind,
    streamUrl: 'https://stream.example.invalid/not-artwork.m3u8',
    tvgLogo,
    classificationVersion: 1,
    importSessionId: 'previous-success',
    createdAt: '2026-07-23T12:00:00.000Z',
    updatedAt: '2026-07-23T12:00:00.000Z',
  };
}

function tmdbMetadata(
  posterPath: string | null,
  backdropPath: string | null,
): LocalTmdbMetadata {
  return {
    id: 'artwork-smoke-metadata',
    sourceItemId: ITEM_ID,
    tmdbId: 123,
    title: 'Item com metadata local',
    posterPath,
    backdropPath,
    matchStatus: 'matched',
    updatedAt: '2026-07-23T12:00:00.000Z',
  };
}

export async function runLocalCatalogArtworkSmokeTest(): Promise<LocalCatalogArtworkSmokeTestResult> {
  const httpsItem = item(
    'movie',
    'https://images.example.invalid/poster.jpg',
  );
  const httpItem = item(
    'movie',
    'http://images.example.invalid/poster.jpg',
  );
  const invalidItem = item('movie', 'javascript:alert(1)');
  const posterMetadata = tmdbMetadata('/poster.jpg', '/backdrop.jpg');
  const backdropOnlyMetadata = tmdbMetadata(null, '/backdrop.jpg');
  const httpsResolution = resolveLocalCatalogArtwork(httpsItem);
  const httpResolution = resolveLocalCatalogArtwork(httpItem);
  const invalidResolution = resolveLocalCatalogArtwork(invalidItem);
  const posterFallbackResolution = resolveLocalCatalogArtwork(
    item('movie', null),
    posterMetadata,
  );
  const backdropFallbackResolution = resolveLocalCatalogArtwork(
    item('series', null),
    backdropOnlyMetadata,
  );
  const metadataBySourceItemId = new Map([
    [posterMetadata.sourceItemId, posterMetadata],
  ]);
  const joinedViewModel = mapLocalCatalogItemToHomeVodItem(
    item('movie', null),
    undefined,
    metadataBySourceItemId.get(ITEM_ID),
  );
  const placeholderResolution = resolveLocalCatalogArtwork(
    item('series', null),
  );
  const movieViewModel = mapLocalCatalogItemToHomeVodItem(httpsItem);
  const seriesViewModel = mapLocalCatalogItemToHomeVodItem(
    item('series', null),
    undefined,
    posterMetadata,
  );
  const streamOnlyItem = item('movie', null);
  streamOnlyItem.streamUrl =
    'https://images.example.invalid/must-not-be-used.jpg';
  const streamOnlyResolution = resolveLocalCatalogArtwork(streamOnlyItem);
  const assertions = {
    tvgValidHttps:
      classifyLocalCatalogArtworkUrl(httpsItem.tvgLogo) === 'valid_https' &&
      httpsResolution.posterUrl === httpsItem.tvgLogo,
    tvgValidHttpClassified:
      classifyLocalCatalogArtworkUrl(httpItem.tvgLogo) === 'valid_http' &&
      httpResolution.posterCandidates.length === 2 &&
      httpResolution.posterCandidates[0]?.originalScheme === 'http' &&
      httpResolution.posterCandidates[0]?.url === httpItem.tvgLogo &&
      httpResolution.posterCandidates[0]?.upgradedToHttps === false &&
      httpResolution.posterCandidates[1]?.originalScheme === 'http' &&
      httpResolution.posterCandidates[1]?.url ===
        'https://images.example.invalid/poster.jpg' &&
      httpResolution.posterCandidates[1]?.upgradedToHttps === true,
    tvgInvalid:
      classifyLocalCatalogArtworkUrl(invalidItem.tvgLogo) === 'invalid' &&
      invalidResolution.posterCandidates.length === 0,
    tmdbPosterFallback:
      posterFallbackResolution.posterUrl ===
        'https://image.tmdb.org/t/p/w500/poster.jpg',
    tmdbBackdropFallback:
      backdropFallbackResolution.posterUrl ===
        'https://image.tmdb.org/t/p/w780/backdrop.jpg' &&
      backdropFallbackResolution.backdropUrl ===
        'https://image.tmdb.org/t/p/w780/backdrop.jpg',
    tmdbJoinBySourceItemId:
      joinedViewModel.posterUrl ===
        'https://image.tmdb.org/t/p/w500/poster.jpg' &&
      posterMetadata.sourceItemId === ITEM_ID,
    itemWithoutAnyArtwork:
      placeholderResolution.posterUrl === undefined &&
      placeholderResolution.backdropUrl === undefined &&
      placeholderResolution.posterCandidates.length === 0,
    homeArtworkResolution:
      joinedViewModel.artworkCandidates?.length === 2,
    moviesArtworkResolution:
      movieViewModel.posterUrl === httpsItem.tvgLogo,
    seriesArtworkResolution:
      seriesViewModel.posterUrl ===
        'https://image.tmdb.org/t/p/w500/poster.jpg',
    noStreamUrlAsArtwork:
      streamOnlyResolution.posterCandidates.length === 0 &&
      streamOnlyResolution.posterUrl === undefined,
  };

  return {
    ok: Object.values(assertions).every(Boolean),
    ...assertions,
  };
}
