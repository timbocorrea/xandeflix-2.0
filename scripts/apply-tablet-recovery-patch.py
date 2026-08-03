from pathlib import Path


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f'Expected block not found: {label}')
    return text.replace(old, new, 1)


def replace_optional(text: str, old: str, new: str) -> str:
    return text.replace(old, new, 1) if old in text else text


category_path = Path('src/features/catalog/pages/CatalogCategoryPage.tsx')
category = category_path.read_text(encoding='utf-8')
category = replace_required(
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
catalog = replace_required(
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
catalog = replace_required(
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
catalog = replace_optional(
    catalog,
    '          fallbackPosterUrl={heroItem?.posterUrl}\n',
    '',
)
catalog_path.write_text(catalog, encoding='utf-8')

hero_path = Path('src/components/media/CatalogHero.tsx')
hero = hero_path.read_text(encoding='utf-8')
for old, new in [
    ('  fallbackPosterUrl?: string;\n', ''),
    ('  fallbackPosterUrl,\n', ''),
    ("  const normalizedFallbackPosterUrl = fallbackPosterUrl?.trim() || null;\n", ''),
    ('            normalizedFallbackPosterUrl,\n', ''),
    ('    [artworkCandidates, backgroundUrl, normalizedFallbackPosterUrl],\n', '    [artworkCandidates, backgroundUrl],\n'),
    ("""  const isFallbackPoster =
    Boolean(normalizedFallbackPosterUrl) &&
    activeImageUrl === normalizedFallbackPosterUrl &&
    activeImageUrl !== backgroundUrl &&
    !(artworkCandidates ?? []).some(
      (candidate) => candidate.url === activeImageUrl,
    );
""", ''),
    ('        backgroundUrl || normalizedFallbackPosterUrl\n', '        backgroundUrl\n'),
    ("""          className={cn(
            'absolute inset-0 h-full w-full opacity-100',
            isFallbackPoster ? 'bg-black/80 object-contain' : 'object-cover',
          )}
""", '          className="absolute inset-0 h-full w-full object-cover opacity-100"\n'),
]:
    hero = replace_optional(hero, old, new)
hero_path.write_text(hero, encoding='utf-8')

smoke_path = Path('scripts/run-tablet-regression-source-smokes.mjs')
smoke = smoke_path.read_text(encoding='utf-8')
old_checks = """  ['home-hero-poster-candidate', source.catalog.includes('Boolean(item.posterUrl?.trim())')],
  ['home-hero-fallback-prop', source.catalog.includes('fallbackPosterUrl={heroItem?.posterUrl}')],
  ['catalog-hero-fallback-rendering', source.hero.includes('normalizedFallbackPosterUrl') && source.hero.includes('isFallbackPoster')],
"""
new_checks = """  ['episode-detail-routes-to-player', source.category.includes('if (isSeriesDetailPage) {\\n      openEpisode(item, index);\\n      return;\\n    }')],
  ['home-hero-horizontal-only', !source.catalog.includes('Boolean(item.posterUrl?.trim())') && !source.catalog.includes('fallbackPosterUrl={heroItem?.posterUrl}')],
  ['catalog-hero-no-vertical-poster-fallback', !source.hero.includes('fallbackPosterUrl') && !source.hero.includes('isFallbackPoster')],
"""
smoke = replace_required(smoke, old_checks, new_checks, 'tablet smoke checks')
smoke_path.write_text(smoke, encoding='utf-8')
