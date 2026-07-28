import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { build } from 'vite';

const repositoryRoot = process.cwd();
const temporaryRoot = path.resolve(
  os.tmpdir(),
  `xandeflix-u2f2-smoke-${process.pid}-${Date.now()}`,
);
const browserProfile = path.join(temporaryRoot, 'browser-profile');
const outputDirectory = path.join(temporaryRoot, 'dist');
const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browserExecutable = browserCandidates.find((candidate) =>
  process.getBuiltinModule('node:fs').existsSync(candidate),
);
const requestedSuite = process.env.XANDEFLIX_SMOKE_SUITE?.trim() ?? '';

if (
  !temporaryRoot.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
  !path.basename(temporaryRoot).startsWith('xandeflix-u2f2-smoke-')
) {
  throw new Error('U2F2_SMOKE_TEMP_PATH_REJECTED');
}

if (!browserExecutable) {
  throw new Error('U2F2_SMOKE_HEADLESS_BROWSER_NOT_FOUND');
}

const entrySource = `
import { runHomeDiscoveryPresentationSmokeTest } from '@/features/catalog/services/homeDiscoveryPresentationSmokeTest.service';
import { runHomeHotReturnSmokeTest } from '@/features/catalog/services/homeHotReturnSmokeTest.service';
import { runDiscoveryPresentationLifecycleSmokeTest } from '@/features/catalog/services/discoveryPresentationLifecycleSmokeTest.service';
import { runDiscoveryRuntimePresentationStoreSmokeTest } from '@/features/catalog/services/discoveryRuntimePresentationStoreSmokeTest.service';
import { runDiscoverySelectorSmokeTest } from '@/features/catalog/services/discoverySelectorSmokeTest.service';
import { runU2F23NavigationCorrectnessSmokeTest } from '@/features/catalog/services/u2f23NavigationCorrectnessSmokeTest.service';
import { runLocalCatalogArtworkSmokeTest } from '@/features/localCatalog/services/localCatalogArtworkSmokeTest.service';
import { runLocalCatalogDiscoveryCandidateReadModelSmokeTest } from '@/features/localCatalog/services/localCatalogDiscoveryCandidateReadModelSmokeTest.service';
import { runLocalCatalogReadabilitySmokeTest } from '@/features/localCatalog/services/localCatalogReadabilitySmokeTest.service';
import { runLocalCatalogRuntimeSnapshotBridgeSmokeTest } from '@/features/localCatalog/services/localCatalogRuntimeSnapshotBridgeSmokeTest.service';
import { runLocalCatalogSearchSmokeTest } from '@/features/localCatalog/services/localCatalogSearchSmokeTest.service';
import { runLocalCatalogSeriesLookupSmokeTest } from '@/features/localCatalog/services/localCatalogSeriesLookupSmokeTest.service';
import { runLocalCatalogSchemaSmokeTest } from '@/features/localCatalog/services/localCatalogSchemaSmokeTest.service';
import { runLocalCatalogSmokeTest } from '@/features/localCatalog/services/localCatalogSmokeTest.service';
import { runLocalCatalogSnapshotImportSmokeTest } from '@/features/localCatalog/services/localCatalogSnapshotImportSmokeTest.service';
import { runLocalCatalogSnapshotLifecycleSmokeTest } from '@/features/localCatalog/services/localCatalogSnapshotLifecycleSmokeTest.service';
import { runLocalPlaylistImportSmokeTest } from '@/features/localCatalog/services/localPlaylistImportSmokeTest.service';
import { runAuthorizedIptvSourceRuntimeContextSmokeTest } from '@/features/playlists/services/authorizedIptvSourceRuntimeContextSmokeTest.service';

const allSuites = [
  ['artwork', runLocalCatalogArtworkSmokeTest],
  ['readability', runLocalCatalogReadabilitySmokeTest],
  ['catalog-v2', runLocalCatalogSmokeTest],
  ['playlist-import-v2', runLocalPlaylistImportSmokeTest],
  ['schema-v3', runLocalCatalogSchemaSmokeTest],
  ['snapshot-lifecycle', runLocalCatalogSnapshotLifecycleSmokeTest],
  ['snapshot-import', runLocalCatalogSnapshotImportSmokeTest],
  ['runtime-snapshot-bridge', runLocalCatalogRuntimeSnapshotBridgeSmokeTest],
  ['search-u2f4', runLocalCatalogSearchSmokeTest],
  ['series-lookup-u2f4d1b1', runLocalCatalogSeriesLookupSmokeTest],
  ['authorization-context', runAuthorizedIptvSourceRuntimeContextSmokeTest],
  ['navigation', runU2F23NavigationCorrectnessSmokeTest],
  ['hot-return', runHomeHotReturnSmokeTest],
  ['discovery-1', runDiscoverySelectorSmokeTest],
  ['discovery-2a', runLocalCatalogDiscoveryCandidateReadModelSmokeTest],
  ['discovery-2b', runDiscoveryPresentationLifecycleSmokeTest],
  ['discovery-3a1', runDiscoveryRuntimePresentationStoreSmokeTest],
  ['discovery-3a2', runHomeDiscoveryPresentationSmokeTest],
];
const suites = ${JSON.stringify(requestedSuite)}
  ? allSuites.filter(([name]) => name === ${JSON.stringify(requestedSuite)})
  : allSuites;

const results = {};

for (const [name, run] of suites) {
  try {
    results[name] = await run();
  } catch (error) {
    results[name] = {
      ok: false,
      errorCode:
        error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : 'U2F2_SMOKE_UNEXPECTED_ERROR',
    };
  }
}

const output = {
  pass: Object.values(results).every((result) => result?.ok === true),
  results,
};
const pre = document.createElement('pre');
pre.id = 'xandeflix-smoke-result';
pre.dataset.status = output.pass ? 'pass' : 'fail';
pre.textContent = JSON.stringify(output);
document.body.replaceChildren(pre);
globalThis.clearInterval(globalThis.__xandeflixSmokeHold);
`;

