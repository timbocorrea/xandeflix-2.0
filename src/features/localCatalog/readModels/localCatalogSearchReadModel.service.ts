import {
  decodeLocalCatalogPageCursor,
  encodeLocalCatalogPageCursor,
} from '../services/localCatalogCursor.service';
import {
  normalizeLocalCatalogSearchText,
  tokenizeLocalCatalogSearchText,
} from '../lib/localCatalogSearchNormalization';
import {
  getSeriesCollectionKey,
  normalizeSeriesCollectionTitle,
} from '../services/localCatalogSeriesIdentity.service';
import {
  localCatalogSearchRepository,
  type LocalCatalogSearchCandidate,
  type LocalCatalogSearchRepository,
} from '../repositories/localCatalogSearchRepository.service';
import {
  resolveLocalCatalogSearchArtwork,
  type LocalCatalogSearchArtworkReader,
} from '../services/localCatalogSearchArtwork.service';
import type {
  LocalCatalogContentKind,
  LocalCatalogPageCursor,
} from '../types/localCatalog.types';

export const LOCAL_CATALOG_SEARCH_PAGE_SIZE = 40;
export const LOCAL_CATALOG_SEARCH_DEBOUNCE_MS = 220;
const MAX_QUERY_LENGTH = 120;

export type LocalCatalogSearchResultItem = {
  id: string;
  title: string;
  normalizedTitle: string;
  groupTitle: string | null;
  contentKind: LocalCatalogContentKind;
  streamUrl: string;
  artworkUrl: string | null;
  sourceOrder: number;
  seriesKey?: string;
  representativeItemId?: string;
  episodeCount?: number;
  isSeriesCollection?: boolean;
};

export type LocalCatalogSearchPage = {
  status:
    | 'empty_query'
    | 'unavailable'
    | 'indexing'
    | 'index_failed'
    | 'ready';
  normalizedQuery: string;
  items: LocalCatalogSearchResultItem[];
  nextCursor: LocalCatalogPageCursor | null;
  indexedItems?: number;
  totalItems?: number;
  indexingInBackground?: boolean;
};

function getRelevance(
  candidate: LocalCatalogSearchCandidate,
  normalizedQuery: string,
  queryTokens: string[],
) {
  const title = candidate.document.normalizedTitle;
  const titleTokens = title.split(' ');

  if (title === normalizedQuery) return 0;
  if (title.startsWith(`${normalizedQuery} `)) return 1;
  if (title.startsWith(normalizedQuery)) return 2;
  if (queryTokens.every((token) => titleTokens.includes(token))) return 3;
  if (title.includes(normalizedQuery)) return 4;
  return 5;
}

function sortCandidates(
  candidates: LocalCatalogSearchCandidate[],
  normalizedQuery: string,
  queryTokens: string[],
) {
  return [...candidates].sort((first, second) => {
    const relevanceDifference =
      getRelevance(first, normalizedQuery, queryTokens) -
      getRelevance(second, normalizedQuery, queryTokens);

    if (relevanceDifference !== 0) {
      return relevanceDifference;
    }

    const titleDifference = first.document.normalizedTitle.localeCompare(
      second.document.normalizedTitle,
      'pt-BR',
      { sensitivity: 'base' },
    );

    if (titleDifference !== 0) {
      return titleDifference;
    }

    if (first.item.sourceOrder !== second.item.sourceOrder) {
      return first.item.sourceOrder - second.item.sourceOrder;
    }

    return first.item.itemId.localeCompare(second.item.itemId);
  });
}

type ProjectedSearchCandidate = LocalCatalogSearchCandidate & {
  seriesProjection?: {
    key: string;
    canonicalTitle: string;
    representativeItemId: string;
    episodeCount: number;
  };
};

function isSeriesCandidate(candidate: LocalCatalogSearchCandidate) {
  return (
    candidate.item.contentKind === 'series' ||
    candidate.item.contentKind === 'series_episode'
  );
}

function getCandidateSeriesKey(candidate: LocalCatalogSearchCandidate) {
  return getSeriesCollectionKey({
    id: candidate.item.itemId,
    name: candidate.item.rawName,
    rawName: candidate.item.rawName,
    groupTitle: candidate.item.rawGroupTitle,
  });
}

function compareSeriesRepresentatives(
  first: LocalCatalogSearchCandidate,
  second: LocalCatalogSearchCandidate,
) {
  const artworkDifference =
    Number(Boolean(second.item.artworkUrl?.trim())) -
    Number(Boolean(first.item.artworkUrl?.trim()));
  if (artworkDifference !== 0) return artworkDifference;

  const firstCanonical =
    normalizeSeriesCollectionTitle(first.item.rawName) || first.item.rawName;
  const secondCanonical =
    normalizeSeriesCollectionTitle(second.item.rawName) || second.item.rawName;
  const bareTitleDifference =
    Number(second.item.rawName.trim() === secondCanonical) -
    Number(first.item.rawName.trim() === firstCanonical);
  if (bareTitleDifference !== 0) return bareTitleDifference;

  if (first.item.sourceOrder !== second.item.sourceOrder) {
    return first.item.sourceOrder - second.item.sourceOrder;
  }

  return first.item.itemId.localeCompare(second.item.itemId);
}

