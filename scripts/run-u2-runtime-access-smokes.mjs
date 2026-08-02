import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'vite';

const repositoryRoot = process.cwd();
const temporaryRoot = path.resolve(
  os.tmpdir(),
  `xandeflix-u2-runtime-access-smoke-${process.pid}-${Date.now()}`,
);
const smokeEntry = path.resolve(
  repositoryRoot,
  'src/features/bootstrap/services/clientRuntimeAccessSmokeTest.service.ts',
);

if (
  !temporaryRoot.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
  !path.basename(temporaryRoot).startsWith('xandeflix-u2-runtime-access-smoke-')
) {
  throw new Error('U2_RUNTIME_ACCESS_SMOKE_TEMP_PATH_REJECTED');
}

try {
  await build({
    configFile: false,
    logLevel: 'error',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fakeproject.supabase.co'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fakekey'),
      'import.meta.env.VITE_LOCAL_CATALOG_SNAPSHOT_IMPORT_ENABLED': JSON.stringify('true'),
      'import.meta.env.VITE_LOCAL_CATALOG_WORKER_ENABLED': JSON.stringify('true'),
    },
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
  const result = await smokeModule.runClientRuntimeAccessSmokeTest();

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
}
