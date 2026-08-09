import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const rootDir = process.cwd();

async function runSmoke() {
  console.log('=== VS-03 LIVE CONTINUITY SMOKE RUNNER ===');

  const liveTvPagePath = path.join(
    rootDir,
    'src/features/live/pages/LiveTvPage.tsx',
  );
  const nativePluginPath = path.join(
    rootDir,
    'android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java',
  );
  const continuityServicePath = path.join(
    rootDir,
    'src/features/live/services/liveContinuity.service.ts',
  );
  const continuitySmokePath = path.join(
    rootDir,
    'src/features/live/services/liveContinuitySmokeTest.service.ts',
  );

  const liveTvPageCode = fs.readFileSync(liveTvPagePath, 'utf8');
  const nativePluginCode = fs.readFileSync(nativePluginPath, 'utf8');
  const serviceCode = fs.readFileSync(continuityServicePath, 'utf8');
  const smokeCode = fs.readFileSync(continuitySmokePath, 'utf8');

  // Source-level static assertions
  const liveTvStateAttribute = liveTvPageCode.includes(
    'data-xf-live-state={liveState}',
  );
  const liveTvStateLoading = liveTvPageCode.includes('"loading"') || liveTvPageCode.includes("'loading'");
  const liveTvStateContent = liveTvPageCode.includes('"content"') || liveTvPageCode.includes("'content'");
  const liveTvStateEmpty = liveTvPageCode.includes('"empty"') || liveTvPageCode.includes("'empty'");
  const liveTvStateError = liveTvPageCode.includes('"error"') || liveTvPageCode.includes("'error'");
  const liveTvRetryButton =
    liveTvPageCode.includes('live-source-retry') ||
    liveTvPageCode.includes('focusKey="live-source-retry"');
  const liveTvContinuityIntegration =
    liveTvPageCode.includes('resolveLiveContinuity') &&
    liveTvPageCode.includes('saveLiveLastChannel');
  const restoreUsesLoadedCatalogAndStableScope =
    liveTvPageCode.includes('const restorePreviewFromCatalog = useCallback') &&
    liveTvPageCode.includes('continuityScopeRef.current = scope') &&
    liveTvPageCode.includes('const restoreContextKey = scope') &&
    liveTvPageCode.includes('resolveLiveContinuity(scope, liveChannels).channel') &&
    liveTvPageCode.includes('void startChannelPreview(restoredChannel)');
  const restoreDoesNotInvalidateSourceLoad =
    !liveTvPageCode.includes(
      '[channels, loadFromChannels, loadFromSource, retryTick, startChannelPreview, status]',
    ) &&
    !liveTvPageCode.includes('setContinuityScope(') &&
    liveTvPageCode.includes(
      '}, [loadFromChannels, loadFromSource, restorePreviewFromCatalog, retryTick]);',
    );
  const fallbackPromotesDeterministicLocalIds =
    liveTvPageCode.includes('const importedLocalLiveChannels =') &&
    liveTvPageCode.includes('channels: importedLocalLiveChannels');
  const opaqueLicenseScopeOnly =
    liveTvPageCode.includes(
      'authorizationContext?.internalLicenseId.trim() ?? ""',
    ) &&
    !liveTvPageCode.includes(
      'authorizedSource.license?.id?.trim() ||\n          storedActivation?.licenseCode?.trim()',
    );

  const nativeInlineFitMode = nativePluginCode.includes(
    'inlinePreviewView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT)',
  );
  const nativeInlineFillModeAbsent = !nativePluginCode.includes(
    'inlinePreviewView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL)',
  );

  const sourceAssertions = {
    liveTvStateAttribute,
    liveTvStateLoading,
    liveTvStateContent,
    liveTvStateEmpty,
    liveTvStateError,
    liveTvRetryButton,
    liveTvContinuityIntegration,
    restoreUsesLoadedCatalogAndStableScope,
    restoreDoesNotInvalidateSourceLoad,
    fallbackPromotesDeterministicLocalIds,
    opaqueLicenseScopeOnly,
    nativeInlineFitMode,
    nativeInlineFillModeAbsent,
  };

  const sourceAssertionsOk = Object.values(sourceAssertions).every(Boolean);

  // In-memory TypeScript transpilation & ESM Data URL execution
  const serviceTranspiled = ts.transpileModule(serviceCode, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  }).outputText;

  const serviceDataUrl = `data:text/javascript;base64,${Buffer.from(
    serviceTranspiled,
  ).toString('base64')}`;

  const smokeCodePatched = smokeCode.replace(
    /from\s+['"]\.\/liveContinuity\.service['"]/g,
    `from '${serviceDataUrl}'`,
  );

  const smokeTranspiled = ts.transpileModule(smokeCodePatched, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  }).outputText;

  const smokeDataUrl = `data:text/javascript;base64,${Buffer.from(
    smokeTranspiled,
  ).toString('base64')}`;

  const smokeModule = await import(smokeDataUrl);
  const smokeResults = smokeModule.runLiveContinuitySmokeTest();

  const restartRegression = {
    RESTART_PERSISTENCE_REGRESSION:
      Boolean(smokeResults?.restartPersistenceRegression) &&
      restoreUsesLoadedCatalogAndStableScope &&
      restoreDoesNotInvalidateSourceLoad,
    PREVIEW_SELECTION_PERSISTS: Boolean(
      smokeResults?.previewSelectionPersists,
    ),
    PROCESS_RESTART_RESTORE:
      Boolean(smokeResults?.processRestartRestore) &&
      fallbackPromotesDeterministicLocalIds,
    PROCESS_RESTART_AUTOPREVIEW:
      Boolean(smokeResults?.processRestartAutopreview) &&
      restoreUsesLoadedCatalogAndStableScope,
    SCOPE_ISOLATION_AFTER_RESTART:
      Boolean(smokeResults?.scopeIsolationAfterRestart) &&
      opaqueLicenseScopeOnly,
  };

  const pass =
    Boolean(smokeResults?.ok) &&
    sourceAssertionsOk &&
    Object.values(restartRegression).every(Boolean);

  const summary = {
    pass,
    smokeResults,
    sourceAssertions,
    restartRegression,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!pass) {
    process.exit(1);
  }
}

runSmoke().catch((err) => {
  console.error('[VS03_LIVE_SMOKE_RUNNER_FATAL_ERROR]', err);
  process.exit(1);
});
