from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Expected block not found: {label}')
    return text.replace(old, new, 1)


category_path = Path('src/features/catalog/pages/CatalogCategoryPage.tsx')
category = category_path.read_text(encoding='utf-8')
category = replace_once(
    category,
    """  function openCategoryItem(item: HomeVodItem, index: number) {
    const shouldOpenSeriesDetail =
      category?.slug === 'series' ||
      category?.slug === 'series-group' ||
      item.isSeriesCollection ||
      Boolean(item.seriesKey);
""",
    """  function openCategoryItem(item: HomeVodItem, index: number) {
    if (isSeriesDetailPage) {
      openEpisode(item, index);
      return;
    }

    const shouldOpenSeriesDetail =
      category?.slug === 'series' ||
      category?.slug === 'series-group' ||
      item.isSeriesCollection ||
      Boolean(item.seriesKey);
""",
    'episode detail routing',
)
category_path.write_text(category, encoding='utf-8')

catalog_path = Path('src/features/catalog/pages/CatalogPage.tsx')
catalog = catalog_path.read_text(encoding='utf-8')
catalog = replace_once(
    catalog,
    """    const candidates = Array.from(uniqueItems.values()).filter(
      (item) =>
        getHorizontalHeroArtworkCandidates(item).length > 0 ||
        Boolean(item.posterUrl?.trim()),
    );
""",
    """    const candidates = Array.from(uniqueItems.values()).filter(
      (item) => getHorizontalHeroArtworkCandidates(item).length > 0,
    );
""",
    'horizontal hero candidates',
)
catalog = replace_once(
    catalog,
    """      isArtworkReady: (item) =>
        getHorizontalHeroArtworkCandidates(item).length > 0 ||
        Boolean(item.posterUrl?.trim()),
""",
    """      isArtworkReady: (item) =>
        getHorizontalHeroArtworkCandidates(item).length > 0,
""",
    'horizontal hero readiness',
)
catalog = replace_once(
    catalog,
    '          fallbackPosterUrl={heroItem?.posterUrl}\n',
    '',
    'home poster fallback prop',
)
catalog_path.write_text(catalog, encoding='utf-8')

hero_path = Path('src/components/media/CatalogHero.tsx')
hero = hero_path.read_text(encoding='utf-8')
for old, new, label in [
    ('  fallbackPosterUrl?: string;\n', '', 'fallback prop type'),
    ('  fallbackPosterUrl,\n', '', 'fallback prop binding'),
    ("  const normalizedFallbackPosterUrl = fallbackPosterUrl?.trim() || null;\n", '', 'fallback normalization'),
    ('            normalizedFallbackPosterUrl,\n', '', 'fallback image candidate'),
    ('    [artworkCandidates, backgroundUrl, normalizedFallbackPosterUrl],\n', '    [artworkCandidates, backgroundUrl],\n', 'fallback memo dependency'),
    ("""  const isFallbackPoster =
    Boolean(normalizedFallbackPosterUrl) &&
    activeImageUrl === normalizedFallbackPosterUrl &&
    activeImageUrl !== backgroundUrl &&
    !(artworkCandidates ?? []).some(
      (candidate) => candidate.url === activeImageUrl,
    );
""", '', 'fallback poster classification'),
    ('        backgroundUrl || normalizedFallbackPosterUrl\n', '        backgroundUrl\n', 'fallback aspect ratio'),
    ("""          className={cn(
            'absolute inset-0 h-full w-full opacity-100',
            isFallbackPoster ? 'bg-black/80 object-contain' : 'object-cover',
          )}
""", '          className="absolute inset-0 h-full w-full object-cover opacity-100"\n', 'fallback rendering'),
]:
    hero = replace_once(hero, old, new, label)
hero_path.write_text(hero, encoding='utf-8')

smoke_path = Path('scripts/run-tablet-regression-source-smokes.mjs')
smoke = smoke_path.read_text(encoding='utf-8')
smoke = replace_once(
    smoke,
    """  ['home-hero-poster-candidate', source.catalog.includes('Boolean(item.posterUrl?.trim())')],
  ['home-hero-fallback-prop', source.catalog.includes('fallbackPosterUrl={heroItem?.posterUrl}')],
  ['catalog-hero-fallback-rendering', source.hero.includes('normalizedFallbackPosterUrl') && source.hero.includes('isFallbackPoster')],
""",
    """  ['episode-detail-routes-to-player', source.category.includes('if (isSeriesDetailPage) {\\n      openEpisode(item, index);\\n      return;\\n    }')],
  ['home-hero-horizontal-only', !source.catalog.includes('Boolean(item.posterUrl?.trim())') && !source.catalog.includes('fallbackPosterUrl={heroItem?.posterUrl}')],
  ['catalog-hero-no-vertical-poster-fallback', !source.hero.includes('fallbackPosterUrl') && !source.hero.includes('isFallbackPoster')],
""",
    'tablet smoke checks',
)
smoke_path.write_text(smoke, encoding='utf-8')
