import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import ts from 'typescript';

const files = {
  category: 'src/features/catalog/pages/CatalogCategoryPage.tsx',
  catalog: 'src/features/catalog/pages/CatalogPage.tsx',
  hero: 'src/components/media/CatalogHero.tsx',
  fullscreen: 'android/app/src/main/java/com/xandeflix/app/NativePlayerActivity.java',
  preview: 'android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java',
};

async function readNormalizedSource(path) {
  return (await readFile(path, 'utf8')).replace(/\r\n?/g, '\n');
}

async function importTypeScriptModule(path) {
  const typeScriptSource = await readNormalizedSource(path);
  const { outputText } = ts.transpileModule(typeScriptSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: path,
  });

  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
}

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readNormalizedSource(path),
    ]),
  ),
);

const [openPolicy, heroPolicy] = await Promise.all([
  importTypeScriptModule(
    'src/features/catalog/services/catalogItemOpenPolicy.service.ts',
  ),
  importTypeScriptModule(
    'src/features/catalog/services/heroArtworkPolicy.service.ts',
  ),
]);

const checks = [];

function check(name, assertion) {
  try {
    assertion();
    checks.push([name, true, null]);
  } catch (error) {
    checks.push([
      name,
      false,
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

check('episode-touch-native-button', () => {
  assert.match(
    source.category,
    /<button\s+ref=\{ref\}\s+type="button"\s+onClick=\{onEnterPress\}/,
  );
  assert.doesNotMatch(
    source.category,
    /<div\s+ref=\{ref\}\s+role="button"\s+tabIndex=\{-1\}/,
  );
});

check('episode-row-opens-player-directly', () => {
  assert.match(
    source.category,
    /<EpisodeListRow[\s\S]*?onEnterPress=\{\(\) => openEpisode\(item, absoluteIndex\)\}[\s\S]*?\/>/,
  );
  assert.doesNotMatch(
    source.category,
    /onEnterPress=\{\(\) => openCategoryItem\(item, absoluteIndex\)\}/,
  );
});

check('series-detail-series-key-is-still-an-episode', () => {
  assert.equal(
    openPolicy.resolveCatalogItemOpenTarget({
      categorySlug: 'series',
      isMovieSeeAllPage: false,
      isSeriesCollection: false,
      isSeriesDetailPage: true,
      seriesKey: 'series:silo',
    }),
    'episode',
  );
});

check('series-collection-still-opens-series-detail', () => {
  assert.equal(
    openPolicy.resolveCatalogItemOpenTarget({
      categorySlug: 'series',
      isMovieSeeAllPage: false,
      isSeriesCollection: true,
      isSeriesDetailPage: false,
      seriesKey: 'series:silo',
    }),
    'series-detail',
  );
});

check('movie-card-still-opens-movie-detail', () => {
  assert.equal(
    openPolicy.resolveCatalogItemOpenTarget({
      categorySlug: 'filmes',
      isMovieSeeAllPage: false,
      isSeriesCollection: false,
      isSeriesDetailPage: false,
      seriesKey: null,
    }),
    'movie-detail',
  );
});

check('horizontal-home-hero-rejects-poster-only-item', () => {
  const posterOnlyItem = {
    posterUrl: 'https://images.example/vertical-poster.jpg',
  };

  assert.deepEqual(
    heroPolicy.getHorizontalHeroArtworkCandidates(posterOnlyItem),
    [],
  );
  assert.equal(
    heroPolicy.resolveHomeHeroArtworkUrl(posterOnlyItem, 'horizontal'),
    undefined,
  );
});

check('horizontal-home-hero-accepts-cached-backdrop', () => {
  const itemWithCachedBackdrop = {
    posterUrl: 'https://images.example/vertical-poster.jpg',
    artworkCandidates: [
      {
        url: 'https://images.example/vertical-provider-poster.jpg',
        source: 'tvg_logo',
      },
      {
        url: 'https://images.example/cached-horizontal-backdrop.jpg',
        source: 'tmdb_backdrop',
      },
    ],
  };

  assert.deepEqual(
    heroPolicy.getHorizontalHeroArtworkCandidates(itemWithCachedBackdrop),
    ['https://images.example/cached-horizontal-backdrop.jpg'],
  );
  assert.equal(
    heroPolicy.resolveHomeHeroArtworkUrl(
      itemWithCachedBackdrop,
      'horizontal',
    ),
    'https://images.example/cached-horizontal-backdrop.jpg',
  );
});

check('horizontal-home-hero-prefers-local-backdrop-over-poster', () => {
  const itemWithLocalBackdrop = {
    posterUrl: 'https://images.example/vertical-poster.jpg',
    backdropUrl: 'https://images.example/local-horizontal-backdrop.jpg',
  };

  assert.equal(
    heroPolicy.resolveHomeHeroArtworkUrl(itemWithLocalBackdrop, 'horizontal'),
    'https://images.example/local-horizontal-backdrop.jpg',
  );
});

check('home-hero-keeps-gradient-shell-without-horizontal-artwork', () => {
  assert.match(source.hero, /data-xf-hero-visual-fallback="gradient"/);
  assert.match(source.hero, /\{activeImageUrl && \(\s*<img/);
  assert.doesNotMatch(source.hero, /fallbackPosterUrl|isFallbackPoster/);
  assert.doesNotMatch(source.catalog, /fallbackPosterUrl=\{heroItem\?\.posterUrl\}/);
});

check('home-hero-rotation-pool-is-horizontal-only', () => {
  assert.match(
    source.catalog,
    /const candidates = Array\.from\(uniqueItems\.values\(\)\)\.filter\(\s*\(item\) => getHorizontalHeroArtworkCandidates\(item\)\.length > 0,\s*\)/,
  );
  assert.doesNotMatch(
    source.catalog,
    /getHorizontalHeroArtworkCandidates\(item\)\.length > 0\s*\|\|\s*Boolean\(item\.posterUrl\?\.trim\(\)\)/,
  );
});

check('fullscreen-preserves-aspect-ratio', () => {
  assert.match(
    source.fullscreen,
    /setResizeMode\(AspectRatioFrameLayout\.RESIZE_MODE_FIT\)/,
  );
  assert.doesNotMatch(
    source.fullscreen,
    /setResizeMode\(AspectRatioFrameLayout\.RESIZE_MODE_(?:ZOOM|FILL)\)/,
  );
});

check('inline-preview-preserves-aspect-ratio', () => {
  assert.match(
    source.preview,
    /setResizeMode\(AspectRatioFrameLayout\.RESIZE_MODE_FIT\)/,
  );
  assert.doesNotMatch(
    source.preview,
    /setResizeMode\(AspectRatioFrameLayout\.RESIZE_MODE_(?:ZOOM|FILL)\)/,
  );
});

const failed = checks
  .filter(([, passed]) => !passed)
  .map(([name, , error]) => ({ name, error }));
const result = {
  pass: failed.length === 0,
  checks: Object.fromEntries(
    checks.map(([name, passed]) => [name, passed]),
  ),
  failed,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (!result.pass) {
  process.exitCode = 1;
}
