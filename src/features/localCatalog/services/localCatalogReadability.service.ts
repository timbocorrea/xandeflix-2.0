import type { LocalCatalogImportMetadata } from '../types/localCatalog.types';

const READABLE_REFRESH_STATUSES = new Set<
  LocalCatalogImportMetadata['status']
>(['importing', 'failed', 'canceled']);

function isValidCatalogTimestamp(value?: string | null) {
  if (!value?.trim()) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

/**
 * Separa o estado da tentativa de importação atual da legibilidade do último
 * catálogo concluído. Uma primeira importação parcial nunca fica legível.
 */
export function isLocalCatalogReadable(
  metadata?: LocalCatalogImportMetadata | null,
) {
  if (!metadata || metadata.sourceType !== 'm3u') {
    return false;
  }

  if (metadata.status === 'ready') {
    return (
      metadata.importedCount > 0 &&
      isValidCatalogTimestamp(
        metadata.lastSuccessfulImportAt ?? metadata.completedAt,
      )
    );
  }

  return (
    READABLE_REFRESH_STATUSES.has(metadata.status) &&
    isValidCatalogTimestamp(metadata.lastSuccessfulImportAt)
  );
}
