const SEARCH_TOKEN_MIN_LENGTH = 1;

export function normalizeLocalCatalogSearchText(value?: string | null) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

export function tokenizeLocalCatalogSearchText(value?: string | null) {
  const normalized = normalizeLocalCatalogSearchText(value);

  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .split(' ')
        .filter((token) => token.length >= SEARCH_TOKEN_MIN_LENGTH),
    ),
  );
}
