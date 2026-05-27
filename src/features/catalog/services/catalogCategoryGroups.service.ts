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
    title: 'Lançamentos',
    description:
      'Todos os conteúdos disponíveis na categoria Lançamentos da sua lista IPTV.',
    groupTitles: ['Filmes | Lancamentos', 'Filmes | Lançamentos'],
    homeSectionIds: ['home-vod-launches'],
  },
  {
    slug: 'filmes-cinema',
    title: 'Cinema',
    description:
      'Filmes da categoria Cinema liberados para esta licença.',
    groupTitles: ['Filmes | Cinema'],
  },
  {
    slug: 'filmes-acao',
    title: 'Ação',
    description:
      'Filmes de ação liberados para esta licença.',
    groupTitles: ['Filmes | Ação', 'Filmes | Acao'],
  },
  {
    slug: 'filmes-comedia',
    title: 'Comédia',
    description:
      'Filmes de comédia liberados para esta licença.',
    groupTitles: ['Filmes | Comédia', 'Filmes | Comedia'],
  },
  {
    slug: 'filmes-terror',
    title: 'Terror',
    description:
      'Filmes de terror liberados para esta licença.',
    groupTitles: ['Filmes | Terror'],
  },
  {
    slug: 'filmes-drama',
    title: 'Drama',
    description: 'Filmes de drama liberados para esta licença.',
    groupTitles: ['Filmes | Drama'],
  },
  {
    slug: 'filmes-animacao',
    title: 'Animação',
    description: 'Filmes de animação liberados para esta licença.',
    groupTitles: ['Filmes | Animação', 'Filmes | Animacao'],
  },
  {
    slug: 'filmes-legendados',
    title: 'Legendados',
    description: 'Filmes legendados liberados para esta licença.',
    groupTitles: ['Filmes | Legendados'],
  },
  {
    slug: 'filmes-suspense',
    title: 'Suspense',
    description: 'Filmes de suspense liberados para esta licença.',
    groupTitles: ['Filmes | Suspense'],
  },
  {
    slug: 'filmes-romance',
    title: 'Romance',
    description: 'Filmes de romance liberados para esta licença.',
    groupTitles: ['Filmes | Romance'],
  },
  {
    slug: 'filmes-documentarios',
    title: 'Documentários',
    description: 'Documentários liberados para esta licença.',
    groupTitles: ['Filmes | Documentarios', 'Filmes | Documentários'],
  },
  {
    slug: 'filmes-nacionais',
    title: 'Nacionais',
    description: 'Filmes nacionais liberados para esta licença.',
    groupTitles: ['Filmes | Nacionais'],
  },
  {
    slug: 'filmes-fantasia',
    title: 'Fantasia',
    description: 'Filmes de fantasia liberados para esta licença.',
    groupTitles: ['Filmes | Fantasia'],
  },
  {
    slug: 'filmes-crime',
    title: 'Crime',
    description: 'Filmes policiais e de crime liberados para esta licença.',
    groupTitles: ['Filmes | Crime'],
  },
  {
    slug: 'filmes-ficcao',
    title: 'Ficção',
    description: 'Filmes de ficção científica liberados para esta licença.',
    groupTitles: ['Filmes | Ficção', 'Filmes | Ficcao'],
  },
  {
    slug: 'filmes-faroeste',
    title: 'Faroeste',
    description: 'Filmes de faroeste liberados para esta licença.',
    groupTitles: ['Filmes | Faroeste'],
  },
  {
    slug: 'filmes-religiosos',
    title: 'Religiosos',
    description: 'Filmes religiosos e evangélicos liberados para esta licença.',
    groupTitles: ['Filmes | Religiosos'],
  },
  {
    slug: 'filmes-guerra',
    title: 'Guerra',
    description: 'Filmes de guerra liberados para esta licença.',
    groupTitles: ['Filmes | Guerra'],
  },
  {
    slug: 'filmes-aventura',
    title: 'Aventura',
    description: 'Filmes de aventura liberados para esta licença.',
    groupTitles: ['Filmes | Aventura'],
  },
  {
    slug: 'filmes-familia',
    title: 'Família',
    description: 'Filmes para assistir com toda a família liberados para esta licença.',
    groupTitles: ['Filmes | Família', 'Filmes | Familia'],
  },
  {
    slug: 'series',
    title: 'Séries',
    description:
      'Séries, novelas, doramas e temporadas liberadas para esta licença.',
    groupTitles: [
      'Séries',
      'Series',
      'Séries |',
      'Series |',
      'Novelas',
      'Novela',
      'Dorama',
      'Doramas',
      'Temporada',
      'Temporadas',
    ],
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

export function getSlugByGroupTitle(groupTitle: string): string {
  const definition = CATALOG_CATEGORY_DEFINITIONS.find((cat) =>
    cat.groupTitles.some(
      (gt) => gt.toLowerCase().trim() === groupTitle.toLowerCase().trim(),
    ),
  );

  if (definition) {
    return definition.slug;
  }

  return groupTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-');
}
