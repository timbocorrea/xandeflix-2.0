export type CatalogCategoryDefinition = {
  slug: string;
  title: string;
  description: string;
  groupTitles: string[];
  homeSectionIds?: string[];
};

export const CATALOG_VOD_PRIORITY_GROUPS = [
  'Filmes | Lancamentos',
  'Filmes | Cinema',
  'Filmes | A\u00e7\u00e3o',
  'Filmes | Acao',
  'Filmes | Com\u00e9dia',
  'Filmes | Comedia',
  'Filmes | Terror',
  'S\u00e9ries',
  'Series',
];

export const CATALOG_CATEGORY_DEFINITIONS: CatalogCategoryDefinition[] = [
  {
    slug: 'filmes-lancamentos',
    title: 'Lan\u00e7amentos',
    description:
      'Todos os conte\u00fados dispon\u00edveis na categoria Lan\u00e7amentos da sua lista IPTV.',
    groupTitles: ['Filmes | Lancamentos', 'Filmes | Lan\u00e7amentos'],
    homeSectionIds: ['home-vod-launches'],
  },
  {
    slug: 'filmes-cinema',
    title: 'Cinema',
    description:
      'Filmes da categoria Cinema liberados para esta licen\u00e7a.',
    groupTitles: ['Filmes | Cinema'],
  },
  {
    slug: 'filmes-acao',
    title: 'A\u00e7\u00e3o',
    description:
      'Filmes de a\u00e7\u00e3o liberados para esta licen\u00e7a.',
    groupTitles: ['Filmes | A\u00e7\u00e3o', 'Filmes | Acao'],
  },
  {
    slug: 'filmes-comedia',
    title: 'Com\u00e9dia',
    description:
      'Filmes de com\u00e9dia liberados para esta licen\u00e7a.',
    groupTitles: ['Filmes | Com\u00e9dia', 'Filmes | Comedia'],
  },
  {
    slug: 'filmes-terror',
    title: 'Terror',
    description:
      'Filmes de terror liberados para esta licen\u00e7a.',
    groupTitles: ['Filmes | Terror'],
  },
  {
    slug: 'series',
    title: 'S\u00e9ries',
    description:
      'S\u00e9ries liberadas para esta licen\u00e7a.',
    groupTitles: ['S\u00e9ries', 'Series'],
    homeSectionIds: ['home-vod-series'],
  },
];

export function getCatalogCategoryDefinition(slug?: string | null) {
  if (!slug) {
    return null;
  }

  return (
    CATALOG_CATEGORY_DEFINITIONS.find(
      (definition) => definition.slug === slug,
    ) ?? null
  );
}

export function getCategoryRouteByHomeSectionId(sectionId: string) {
  const definition = CATALOG_CATEGORY_DEFINITIONS.find((category) =>
    category.homeSectionIds?.includes(sectionId),
  );

  if (!definition) {
    return null;
  }

  return definition.slug === 'filmes-lancamentos'
    ? '/launches'
    : `/category/${definition.slug}`;
}
