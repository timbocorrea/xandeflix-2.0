export type LocalCatalogSeriesIdentityInput = {
  id: string;
  seriesKey?: string | null;
  seriesName?: string | null;
  episodeTitle?: string | null;
  title?: string | null;
  name?: string | null;
  rawName?: string | null;
  tvgName?: string | null;
  groupTitle?: string | null;
};

export function normalizeSeriesCollectionTitle(value?: string | null) {
  return (value ?? '')
    .replace(/\s*S\d{1,3}\s*E\d{1,4}.*$/i, '')
    .replace(/\s*S\d{1,3}\s*-\s*E\d{1,4}.*$/i, '')
    .replace(/\s*T\d{1,3}\s*E\d{1,4}.*$/i, '')
    .replace(/\s*T\d{1,3}\s*-\s*E\d{1,4}.*$/i, '')
    .replace(/\s*\d{1,3}x\d{1,4}.*$/i, '')
    .replace(/\s*-\s*Epis[oó]dio\s*\d+.*$/i, '')
    .replace(/\s*Ep\.?\s*\d+.*$/i, '')
    .replace(/\s*Epis[oó]dio\s*\d+.*$/i, '')
    .trim();
}

export function getSeriesCollectionKey(
  item: LocalCatalogSeriesIdentityInput,
): string {
  const explicitSeriesKey = item.seriesKey?.trim();

  if (explicitSeriesKey) {
    return explicitSeriesKey.toLowerCase();
  }

  const titleIdentity = normalizeSeriesCollectionTitle(
    item.seriesName ||
      item.episodeTitle ||
      item.name ||
      item.rawName ||
      item.title ||
      item.tvgName,
  );

  if (titleIdentity) {
    return titleIdentity.toLowerCase();
  }

  return (
    item.groupTitle ||
    item.name ||
    item.rawName ||
    item.title ||
    item.id
  ).toLowerCase();
}