let server;
let browserProcess;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDevtoolsPort() {
  const portFile = path.join(browserProfile, 'DevToolsActivePort');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/);

      if (port) {
        return Number(port);
      }
    } catch {
      // Chrome creates the file after its profile and debugger are ready.
    }

    await delay(100);
  }

  throw new Error('U2F2_SMOKE_DEVTOOLS_PORT_TIMEOUT');
}

async function waitForPageTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    const pageTarget = targets.find(
      (target) =>
        target.type === 'page' &&
        target.url.startsWith('http://127.0.0.1:'),
    );

    if (pageTarget?.webSocketDebuggerUrl) {
      return pageTarget.webSocketDebuggerUrl;
    }

    await delay(100);
  }

  throw new Error('U2F2_SMOKE_PAGE_TARGET_TIMEOUT');
}

async function readBrowserSmokeResult(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const handler = pending.get(message.id);

    if (handler) {
      pending.delete(message.id);
      handler(message);
    }
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  try {
    const id = nextId;
    nextId += 1;
    const responsePromise = new Promise((resolve) => pending.set(id, resolve));

    socket.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: {
          awaitPromise: true,
          returnByValue: true,
          expression: `(async () => {
            const deadline = Date.now() + 180000;
            while (Date.now() < deadline) {
              const result = document.querySelector(
                '#xandeflix-smoke-result[data-status]',
              );
              if (result) return result.textContent;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw new Error('U2F2_SMOKE_BROWSER_RESULT_TIMEOUT');
          })()`,
        },
      }),
    );
    const response = await responsePromise;
    if (response.error?.message) {
      throw new Error(response.error.message);
    }
    const exception =
      response.result?.exceptionDetails?.exception?.description ??
      response.result?.exceptionDetails?.text;

    if (exception) {
      throw new Error(exception);
    }

    const value = response.result?.result?.value;

    if (typeof value !== 'string') {
      process.stderr.write(`${JSON.stringify(response, null, 2)}\n`);
    }

    return value;
  } finally {
    socket.close();
  }
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
      'import.meta.env.VITE_LOCAL_CATALOG_SMOKE_TEST': JSON.stringify(
        'false',
      ),
      'import.meta.env.VITE_LOCAL_CATALOG_SNAPSHOT_IMPORT_ENABLED':
        JSON.stringify('false'),
      'import.meta.env.VITE_LOCAL_CATALOG_SNAPSHOT_PROMOTION_ENABLED':
        JSON.stringify('false'),
    },
    resolve: {
      alias: {
        '@': path.resolve(repositoryRoot, 'src'),
      },
    },
    plugins: [
      {
        name: 'xandeflix-u2f2-smoke-entry',
        resolveId(id) {
          return id === 'virtual:xandeflix-u2f2-smokes'
            ? `\0${id}`
            : null;
        },
        load(id) {
          return id === '\0virtual:xandeflix-u2f2-smokes'
            ? entrySource
            : null;
        },
      },
    ],
    build: {
      emptyOutDir: true,
      minify: false,
      outDir: outputDirectory,
      rollupOptions: {
        input: 'virtual:xandeflix-u2f2-smokes',
        output: {
          entryFileNames: 'smoke.js',
          format: 'es',
        },
      },
    },
  });

  await writeFile(
    path.join(outputDirectory, 'index.html'),
    `<!doctype html><html><body><p>running</p>
      <script>
        globalThis.__xandeflixSmokeHold = globalThis.setInterval(
          () => undefined,
          1000,
        );
        const renderFailure = (value) => {
          const pre = document.createElement('pre');
          pre.id = 'xandeflix-smoke-result';
          pre.dataset.status = 'fail';
          pre.textContent = JSON.stringify({
            pass: false,
            browserError: String(value?.message || value?.reason || value),
          });
          document.body.replaceChildren(pre);
          globalThis.clearInterval(globalThis.__xandeflixSmokeHold);
        };
        window.addEventListener('error', renderFailure);
        window.addEventListener('unhandledrejection', renderFailure);
      </script>
      <script type="module" src="/smoke.js"></script>
    </body></html>`,
    'utf8',
  );

  server = createServer(async (request, response) => {
    const requestedPath =
      request.url === '/smoke.js' ? 'smoke.js' : 'index.html';
    const body = await process
      .getBuiltinModule('node:fs/promises')
      .readFile(path.join(outputDirectory, requestedPath));

    response.statusCode = 200;
    response.setHeader(
      'Content-Type',
      requestedPath.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : 'text/html; charset=utf-8',
    );
    response.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;

  if (!port) {
    throw new Error('U2F2_SMOKE_SERVER_PORT_UNAVAILABLE');
  }

  browserProcess = spawn(
    browserExecutable,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${browserProfile}`,
      '--remote-debugging-port=0',
      `http://127.0.0.1:${port}/`,
    ],
    {
      windowsHide: true,
      stdio: 'ignore',
    },
  );
  const devtoolsPort = await waitForDevtoolsPort();
  let serializedResult;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pageTarget = await waitForPageTarget(devtoolsPort);
    // The target can be reported while Chrome is still replacing its initial
    // execution context with the requested smoke page.
    await delay(3000);
    try {
      serializedResult = await readBrowserSmokeResult(pageTarget);
      break;
    } catch (error) {
      if (
        !String(error).includes('Execution context was destroyed') ||
        attempt === 2
      ) {
        throw error;
      }
      await delay(1000);
    }
  }

  if (typeof serializedResult !== 'string') {
    throw new Error('U2F2_SMOKE_RESULT_NOT_RENDERED');
  }

  const result = JSON.parse(serializedResult);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.pass !== true) {
    process.exitCode = 1;
  }
} finally {
  if (browserProcess && browserProcess.exitCode === null) {
    browserProcess.kill();
    await Promise.race([
      once(browserProcess, 'exit'),
      delay(3000),
    ]);
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 250,
  });
}
