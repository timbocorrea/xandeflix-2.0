import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';
import { build, createServer } from 'vite';

const repositoryRoot = process.cwd();
const smokeEntry = path.resolve(
  repositoryRoot,
  'src/features/bootstrap/services/clientRuntimeAccessSmokeTest.service.ts',
);
const temporaryPrefix = path.join(
  os.tmpdir(),
  'xandeflix-u2-runtime-access-smoke-',
);
const viteDefinitions = {
  'process.env.NODE_ENV': JSON.stringify('development'),
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
    'https://fakeproject.supabase.co',
  ),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fakekey'),
  'import.meta.env.VITE_LOCAL_CATALOG_SNAPSHOT_IMPORT_ENABLED':
    JSON.stringify('false'),
  'import.meta.env.VITE_LOCAL_CATALOG_SNAPSHOT_PROMOTION_ENABLED':
    JSON.stringify('false'),
  'import.meta.env.VITE_LOCAL_CATALOG_WORKER_ENABLED': JSON.stringify('false'),
};

function emitRuntimeAccessStage(stage) {
  process.stderr.write(`${JSON.stringify({ runtimeAccessStage: stage })}\n`);
}

function sanitizeFailureCode(error, fallback) {
  if (
    error instanceof Error &&
    /^[A-Z0-9_]+$/.test(error.message)
  ) {
    return error.message;
  }

  return fallback;
}

function assertCondition(condition, errorCode) {
  if (!condition) {
    throw new Error(errorCode);
  }
}

function validateSmokeResult(result, environment) {
  assertCondition(
    result && Object.getPrototypeOf(result) === Object.prototype,
    `${environment}_RESULT_INVALID`,
  );
  if (result.ok !== true) {
    const reportedErrorCode =
      typeof result.errorCode === 'string' &&
      /^[A-Z0-9_]+$/.test(result.errorCode)
        ? result.errorCode
        : `${environment}_RESULT_NOT_OK`;
    throw new Error(reportedErrorCode);
  }

  for (const [key, value] of Object.entries(result)) {
    if (key === 'ok') {
      continue;
    }

    if (key === 'REACT_WARNING_COUNT') {
      assertCondition(value === 0, `${environment}_REACT_WARNING_DETECTED`);
      continue;
    }

    assertCondition(value === true, `${environment}_${key}_FAILED`);
  }
}

function installJSDOMGlobals(dom) {
  const descriptors = new Map();
  const values = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    EventTarget: dom.window.EventTarget,
    Storage: dom.window.Storage,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    DOMException: dom.window.DOMException,
    AbortController: dom.window.AbortController,
    AbortSignal: dom.window.AbortSignal,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  };

  for (const [name, value] of Object.entries(values)) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value,
    });
  }

  return () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  };
}

async function runJSDOMSmoke(temporaryRoot) {
  emitRuntimeAccessStage('JSDOM_START');
  const nodeOutputRoot = path.join(temporaryRoot, 'node');
  await mkdir(nodeOutputRoot, { recursive: true });

  emitRuntimeAccessStage('JSDOM_BUILD_START');
  await build({
    configFile: false,
    mode: 'development',
    logLevel: 'error',
    define: viteDefinitions,
    ssr: {
      noExternal: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(repositoryRoot, 'src'),
      },
    },
    build: {
      emptyOutDir: false,
      minify: false,
      outDir: nodeOutputRoot,
      ssr: smokeEntry,
      rollupOptions: {
        output: {
          entryFileNames: 'runtime-access-smoke.mjs',
        },
      },
    },
  });
  emitRuntimeAccessStage('JSDOM_BUILD_END');

  emitRuntimeAccessStage('JSDOM_INIT_START');
  const dom = new JSDOM(
    '<!doctype html><html><body></body></html>',
    {
      pretendToBeVisual: true,
      url: 'http://127.0.0.1/runtime-access-smoke',
    },
  );
  const restoreGlobals = installJSDOMGlobals(dom);
  globalThis.__xandeflixRuntimeAccessStage = (stage) =>
    emitRuntimeAccessStage(`JSDOM_${stage}`);
  emitRuntimeAccessStage('JSDOM_INIT_END');

  try {
    emitRuntimeAccessStage('JSDOM_IMPORT_START');
    const smokeModule = await import(
      `${pathToFileURL(
        path.join(nodeOutputRoot, 'runtime-access-smoke.mjs'),
      ).href}?v=${Date.now()}`
    );
    emitRuntimeAccessStage('JSDOM_IMPORT_END');
    emitRuntimeAccessStage('JSDOM_TEST_START');
    const result = await smokeModule.runClientRuntimeAccessSmokeTest();
    emitRuntimeAccessStage('JSDOM_TEST_END');
    validateSmokeResult(result, 'JSDOM');
    return result;
  } finally {
    emitRuntimeAccessStage('JSDOM_CLEANUP_START');
    dom.window.close();
    Reflect.deleteProperty(globalThis, '__xandeflixRuntimeAccessStage');
    restoreGlobals();
    emitRuntimeAccessStage('JSDOM_CLEANUP_END');
  }
}

