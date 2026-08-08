import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repositoryRoot = process.cwd();

async function readSource(relativePath) {
  return readFile(`${repositoryRoot}/${relativePath}`, 'utf8');
}

function sourceSlice(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  assert.notEqual(startIndex, -1, `VS02_SOURCE_MARKER_MISSING:${startMarker}`);
  assert.notEqual(endIndex, -1, `VS02_SOURCE_MARKER_MISSING:${endMarker}`);
  return source.slice(startIndex, endIndex);
}

try {
  const [
    homePage,
    categoryPage,
    homeVodService,
    snapshotService,
    catalogHero,
  ] = await Promise.all([
    readSource('src/features/catalog/pages/CatalogPage.tsx'),
    readSource('src/features/catalog/pages/CatalogCategoryPage.tsx'),
    readSource('src/features/catalog/services/homeVod.service.ts'),
    readSource(
      'src/features/catalog/services/localCatalogDiscoverySnapshot.service.ts',
    ),
    readSource('src/components/media/CatalogHero.tsx'),
  ]);
  const movieHero = sourceSlice(
    categoryPage,
    'function MovieCategoryHero(',
    'function SeriesCategoryHero(',
  );
  const seriesHero = sourceSlice(
    categoryPage,
    'function SeriesCategoryHero(',
    'function SeriesDetailHeroFrame(',
  );

  const checks = {
    homeUsesOnlyLocalCatalog:
      !/from\s+['"]\.\.\/data\/catalogSections['"]/.test(homePage) &&
      homePage.includes(
        'const localCatalogSections = realCatalogSections ?? EMPTY_CATALOG_SECTIONS;',
      ),
    homeHeroEligibilityIsArtworkIndependent:
      homePage.includes(
        'const candidates = Array.from(uniqueItems.values());',
      ) && homePage.includes('{heroItem ? ('),
    categoryHeroEligibilityIsArtworkIndependent:
      categoryPage.includes(
        "items.find((item) => Boolean(item.title?.trim())) ??",
      ) &&
      categoryPage.includes(
        'const movieHeroPresentationItems = effectiveMovieHeroHighlights;',
      ) &&
      categoryPage.includes(
        'const seriesHeroPresentationItems = effectiveSeriesHeroHighlights;',
      ),
    horizontalArtworkPolicyPreserved:
      movieHero.includes('getHorizontalHeroArtworkCandidates(item)') &&
      seriesHero.includes('getHorizontalHeroArtworkCandidates(item)') &&
      !movieHero.includes('posterUrl') &&
      !seriesHero.includes('posterUrl'),
    gradientTextFallbackPreserved:
      catalogHero.includes('data-xf-hero-visual-fallback="gradient"') &&
      catalogHero.includes('activeImageUrl &&') &&
      catalogHero.includes('bg-[linear-gradient'),
    snapshotUsesCurrentLocalCandidates:
      snapshotService.includes('allStoredItemsStillExist') &&
      snapshotService.includes('refreshDiscoveryPresentationSnapshotItems') &&
      snapshotService.includes('candidates: currentCandidates'),
    readFailureCanReachPresentation:
      homeVodService.includes('propagateReadError?: boolean') &&
      homeVodService.includes('if (input.propagateReadError)') &&
      homePage.includes('propagateReadError: true') &&
      categoryPage.includes('propagateReadError: true'),
    responsiveHeroArtworkPolicy:
      homePage.includes(
        "resolveHomeHeroArtworkUrl(heroItem, isMobile ? 'mobile' : 'horizontal')",
      ),
    terminalStatesAndRetryAreExplicit:
      ['loading', 'empty', 'error'].every((state) =>
        homePage.includes(`data-xf-home-catalog-state="${state}"`),
      ) &&
      ['loading', 'empty', 'error'].every((state) =>
        categoryPage.includes(`data-xf-category-state="${state}"`),
      ) &&
      homePage.includes('focusKey="home-catalog-retry"') &&
      categoryPage.includes('focusKey="category-retry"'),
  };

  assert.ok(
    Object.values(checks).every(Boolean),
    `VS02_SOURCE_SMOKE_FAILED:${Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name)
      .join(',')}`,
  );
  process.stdout.write(`${JSON.stringify({ pass: true, checks })}\n`);
} catch (error) {
  const errorCode =
    error instanceof Error && /^VS02_[A-Z0-9_:,-]+$/.test(error.message)
      ? error.message
      : 'VS02_SOURCE_SMOKE_UNEXPECTED_ERROR';
  process.stderr.write(`${JSON.stringify({ pass: false, errorCode })}\n`);
  process.exitCode = 1;
}
