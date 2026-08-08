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
  'src/features/bootstrap/services/multiDeviceBootstrapSmokeTest.service.ts',
);
const temporaryPrefix = path.join(
  os.tmpdir(),
  'xandeflix-multi-device-bootstrap-smoke-',
);
const viteDefinitions = {
  'process.env.NODE_ENV': JSON.stringify('development'),
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fakeproject.supabase.co'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fakekey'),
};

function sanitizeFailureCode(error, fallback) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) {
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
      typeof result.errorCode === 'string' && /^[A-Z0-9_]+$/.test(result.errorCode)
        ? result.errorCode
        : `${environment}_RESULT_NOT_OK`;
    throw new Error(reportedErrorCode);
  }

  for (const [key, value] of Object.entries(result)) {
    if (key === 'ok') {
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
  const nodeOutputRoot = path.join(temporaryRoot, 'node');
  await mkdir(nodeOutputRoot, { recursive: true });

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
          entryFileNames: 'multi-device-bootstrap-smoke.mjs',
        },
      },
    },
  });

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://127.0.0.1/multi-device-bootstrap-smoke',
  });
  const restoreGlobals = installJSDOMGlobals(dom);

  try {
    const smokeModule = await import(
      `${pathToFileURL(
        path.join(nodeOutputRoot, 'multi-device-bootstrap-smoke.mjs'),
      ).href}?v=${Date.now()}`
    );
    const result = await smokeModule.runMultiDeviceBootstrapSmokeTest();
    validateSmokeResult(result, 'JSDOM');
    return result;
  } finally {
    dom.window.close();
    restoreGlobals();
  }
}

let temporaryRoot = null;
let outputPayload = null;
let finalExitCode = 0;

try {
  temporaryRoot = await mkdtemp(temporaryPrefix);
  const jsdomResult = await runJSDOMSmoke(temporaryRoot);
  outputPayload = {
    ok: jsdomResult.ok,
    MULTI_DEVICE_BOOTSTRAP_EXECUTION: jsdomResult,
  };
} catch (error) {
  const errorCode = sanitizeFailureCode(error, 'MULTI_DEVICE_BOOTSTRAP_SMOKE_FAILED');
  outputPayload = { ok: false, errorCode, errorMessage: error.message };
  finalExitCode = 1;
} finally {
  if (temporaryRoot) {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
  }
}

process.stdout.write(`${JSON.stringify(outputPayload, null, 2)}\n`);
process.exit(finalExitCode);
