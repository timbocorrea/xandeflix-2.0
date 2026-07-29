import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'vite';

const repositoryRoot = process.cwd();
const temporaryRoot = path.resolve(
  os.tmpdir(),
  `xandeflix-u2f4d3-smoke-${process.pid}-${Date.now()}`,
);
const smokeEntry = path.resolve(
  repositoryRoot,
  'src/features/catalog/services/movieDetailMetadataSmokeTest.service.ts',
);

if (
  !temporaryRoot.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
  !path.basename(temporaryRoot).startsWith('xandeflix-u2f4d3-smoke-')
) {
  throw new Error('U2F4D3_SMOKE_TEMP_PATH_REJECTED');
}

try {
  await build({
    configFile: false,
    logLevel: 'error',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        'https://smoke.invalid',
      ),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
        'synthetic-smoke-anon-key',
      ),
      'import.meta.env.VITE_TMDB_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_DISABLE_SUPABASE_CONTENT_WRITES':
        JSON.stringify('true'),
      'import.meta.env.VITE_CONTENT_STORAGE_MODE': JSON.stringify('local'),
    },
    resolve: {
      alias: {
        '@': path.resolve(repositoryRoot, 'src'),
      },
    },
    build: {
      emptyOutDir: true,
      minify: false,
      outDir: temporaryRoot,
      ssr: smokeEntry,
      rollupOptions: {
        output: {
          entryFileNames: 'smoke.mjs',
        },
      },
    },
  });

  const smokeModule = await import(
    `${pathToFileURL(path.join(temporaryRoot, 'smoke.mjs')).href}?v=${Date.now()}`
  );
  const result = await smokeModule.runMovieDetailMetadataSmokeTest();

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.pass) {
    process.exitCode = 1;
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
