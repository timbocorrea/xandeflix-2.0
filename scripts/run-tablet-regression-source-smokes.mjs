import { readFile } from 'node:fs/promises';

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

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readNormalizedSource(path),
    ]),
  ),
);

const episodeTouchButtonPattern =
  /<button\s+ref=\{ref\}\s+type="button"\s+onClick=\{onEnterPress\}/;
const oldEpisodeDivPattern =
  /<div\s+ref=\{ref\}\s+role="button"\s+tabIndex=\{-1\}/;

const checks = [
  ['episode-touch-native-button', episodeTouchButtonPattern.test(source.category)],
  ['episode-touch-old-div-removed', !oldEpisodeDivPattern.test(source.category)],
  ['home-hero-poster-candidate', source.catalog.includes('Boolean(item.posterUrl?.trim())')],
  ['home-hero-fallback-prop', source.catalog.includes('fallbackPosterUrl={heroItem?.posterUrl}')],
  ['catalog-hero-fallback-rendering', source.hero.includes('normalizedFallbackPosterUrl') && source.hero.includes('isFallbackPoster')],
  ['fullscreen-preserves-aspect-ratio', source.fullscreen.includes('RESIZE_MODE_FIT') && !source.fullscreen.includes('RESIZE_MODE_ZOOM')],
  ['inline-preview-preserves-aspect-ratio', source.preview.includes('RESIZE_MODE_FIT') && !source.preview.includes('RESIZE_MODE_FILL')],
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
const result = {
  pass: failed.length === 0,
  checks: Object.fromEntries(checks),
  failed,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (!result.pass) {
  process.exitCode = 1;
}