async function isExecutableFile(candidate) {
  if (!candidate) {
    return false;
  }

  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function findExecutableOnPath(names) {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';

  for (const name of names) {
    const result = spawnSync(command, [name], {
      encoding: 'utf8',
      windowsHide: true,
    });

    if (result.status === 0) {
      const executable = result.stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find(Boolean);

      if (executable) {
        return executable;
      }
    }
  }

  return null;
}

async function findBrowserExecutable() {
  const environmentCandidates = [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
  ];

  for (const candidate of environmentCandidates) {
    if (await isExecutableFile(candidate)) {
      return path.resolve(candidate);
    }
  }

  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 =
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const orderedCandidates = [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(
      programFilesX86,
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    ),
    localAppData
      ? path.join(
          localAppData,
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        )
      : null,
    path.join(
      programFiles,
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    ),
    path.join(
      programFilesX86,
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    ),
    localAppData
      ? path.join(
          localAppData,
          'Microsoft',
          'Edge',
          'Application',
          'msedge.exe',
        )
      : null,
  ];

  for (const candidate of orderedCandidates) {
    if (await isExecutableFile(candidate)) {
      return path.resolve(candidate);
    }
  }

  const pathExecutable = findExecutableOnPath([
    'google-chrome',
    'chrome',
    'msedge',
    'chromium',
    'chromium-browser',
  ]);

  if (pathExecutable && (await isExecutableFile(pathExecutable))) {
    return path.resolve(pathExecutable);
  }

  throw new Error('BLOCKED_BROWSER_NOT_FOUND');
}

async function runBrowserProcess(browserExecutable, browserUrl, profileRoot) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileRoot}`,
    '--virtual-time-budget=60000',
    '--dump-dom',
    browserUrl,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(browserExecutable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 90_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        reject(new Error('BROWSER_EXECUTION_TIMEOUT'));
        return;
      }

      if (code !== 0) {
        const diagnostic = stderr.trim();
        reject(
          new Error(
            diagnostic
              ? 'BROWSER_EXECUTION_NONZERO_EXIT'
              : 'BROWSER_EXECUTION_EMPTY_FAILURE',
          ),
        );
        return;
      }

      resolve(stdout);
    });
  });
}

async function writeBrowserEntry(browserRoot) {
  const normalizedSmokeEntry = smokeEntry.replaceAll('\\', '/');
  const browserImport = `/@fs/${normalizedSmokeEntry}`;
  const html = [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8"><title>Runtime access smoke</title></head>',
    '<body>',
    '<pre id="runtime-access-result"></pre>',
    '<script type="module" src="/browser-entry.ts"></script>',
    '</body>',
    '</html>',
  ].join('');
  const browserEntry = `
import { runClientRuntimeAccessSmokeTest } from ${JSON.stringify(browserImport)};

const marker = document.getElementById('runtime-access-result');

if (!marker) {
  throw new Error('BROWSER_RESULT_MARKER_MISSING');
}

