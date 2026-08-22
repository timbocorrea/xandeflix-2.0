export type HomeVodRenderableSection = {
  title?: string | null;
  items?: readonly unknown[] | null;
};

function normalizeHomeVodSectionTitle(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isRenderableHomeVodSection(
  section: HomeVodRenderableSection,
): boolean {
  const normalizedTitle = normalizeHomeVodSectionTitle(section.title);

  if (
    normalizedTitle.startsWith('canais') ||
    normalizedTitle.startsWith('canal') ||
    normalizedTitle.includes('ao vivo')
  ) {
    return false;
  }

  return Boolean(section.items?.length);
}

export function filterRenderableHomeVodSections<
  TSection extends HomeVodRenderableSection,
>(sections?: readonly TSection[] | null): TSection[] {
  return sections?.filter(isRenderableHomeVodSection) ?? [];
}
