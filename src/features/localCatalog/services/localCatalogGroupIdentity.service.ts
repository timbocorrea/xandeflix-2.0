export function normalizeLocalCatalogGroupIdentity(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function dedupeLocalCatalogGroupTitles(
  groupTitles: readonly string[],
) {
  const byIdentity = new Map<string, string>();

  for (const groupTitle of groupTitles) {
    const title = groupTitle.trim();
    const identity = normalizeLocalCatalogGroupIdentity(title);

    if (!identity || byIdentity.has(identity)) {
      continue;
    }

    byIdentity.set(identity, title);
  }

  return Array.from(byIdentity.values());
}

export function slugifyLocalCatalogGroupIdentity(value?: string | null) {
  return normalizeLocalCatalogGroupIdentity(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
