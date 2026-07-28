import type {
  LocalCatalogSearchDocument,
  LocalCatalogSearchToken,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';
import {
  normalizeLocalCatalogSearchText,
  tokenizeLocalCatalogSearchText,
} from './localCatalogSearchNormalization';

export function createLocalCatalogSearchRecords(
  item: LocalCatalogSnapshotItem,
  updatedAt: string,
) {
  const normalizedTitle = normalizeLocalCatalogSearchText(item.rawName);
  const tokens = tokenizeLocalCatalogSearchText(normalizedTitle);
  const document: LocalCatalogSearchDocument = {
    snapshotId: item.snapshotId,
    documentId: item.itemId,
    scopeKey: item.scopeKey,
    catalogItemId: item.itemId,
    contentKind: item.contentKind,
    normalizedTitle,
    normalizedCategory:
      normalizeLocalCatalogSearchText(item.rawGroupTitle) || null,
    year: null,
    seasonNumber: null,
    episodeNumber: null,
    indexStatus: 'ready',
    updatedAt,
  };
  const tokenRecords: LocalCatalogSearchToken[] = tokens.map(
    (token, position) => ({
      snapshotId: item.snapshotId,
      token,
      documentId: item.itemId,
      weight: 100,
      position,
      prefixLength: token.length,
    }),
  );

  return { document, tokenRecords };
}