function projectSeriesCandidates(
  candidates: LocalCatalogSearchCandidate[],
): ProjectedSearchCandidate[] {
  const projected: ProjectedSearchCandidate[] = [];
  const collections = new Map<string, LocalCatalogSearchCandidate[]>();

  for (const candidate of candidates) {
    if (!isSeriesCandidate(candidate)) {
      projected.push(candidate);
      continue;
    }

    const key = getCandidateSeriesKey(candidate);
    const collection = collections.get(key);
    if (collection) {
      collection.push(candidate);
    } else {
      collections.set(key, [candidate]);
    }
  }

  for (const [key, collection] of collections) {
    const ordered = [...collection].sort(compareSeriesRepresentatives);
    const representative = ordered[0];
    const canonicalTitle =
      normalizeSeriesCollectionTitle(representative.item.rawName) ||
      representative.item.rawName.trim();
    const canonicalNormalizedTitle =
      normalizeLocalCatalogSearchText(canonicalTitle);
    const earliestSourceOrder = Math.min(
      ...collection.map((candidate) => candidate.item.sourceOrder),
    );
    const matchedTokens = Array.from(
      new Set(collection.flatMap((candidate) => candidate.matchedTokens)),
    );

    projected.push({
      ...representative,
      document: {
        ...representative.document,
        contentKind: 'series',
        normalizedTitle: canonicalNormalizedTitle,
      },
      item: {
        ...representative.item,
        contentKind: 'series',
        rawName: canonicalTitle,
        normalizedName: canonicalNormalizedTitle,
        sourceOrder: earliestSourceOrder,
      },
      matchedTokens,
      seriesProjection: {
        key,
        canonicalTitle,
        representativeItemId: representative.item.itemId,
        episodeCount: collection.length,
      },
    });
  }

  return projected;
}

function mapCandidate(
  candidate: ProjectedSearchCandidate,
): LocalCatalogSearchResultItem {
  return {
    id: candidate.item.itemId,
    title: candidate.item.rawName,
    normalizedTitle: candidate.document.normalizedTitle,
    groupTitle: candidate.item.rawGroupTitle,
    contentKind: candidate.item.contentKind,
    streamUrl: candidate.item.streamUrl,
    artworkUrl: candidate.item.artworkUrl ?? null,
    sourceOrder: candidate.item.sourceOrder,
    seriesKey: candidate.seriesProjection?.key,
    representativeItemId:
      candidate.seriesProjection?.representativeItemId,
    episodeCount: candidate.seriesProjection?.episodeCount,
    isSeriesCollection: Boolean(candidate.seriesProjection),
  };
}

export async function searchLocalCatalog(
  input: {
    scopeKey: string;
    query: string;
    cursor?: LocalCatalogPageCursor | null;
    limit?: number;
  },
  repository: LocalCatalogSearchRepository = localCatalogSearchRepository,
  readArtworkMetadata?: LocalCatalogSearchArtworkReader,
): Promise<LocalCatalogSearchPage> {
  const normalizedQuery = normalizeLocalCatalogSearchText(input.query).slice(
    0,
    MAX_QUERY_LENGTH,
  );
  const queryTokens = tokenizeLocalCatalogSearchText(normalizedQuery);

  if (!normalizedQuery || queryTokens.length === 0) {
    return {
      status: 'empty_query',
      normalizedQuery,
      items: [],
      nextCursor: null,
    };
  }

  const result = await repository.findCandidates({
    scopeKey: input.scopeKey,
    tokens: queryTokens,
    normalizedQuery,
  });

  if (!result) {
    return {
      status: 'unavailable',
      normalizedQuery,
      items: [],
      nextCursor: null,
    };
  }

  const filterKey = `search:${normalizedQuery}`;
  let offset = 0;

  if (input.cursor) {
    const decoded = decodeLocalCatalogPageCursor(input.cursor, {
      snapshotId: result.snapshotId,
      filterKey,
    });
    offset =
      typeof decoded.lastKey === 'number' ? decoded.lastKey : 0;
  }

  const limit = Math.max(
    1,
    Math.min(input.limit ?? LOCAL_CATALOG_SEARCH_PAGE_SIZE, 100),
  );
  const projectedCandidates = projectSeriesCandidates(result.candidates);
  const sorted = sortCandidates(
    projectedCandidates,
    normalizedQuery,
    queryTokens,
  );
  const projectedPageItems = sorted
    .slice(offset, offset + limit)
    .map(mapCandidate);
  const pageItems = await resolveLocalCatalogSearchArtwork(
    projectedPageItems,
    input.scopeKey,
    readArtworkMetadata,
  );
  const nextOffset = offset + pageItems.length;

  return {
    status: result.status ?? 'ready',
    normalizedQuery,
    items: pageItems,
    nextCursor:
      nextOffset < sorted.length
        ? encodeLocalCatalogPageCursor({
            snapshotId: result.snapshotId,
            filterKey,
            lastKey: nextOffset,
          })
        : null,
    indexedItems: result.processedCount,
    totalItems: result.totalItems,
    indexingInBackground: result.indexingInBackground,
  };
}
