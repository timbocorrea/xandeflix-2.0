import type { HomeVodItem } from '../../catalog/services/homeVod.service';
import type { CatalogRepository } from '../repositories/catalogRepository.types';
import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import {
  mapLocalCatalogItemsToHomeVodItems,
  mapLocalCatalogSeriesItemsToHomeVodItems,
} from './localCatalogHomeVodAdapter.service';
import { normalizeLocalCatalogGroupIdentity } from '../services/localCatalogGroupIdentity.service';
import { isLocalCatalogReadable } from '../services/localCatalogReadability.service';
import type { LocalTmdbMetadata } from '../types/localCatalog.types';

export const HOME_DISCOVERY_MOVIE_CANDIDATE_LIMIT = 40;
export const HOME_DISCOVERY_SERIES_RAW_READ_LIMIT = 80;

export type DiscoveryCandidateReadStatus = 'ready' | 'defer' | 'unavailable';

export type LocalCatalogDiscoveryGenerationDescriptor = {
  sourceId: string;
  classificationVersion: number;
  lastSuccessfulImportAt: string;
};

export type LoadLocalCatalogDiscoveryGroupCandidatesOptions = {
  sourceId: string;
  contentKind: 'movie' | 'series';
  groupTitle: string;
  skipTmdbMetadata?: boolean;
  movieCandidateLimit?: number;
  seriesRawReadLimit?: number;
};

export type LoadLocalCatalogDiscoveryGroupCandidatesResult = {
  status: DiscoveryCandidateReadStatus;
  generation?: LocalCatalogDiscoveryGenerationDescriptor;
  items: HomeVodItem[];
};

/**
 * Normaliza o limite de leitura garantindo um teto máximo rígido (Hard Cap)
 * e tratando valores inválidos (NaN, Infinity, <= 0, undefined).
 */
function sanitizeReadLimit(
  requestedLimit: number | undefined,
  defaultAndMaxCap: number,
): number {
  if (
    requestedLimit === undefined ||
    typeof requestedLimit !== 'number' ||
    !Number.isFinite(requestedLimit) ||
    Number.isNaN(requestedLimit) ||
    requestedLimit <= 0
  ) {
    return defaultAndMaxCap;
  }

  return Math.min(Math.floor(requestedLimit), defaultAndMaxCap);
}

/**
 * Lê candidatos reais do IndexedDB local delimitados por grupo para o Discovery.
 *
 * REGRAS ARQUITETURAIS:
 * 1. Somente cria novo pool quando metadata.status === 'ready' e legível.
 * 2. Em estado 'importing', 'failed' ou 'canceled', retorna status 'defer' com items=[].
 * 3. Não executa listCategories() nem scans globais.
 * 4. Respeita os limites hard-capped: 40 para filmes e 80 para raw items de séries.
 * 5. Rejeita grupos cuja identidade normalizada resulte em string vazia.
 */
export async function loadLocalCatalogDiscoveryGroupCandidates(
  options: LoadLocalCatalogDiscoveryGroupCandidatesOptions,
  repository: CatalogRepository = localCatalogRepository,
): Promise<LoadLocalCatalogDiscoveryGroupCandidatesResult> {
  const sourceId = options.sourceId?.trim();
  const groupTitle = options.groupTitle?.trim();
  const contentKind = options.contentKind;

  if (
    !sourceId ||
    !groupTitle ||
    (contentKind !== 'movie' && contentKind !== 'series')
  ) {
    return {
      status: 'unavailable',
      items: [],
    };
  }

  const normalizedGroup = normalizeLocalCatalogGroupIdentity(groupTitle);
  const usableIdentity = normalizedGroup.replace(/[^a-z0-9]/gi, '').trim();

  if (
    !normalizedGroup ||
    normalizedGroup.trim().length === 0 ||
    usableIdentity.length === 0
  ) {
    return {
      status: 'unavailable',
      items: [],
    };
  }

  const metadata = await repository.getImportMetadata(sourceId);
  if (!metadata) {
    return {
      status: 'unavailable',
      items: [],
    };
  }

  if (metadata.sourceId && metadata.sourceId !== sourceId) {
    return {
      status: 'unavailable',
      items: [],
    };
  }

  if (
    metadata.status === 'importing' ||
    metadata.status === 'failed' ||
    metadata.status === 'canceled'
  ) {
    return {
      status: 'defer',
      items: [],
    };
  }

  if (metadata.status !== 'ready' || !isLocalCatalogReadable(metadata)) {
    return {
      status: 'unavailable',
      items: [],
    };
  }

  const lastSuccessfulImportAt =
    metadata.lastSuccessfulImportAt ?? metadata.completedAt;

  if (!lastSuccessfulImportAt) {
    return {
      status: 'unavailable',
      items: [],
    };
  }

  const generation: LocalCatalogDiscoveryGenerationDescriptor = {
    sourceId,
    classificationVersion: metadata.classificationVersion ?? 1,
    lastSuccessfulImportAt,
  };

  const skipTmdb = Boolean(options.skipTmdbMetadata);

  if (contentKind === 'movie') {
    const movieLimit = sanitizeReadLimit(
      options.movieCandidateLimit,
      HOME_DISCOVERY_MOVIE_CANDIDATE_LIMIT,
    );

    const rawItems = await repository.listItems({
      sourceId,
      contentKind: 'movie',
      normalizedGroup,
      limit: movieLimit,
    });

    let tmdbMap = new Map<string, LocalTmdbMetadata>();
    if (!skipTmdb && rawItems.length > 0 && repository.getTmdbMetadataBySourceItemIds) {
      const itemIds = rawItems.map((item) => item.id);
      tmdbMap = await repository.getTmdbMetadataBySourceItemIds(itemIds);
    }

    const items = mapLocalCatalogItemsToHomeVodItems(
      rawItems,
      groupTitle,
      tmdbMap,
    );

    return {
      status: 'ready',
      generation,
      items,
    };
  }

  const seriesLimit = sanitizeReadLimit(
    options.seriesRawReadLimit,
    HOME_DISCOVERY_SERIES_RAW_READ_LIMIT,
  );

  const rawItems = await repository.listItems({
    sourceId,
    contentKind: 'series',
    normalizedGroup,
    limit: seriesLimit,
  });

  let tmdbMap = new Map<string, LocalTmdbMetadata>();
  if (!skipTmdb && rawItems.length > 0 && repository.getTmdbMetadataBySourceItemIds) {
    const itemIds = rawItems.map((item) => item.id);
    tmdbMap = await repository.getTmdbMetadataBySourceItemIds(itemIds);
  }

  const items = mapLocalCatalogSeriesItemsToHomeVodItems(
    rawItems,
    groupTitle,
    tmdbMap,
    rawItems.length,
  );

  return {
    status: 'ready',
    generation,
    items,
  };
}
