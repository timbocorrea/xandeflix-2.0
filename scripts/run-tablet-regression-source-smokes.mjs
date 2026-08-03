import { readFile } from 'node:fs/promises';

const files = {
  category: 'src/features/catalog/pages/CatalogCategoryPage.tsx',
  catalog: 'src/features/catalog/pages/CatalogPage.tsx',
  hero: 'src/components/media/CatalogHero.tsx',
  fullscreen: 'android/app/src/main/java/com/xandeflix/app/NativePlayerActivity.java',
  preview: 'android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java',
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
  ),
);

const checks = [
  ['episode-touch-native-button', source.category.includes('<button\n      ref={ref}\n      type="button"\n      onClick={onEnterPress}')],
  ['episode-touch-old-div-removed', !source.category.includes('<div\n      ref={ref}\n      role="button"\n      tabIndex={-1}')],
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
