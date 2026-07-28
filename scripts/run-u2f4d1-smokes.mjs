import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'vite';

const repositoryRoot = process.cwd();
const temporaryRoot = path.resolve(
  os.tmpdir(),
  `xandeflix-u2f4d1-smoke-${process.pid}-${Date.now()}`,
);
const smokeEntry = path.resolve(
  repositoryRoot,
  'src/features/localCatalog/readModels/localCatalogSeriesDetailReadModelSmokeTest.service.ts',
);

if (
  !temporaryRoot.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
  !path.basename(temporaryRoot).startsWith('xandeflix-u2f4d1-smoke-')
) {
  throw new Error('U2F4D1_SMOKE_TEMP_PATH_REJECTED');
}

try {
  await build({
    configFile: false,
    logLevel: 'error',
    ssr: {
      noExternal: true,
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
  const result =
    await smokeModule.runLocalCatalogSeriesDetailReadModelSmokeTest();

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