try {
  const result = await runClientRuntimeAccessSmokeTest();
  marker.textContent = JSON.stringify(result);
} catch (error) {
  const errorCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : 'BROWSER_RUNTIME_ACCESS_SMOKE_FAILED';
  marker.textContent = JSON.stringify({ ok: false, errorCode });
}
`;

  await writeFile(path.join(browserRoot, 'index.html'), html, 'utf8');
  await writeFile(
    path.join(browserRoot, 'browser-entry.ts'),
    browserEntry,
    'utf8',
  );
}

async function runBrowserSmoke(temporaryRoot, browserExecutable) {
  emitRuntimeAccessStage('BROWSER_START');
  const browserRoot = path.join(temporaryRoot, 'browser');
  const profileRoot = path.join(temporaryRoot, 'browser-profile');
  await mkdir(browserRoot, { recursive: true });
  await mkdir(profileRoot, { recursive: true });
  await writeBrowserEntry(browserRoot);

  const previousNodeEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const server = await createServer({
    configFile: false,
    mode: 'development',
    root: browserRoot,
    cacheDir: path.join(temporaryRoot, 'vite-cache'),
    logLevel: 'error',
    define: viteDefinitions,
    resolve: {
      alias: {
        '@': path.resolve(repositoryRoot, 'src'),
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          'process.env.NODE_ENV': JSON.stringify('development'),
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      fs: {
        allow: [repositoryRoot, browserRoot],
      },
    },
  });

  try {
    emitRuntimeAccessStage('BROWSER_SERVER_START');
    await server.listen();
    const address = server.httpServer?.address();
    assertCondition(
      address && typeof address === 'object',
      'BROWSER_VITE_ADDRESS_UNAVAILABLE',
    );
    const browserUrl = `http://127.0.0.1:${address.port}/`;
    emitRuntimeAccessStage('BROWSER_SERVER_END');
    emitRuntimeAccessStage('BROWSER_PROCESS_START');
    const dumpedDom = await runBrowserProcess(
      browserExecutable,
      browserUrl,
      profileRoot,
    );
    emitRuntimeAccessStage('BROWSER_PROCESS_END');
    const parsedDom = new JSDOM(dumpedDom);

    try {
      const marker = parsedDom.window.document.getElementById(
        'runtime-access-result',
      );
      assertCondition(marker, 'BROWSER_RESULT_MARKER_MISSING');
      const serializedResult = marker.textContent?.trim();
      assertCondition(serializedResult, 'BROWSER_RESULT_EMPTY');
      const result = JSON.parse(serializedResult);
      emitRuntimeAccessStage('BROWSER_RESULT_PARSED');
      validateSmokeResult(result, 'BROWSER');
      return result;
    } finally {
      parsedDom.window.close();
    }
  } finally {
    emitRuntimeAccessStage('BROWSER_SERVER_CLEANUP_START');
    await server.close();
    if (previousNodeEnvironment === undefined) {
      Reflect.deleteProperty(process.env, 'NODE_ENV');
    } else {
      process.env.NODE_ENV = previousNodeEnvironment;
    }
    emitRuntimeAccessStage('BROWSER_SERVER_CLEANUP_END');
  }
}

let temporaryRoot = null;
let outputPayload = null;
let finalExitCode = 0;

try {
  emitRuntimeAccessStage('RUNNER_START');
  temporaryRoot = await mkdtemp(temporaryPrefix);
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  const resolvedSystemTemporaryRoot = path.resolve(os.tmpdir());
  assertCondition(
    resolvedTemporaryRoot.startsWith(
      `${resolvedSystemTemporaryRoot}${path.sep}`,
    ) &&
      path.basename(resolvedTemporaryRoot).startsWith(
        'xandeflix-u2-runtime-access-smoke-',
      ),
    'U2_RUNTIME_ACCESS_SMOKE_TEMP_PATH_REJECTED',
  );

  emitRuntimeAccessStage('JSDOM_CALL_START');
  const jsdomResult = await runJSDOMSmoke(resolvedTemporaryRoot);
  emitRuntimeAccessStage('JSDOM_CALL_END');
  emitRuntimeAccessStage('BROWSER_LOOKUP_START');
  const browserExecutable = await findBrowserExecutable();
  emitRuntimeAccessStage('BROWSER_LOOKUP_END');
  const browserResult = await runBrowserSmoke(
    resolvedTemporaryRoot,
    browserExecutable,
  );
  outputPayload = {
    ok: jsdomResult.ok && browserResult.ok,
    JSDOM_RUNTIME_EXECUTION: jsdomResult,
    BROWSER_EXECUTION: {
      executable: browserExecutable,
      result: browserResult,
    },
  };

} catch (error) {
  emitRuntimeAccessStage('RUNNER_ERROR');
  const errorCode = sanitizeFailureCode(
    error,
    'U2_RUNTIME_ACCESS_SMOKE_FAILED',
  );
  outputPayload = { ok: false, errorCode };
  finalExitCode = 1;
} finally {
  emitRuntimeAccessStage('CLEANUP_START');
  if (temporaryRoot) {
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    const resolvedSystemTemporaryRoot = path.resolve(os.tmpdir());
    if (
      resolvedTemporaryRoot.startsWith(
        `${resolvedSystemTemporaryRoot}${path.sep}`,
      ) &&
      path.basename(resolvedTemporaryRoot).startsWith(
        'xandeflix-u2-runtime-access-smoke-',
      )
    ) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
  emitRuntimeAccessStage('CLEANUP_END');
}

emitRuntimeAccessStage('OUTPUT_START');
await new Promise((resolve, reject) => {
  process.stdout.write(
    `${JSON.stringify(outputPayload, null, 2)}\n`,
    (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    },
  );
});
emitRuntimeAccessStage('OUTPUT_END');
process.exit(finalExitCode);
