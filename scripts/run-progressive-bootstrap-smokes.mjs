import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'vite';

const repositoryRoot = process.cwd();
const temporaryRoot = path.resolve(
  os.tmpdir(),
  `xandeflix-progressive-bootstrap-smoke-${process.pid}-${Date.now()}`,
);
const smokeEntry = path.resolve(
  repositoryRoot,
  'src/features/localCatalog/readModels/localCatalogFirstFoldReadModelSmokeTest.service.ts',
);

async function readSource(relativePath) {
  const content = await readFile(path.resolve(repositoryRoot, relativePath), 'utf8');
  return content.replace(/\r\n/g, '\n');
}

const SAFE_DIAGNOSTIC_SOURCE_ENUMS = [
  'active_snapshot_v3_indexed',
  'active_snapshot_v3_direct_fallback',
  'staging_snapshot_v3_direct_fallback',
  'legacy_v2_fallback',
  'active_snapshot',
  'legacy_repository',
  'unavailable',
];
const safeDiagnosticSourceEnum = SAFE_DIAGNOSTIC_SOURCE_ENUMS.join('|');
const safeDiagnosticSourceFieldPattern = new RegExp(
  `\\bsource\\s*:\\s*(?:['"](?:${safeDiagnosticSourceEnum})['"]|(?:\\r?\\n\\s*(?:\\|\\s*['"](?:${safeDiagnosticSourceEnum})['"]\\s*)+;))`,
  'g',
);
const forbiddenDiagnosticFieldPattern =
  /\b(?:url|token|license|password|authorization|username|credential|source|channel)\w*\s*[:=]/;

function hasForbiddenDiagnosticTransportField(source) {
  return forbiddenDiagnosticFieldPattern.test(
    source.replace(safeDiagnosticSourceFieldPattern, ''),
  );
}

let exitCode = 0;
let outputPayload = {};

try {
  // 1. Build smoke test entry with Vite for bundle integrity verification
  await build({
    configFile: false,
    logLevel: 'error',
    resolve: {
      alias: {
        '@': path.resolve(repositoryRoot, 'src'),
      },
    },
    ssr: {
      noExternal: true,
    },
    define: {
      'import.meta.env.VITE_LOCAL_CATALOG_SNAPSHOT_IMPORT_ENABLED': '"true"',
      'import.meta.env.VITE_LOCAL_CATALOG_SNAPSHOT_PROMOTION_ENABLED': '"false"',
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

  // 2. Behavioral Execution of VOD Candidate Detection on Raw IPTV Fixtures (No contentKind)
  const smokeModule = await import(pathToFileURL(path.join(temporaryRoot, 'smoke.mjs')).href);
  const behavioralVodResult = await smokeModule.runVodCandidatePredicateBehavioralTest();
  assert.ok(behavioralVodResult.ok, 'Behavioral: VOD Candidate predicate must correctly recognize movie and series channels without contentKind property');
  assert.ok(behavioralVodResult.movieChannelWithoutContentKindDetected, 'Behavioral: Movie channel without contentKind must be recognized as VOD');
  assert.ok(behavioralVodResult.seriesChannelWithoutContentKindDetected, 'Behavioral: Series channel without contentKind must be recognized as VOD');
  assert.ok(behavioralVodResult.liveChannelWithoutContentKindIgnored, 'Behavioral: Live channel without contentKind must NOT be recognized as VOD');
  assert.ok(behavioralVodResult.mixedBatchWithMovieDetected, 'Behavioral: Mixed batch with movie must trigger hasVodCandidate');
  assert.ok(behavioralVodResult.mixedBatchWithSeriesDetected, 'Behavioral: Mixed batch with series must trigger hasVodCandidate');
  assert.ok(behavioralVodResult.liveOnlyBatchIgnored, 'Behavioral: Live-only batch must NOT trigger hasVodCandidate');

  const homeRenderabilityResult =
    smokeModule.runHomeVodRenderabilityBehavioralTest();
  assert.ok(homeRenderabilityResult.ok, 'E.8.4F-R: Canonical Home renderability behavior must pass');
  assert.ok(homeRenderabilityResult.validVodSectionAccepted, 'E.8.4F-R: Valid VOD section with items must be accepted');
  assert.ok(homeRenderabilityResult.emptySectionRejected, 'E.8.4F-R: Empty section must be rejected');
  assert.ok(homeRenderabilityResult.canalPrefixRejected, 'E.8.4F-R: canal prefix must be rejected');
  assert.ok(homeRenderabilityResult.canaisPrefixRejected, 'E.8.4F-R: canais prefix must be rejected');
  assert.ok(homeRenderabilityResult.aoVivoRejected, 'E.8.4F-R: ao vivo title must be rejected');
  assert.ok(homeRenderabilityResult.normalizedCaseRejected, 'E.8.4F-R: Case and whitespace normalization must be preserved');
  assert.ok(homeRenderabilityResult.firstFoldFalseReadyPrevented, 'E.8.4F-R: Live-like section must not satisfy first-fold readiness');
  assert.ok(homeRenderabilityResult.firstFoldTrueReadyAllowed, 'E.8.4F-R: Home-acceptable VOD section must satisfy first-fold readiness');
  assert.ok(homeRenderabilityResult.predicateParity, 'E.8.4F-R: First-fold and Home renderability semantics must remain identical');

  const categoryAuthorityResult =
    smokeModule.runCategoryAuthoritySelectionBehavioralTest();
  assert.ok(categoryAuthorityResult.ok, 'E.8.4I-A: Stable category content must precede staging and empty selection must remain Preparing');
  assert.ok(categoryAuthorityResult.stablePriority, 'E.8.4I-A: Active/stable category content must retain priority');
  assert.ok(categoryAuthorityResult.stagingFallback, 'E.8.4I-A: Staging must be a non-authoritative fallback only');
  assert.ok(categoryAuthorityResult.truePreparing, 'E.8.4I-A: No stable or staging content must remain true Preparing');

  const liveConformanceResult =
    await smokeModule.runLocalLiveCatalogConformanceSmokeTest();
  if (!liveConformanceResult.ok) {
    console.error('LIVE CONFORMANCE RESULT DEBUG:', liveConformanceResult);
  }
  assert.ok(liveConformanceResult.ok, 'E.8.4I-B.2: Canonical Live catalog conformance behavior must pass');
  assert.ok(liveConformanceResult.LIVE_ACTIVE_PRIORITY_TEST, 'E.8.4I-B.2: Active priority over V2 and Staging must pass');
  assert.ok(liveConformanceResult.LIVE_V2_BEFORE_STAGING_TEST, 'E.8.4I-B.2: V2 stable priority over Staging must pass');
  assert.ok(liveConformanceResult.LIVE_PARTIAL_STAGING_TEST, 'E.8.4I-B.2: Staging fallback when active and V2 empty must pass');
  assert.ok(liveConformanceResult.LIVE_NO_FALSE_EMPTY, 'E.8.4I-B.2: True preparing when staging has no live items must pass');
  assert.ok(liveConformanceResult.LIVE_SCOPE_ISOLATION, 'E.8.4I-B.2: Scope isolation in live reader must pass');
  assert.ok(liveConformanceResult.LIVE_WARM_ACTIVE_PRIORITY, 'E.8.4I-B.2: Warm active priority over newer building staging must pass');
  assert.ok(liveConformanceResult.LIVE_FAILED_STAGING_PRESERVES_STABLE, 'E.8.4I-B.2: Failed staging preserving stable must pass');
  assert.ok(liveConformanceResult.LIVE_POST_PROMOTION_ACTIVE_READ_TEST, 'E.8.4I-B.2: Post-promotion reading active must pass');
  assert.ok(liveConformanceResult.LIVE_STAGING_BOUND_TEST, 'E.8.4I-B.2: Bounded staging limit must pass');
  assert.ok(liveConformanceResult.LIVE_INCREMENTAL_SIGNAL_TEST, 'E.8.4I-B.2: Incremental signal trigger must pass');
  assert.ok(liveConformanceResult.LIVE_INCREMENTAL_NO_SOURCE_REFRESH_TEST, 'E.8.4I-B.2: Incremental local reread without source refresh must pass');

  const homeIncrementalStagingResult =
    await smokeModule.runHomeIncrementalStagingExpansionBehavioralTest();
  if (!homeIncrementalStagingResult.ok) {
    console.error('HOME INCREMENTAL STAGING EXPANSION DEBUG:', homeIncrementalStagingResult);
  }
  assert.ok(homeIncrementalStagingResult.ok, 'E.8.4I-C: Home Incremental Staging Expansion must pass');
  assert.ok(homeIncrementalStagingResult.testA_partialExpansion, 'E.8.4I-C Test A: Partial expansion across batches must pass');
  assert.ok(homeIncrementalStagingResult.testB_contentPreservation, 'E.8.4I-C Test B: Content preservation across rereads must pass');
  assert.ok(homeIncrementalStagingResult.testC_activePriority, 'E.8.4I-C Test C: Active priority over staging must pass');
  assert.ok(homeIncrementalStagingResult.testD_scopeIsolation, 'E.8.4I-C Test D: Scope isolation must pass');
  assert.ok(homeIncrementalStagingResult.testE_failedStagingPreservesActive, 'E.8.4I-C Test E: Failed staging preserving active must pass');
  assert.ok(homeIncrementalStagingResult.testF_noFalseEmpty, 'E.8.4I-C Test F: No false empty on valid staging must pass');
  assert.ok(homeIncrementalStagingResult.testG_localOnly, 'E.8.4I-C Test G: Local-only read model must pass');
  assert.ok(homeIncrementalStagingResult.testH_noDuplication, 'E.8.4I-C Test H: No duplication of sections or items must pass');
  assert.ok(homeIncrementalStagingResult.testI_reentrancySafe, 'E.8.4I-C Test I: Reentrancy safety must pass');

  const recoverySmokeResult =
    await smokeModule.runInterruptedImportBootstrapRecoverySmokeTest();
  if (!recoverySmokeResult.ok) {
    console.error('INTERRUPTED IMPORT BOOTSTRAP RECOVERY RESULT DEBUG:', recoverySmokeResult);
  }
  assert.ok(recoverySmokeResult.ok, 'E.8.4J-B.6D: Interrupted Import Bootstrap Recovery must pass');
  assert.ok(recoverySmokeResult.TEST_A_VALID_COMPLETED, 'E.8.4J-B.6D Test A: Valid completed local catalog skips import');
  assert.ok(recoverySmokeResult.TEST_B_INTERRUPTED_WITH_STAGING, 'E.8.4J-B.6D Test B: Interrupted import with staging starts import');
  assert.ok(recoverySmokeResult.TEST_C_INTERRUPTED_WITHOUT_STAGING, 'E.8.4J-B.6D Test C: Interrupted import without staging starts import');
  assert.ok(recoverySmokeResult.TEST_D_NO_CACHE_NO_LOCAL, 'E.8.4J-B.6D Test D: Fresh cold start without metadata starts import');
  assert.ok(recoverySmokeResult.TEST_E_DUPLICATE_BOOTSTRAP, 'E.8.4J-B.6D Test E: Concurrent bootstrap calls deduplicate import');
  assert.ok(recoverySmokeResult.TEST_F_PROMOTION_FALSE, 'E.8.4J-B.6D Test F: Completed metadata readable without requiring V3 active promotion');

  const homeEmptyRegressionResult =
    await smokeModule.runHomeEmptyRegressionSmokeTest();
  if (!homeEmptyRegressionResult.ok) {
    console.error('HOME EMPTY REGRESSION RESULT DEBUG:', homeEmptyRegressionResult);
  }
  assert.ok(homeEmptyRegressionResult.ok, 'MVP-PRE-VS06: Home Empty Regression Smoke Test must pass');
  assert.ok(homeEmptyRegressionResult.staleMetadataDidNotBypassImport, 'MVP-PRE-VS06: Stale metadata must not bypass import when active snapshot is null');
  assert.ok(homeEmptyRegressionResult.firstFoldHydrationDispatched, 'MVP-PRE-VS06: First fold hydration must dispatch staging readMode');
  assert.ok(homeEmptyRegressionResult.firstFoldHomeSectionsDelivered, 'MVP-PRE-VS06: First fold home sections must be delivered');
  assert.ok(homeEmptyRegressionResult.homeDoesNotEraseWhileStagingExists, 'MVP-PRE-VS06: Home must not erase while staging exists');

  // 3. Static Architectural Contracts Validation
  const [
    firstFoldServiceSrc,
    homeVodRenderabilitySrc,
    catalogPageSrc,
    playlistRuntimeProviderSrc,
    prepareHomePlaylistSrc,
    appBootstrapSrc,
    preparingHomePageSrc,
    preparingHomeOrchestratorSrc,
    liveTvPageSrc,
    catalogCategoryPageSrc,
    localCatalogCategoryReadModelSrc,
    lifecycleRepoSrc,
    localLiveCatalogSrc,
    e8DiagnosticLogSrc,
    diagnosticLogPluginSrc,
    mainActivitySrc,
    mainEntrySrc,
    loginPageSrc,
  ] = await Promise.all([
    readSource('src/features/localCatalog/readModels/localCatalogFirstFoldReadModel.service.ts'),
    readSource('src/features/catalog/services/homeVodRenderability.service.ts'),
    readSource('src/features/catalog/pages/CatalogPage.tsx'),
    readSource('src/features/playlists/providers/PlaylistRuntimeProvider.tsx'),
    readSource('src/features/catalog/services/prepareHomePlaylist.service.ts'),
    readSource('src/features/bootstrap/services/appBootstrap.service.ts'),
    readSource('src/features/catalog/pages/PreparingHomePage.tsx'),
    readSource('src/features/catalog/services/preparingHomeOrchestrator.service.ts'),
    readSource('src/features/live/pages/LiveTvPage.tsx'),
    readSource('src/features/catalog/pages/CatalogCategoryPage.tsx'),
    readSource('src/features/localCatalog/readModels/localCatalogCategoryReadModel.service.ts'),
    readSource('src/features/localCatalog/repositories/localCatalogSnapshotLifecycleRepository.service.ts'),
    readSource('src/features/live/services/localLiveCatalog.service.ts'),
    readSource('src/platform/e8DiagnosticLog.ts'),
    readSource('android/app/src/main/java/com/xandeflix/app/DiagnosticLogPlugin.java'),
    readSource('android/app/src/main/java/com/xandeflix/app/MainActivity.java'),
    readSource('src/main.tsx'),
    readSource('src/features/auth/pages/LoginPage.tsx'),
  ]);

  // Contract Check A: First Fold Read Model only queries bounded staging
  assert.ok(firstFoldServiceSrc.includes('snapshot.status !== \'building\''), 'XC-24: Must verify snapshot is in building status');
  assert.ok(firstFoldServiceSrc.includes('scope.stagingSnapshotId !== snapshotId'), 'XC-24: Must verify snapshotId matches scope stagingSnapshotId');
  assert.ok(firstFoldServiceSrc.includes('filterRenderableHomeVodSections'), 'E.8.4F-R: First-fold must use canonical Home renderability');
  assert.ok(
    homeVodRenderabilitySrc.includes('export function isRenderableHomeVodSection') &&
      homeVodRenderabilitySrc.includes("normalizedTitle.startsWith('canais')") &&
      homeVodRenderabilitySrc.includes("normalizedTitle.startsWith('canal')") &&
      homeVodRenderabilitySrc.includes("normalizedTitle.includes('ao vivo')") &&
      homeVodRenderabilitySrc.includes('Boolean(section.items?.length)'),
    'E.8.4F-R: Neutral helper must preserve the exact preexisting Home predicate',
  );
  assert.ok(
    !homeVodRenderabilitySrc.includes('import ') &&
      !homeVodRenderabilitySrc.includes('IndexedDB') &&
      !homeVodRenderabilitySrc.includes('localStorage') &&
      !homeVodRenderabilitySrc.includes('env.'),
    'E.8.4F-R: Neutral helper must remain pure and dependency-free',
  );
  assert.ok(
    catalogPageSrc.includes('filterRenderableHomeVodSections') &&
      !catalogPageSrc.includes('function normalizeHomeSectionTitle') &&
      !catalogPageSrc.includes('function isRenderableVodHomeSection') &&
      !catalogPageSrc.includes('function filterRenderableVodHomeSections'),
    'E.8.4F-R: CatalogPage must consume the canonical helper without a duplicate predicate',
  );
  assert.ok(
    playlistRuntimeProviderSrc.includes('const hasRenderableSections = stagingSections.length > 0;') &&
      playlistRuntimeProviderSrc.includes("readMode: 'staging'") &&
      playlistRuntimeProviderSrc.includes('false,\n                  );'),
    'E.8.4F-R: A canonical staging match must still release staging first-fold before EOF',
  );

  // Contract Check B: PlaylistRuntimeProvider in-flight dedup, decoupled promises and readModes
  assert.ok(playlistRuntimeProviderSrc.includes('startSourceImport'), 'Must implement startSourceImport');
  assert.ok(playlistRuntimeProviderSrc.includes('inFlightImportTaskRef'), 'Must maintain inFlightImportTaskRef');
  assert.ok(playlistRuntimeProviderSrc.includes('firstFoldReady'), 'Must provide firstFoldReady promise');
  assert.ok(playlistRuntimeProviderSrc.includes("readMode: 'staging'"), 'Early firstFoldReady must specify staging readMode');
  assert.ok(playlistRuntimeProviderSrc.includes("readMode: 'active'"), 'EOF firstFoldReady must specify active readMode');

  // Contract Check C: prepareHomePlaylist consumes startSourceImport with readMode
  assert.ok(prepareHomePlaylistSrc.includes("typeof startSourceImport === 'function'"), 'prepareHomePlaylist must consume startSourceImport');
  assert.ok(prepareHomePlaylistSrc.includes('firstFoldSnapshotId'), 'prepareHomePlaylist must return firstFoldSnapshotId');
  assert.ok(prepareHomePlaylistSrc.includes('firstFoldReadMode'), 'prepareHomePlaylist must return firstFoldReadMode');

  // Contract Check D: appBootstrap criticalOnly consumes staging reader strictly on staging readMode
  assert.ok(appBootstrapSrc.includes("resolvedFirstFoldReadMode === 'staging'"), 'appBootstrap must check staging readMode before staging reader');
  assert.ok(appBootstrapSrc.includes('listStagingFirstFoldHomeVodSections'), 'appBootstrap must call listStagingFirstFoldHomeVodSections for staging');
  assert.ok(appBootstrapSrc.includes('loadLocalCatalogHomeVodSections'), 'appBootstrap must call loadLocalCatalogHomeVodSections for active read');

  // Contract Check E: PreparingHomePage eliminates fake 12%
  assert.ok(!preparingHomePageSrc.includes('Math.max(\n      12'), 'PreparingHomePage must not hardcode 12% fallback');

  // Contract Check F: LiveTvPage loading guard
  assert.ok(liveTvPageSrc.includes('if (status === "loading") {\n          return;\n        }'), 'LiveTvPage must not trigger loadFromSource during loading status');

  // Contract Check G: CatalogCategoryPage keeps true Preparing while allowing
  // only Movies/Series landings to consume bounded staging during loading.
  assert.ok(
    catalogCategoryPageSrc.includes("category?.slug === 'filmes' || category?.slug === 'series'") &&
      catalogCategoryPageSrc.includes('canReadBoundedStagingLanding') &&
      catalogCategoryPageSrc.includes('playlistProgress?.channelsParsed') &&
      catalogCategoryPageSrc.includes('loadLocalStagingCategoryReadModel') &&
      catalogCategoryPageSrc.includes("categorySelection.readMode !== 'staging'"),
    'E.8.4I-A: Category landings must read staging during loading without caching it as stable',
  );
  assert.ok(
    localCatalogCategoryReadModelSrc.includes('scope.sourceId !== sourceId') &&
      localCatalogCategoryReadModelSrc.includes('scope.stagingSnapshotId') &&
      localCatalogCategoryReadModelSrc.includes('listStagingFirstFoldHomeVodSections') &&
      localCatalogCategoryReadModelSrc.includes('LOCAL_STAGING_CATEGORY_TOTAL_LIMIT = 800') &&
      localCatalogCategoryReadModelSrc.includes('selectStableOrStagingCategoryItems'),
    'E.8.4I-A: Staging category reader must be bounded, scope-isolated and subordinate to stable content',
  );
  assert.ok(
    !localCatalogCategoryReadModelSrc.includes('promote(') &&
      !localCatalogCategoryReadModelSrc.includes('activeSnapshotId =') &&
      !localCatalogCategoryReadModelSrc.includes('setInterval('),
    'E.8.4I-A: Category staging reader must not promote, mutate active identity or poll',
  );

  // Contract Check H-Live: Live catalog read precedence and non-refresh incremental contract (E.8.4I-B.2)
  const activeIdx = localLiveCatalogSrc.indexOf('listReadableLocalCatalogActiveSnapshotItems');
  const v2Idx = localLiveCatalogSrc.indexOf('isLocalCatalogReadable(metadata)');
  const stagingIdx = localLiveCatalogSrc.indexOf('getStagingSnapshotLiveChannels');
  assert.ok(
    activeIdx !== -1 && v2Idx !== -1 && stagingIdx !== -1 && activeIdx < v2Idx && v2Idx < stagingIdx,
    'E.8.4I-B.2: Read precedence must strictly be: V3 Active -> V2 Stable -> V3 Staging',
  );
  assert.ok(
    localLiveCatalogSrc.includes("snapshot.status !== 'building'") &&
      localLiveCatalogSrc.includes("scope.stagingSnapshotId !== stagingSnapshotId") &&
      localLiveCatalogSrc.includes("limit: number = 5000"),
    'E.8.4I-B.2: Staging Live reader must be bounded (5000) and require building status in matching scope',
  );
  assert.ok(
    !liveTvPageSrc.includes('refreshFromSourceInBackground("home_interactive")') &&
      !liveTvPageSrc.includes("refreshFromSourceInBackground('home_interactive')"),
    'E.8.4I-B.2: LiveTvPage must NOT trigger background source refresh on mount/interactive',
  );
  assert.ok(
    liveTvPageSrc.includes('progress?.channelsParsed') &&
      liveTvPageSrc.includes('lastProcessedChannelsParsedRef') &&
      liveTvPageSrc.includes('loadReadableLocalLiveChannels'),
    'E.8.4I-B.2: LiveTvPage incremental reread must be wired to channelsParsed with ref guard and remain local-only',
  );

  // Contract Check H-Home: Home incremental staging expansion contract (E.8.4I-C)
  assert.ok(
    catalogPageSrc.includes('loadLocalStagingHomeVodSections') &&
      catalogPageSrc.includes('channelsParsed') &&
      catalogPageSrc.includes('lastProcessedChannelsParsedRef') &&
      catalogPageSrc.includes('isStagingRereadInFlightRef'),
    'E.8.4I-C: CatalogPage must wire bounded staging expansion to channelsParsed with in-flight guard',
  );

  // Contract Check H: Background refresh interlock against in-flight initial import
  assert.ok(
    playlistRuntimeProviderSrc.includes('if (inFlightImportTaskRef.current) {\n        return Promise.resolve(null);\n      }'),
    'refreshFromSourceInBackground must return early if initial import is in flight',
  );
  const interlockIdx = playlistRuntimeProviderSrc.indexOf('if (inFlightImportTaskRef.current) {');
  const coldRefreshMarkIdx = playlistRuntimeProviderSrc.indexOf('coldRefreshAttemptedRef.current = true;');
  assert.ok(interlockIdx !== -1 && coldRefreshMarkIdx !== -1 && interlockIdx < coldRefreshMarkIdx, 'Interlock must occur BEFORE coldRefreshAttemptedRef is marked true');

  // Contract Check I: P0 Performance Remediation Invariants + VOD Predicate
  assert.ok(
    playlistRuntimeProviderSrc.includes('!env.localCatalogSnapshotImportEnabled &&'),
    'P0: Managed bootstrap must bypass V2 import initialization',
  );
  assert.ok(
    playlistRuntimeProviderSrc.includes('collectChannels: false'),
    'P0: Managed bootstrap must pass collectChannels: false',
  );
  assert.ok(
    playlistRuntimeProviderSrc.includes('isVodChannel'),
    'P0: Managed bootstrap must import and use isVodChannel for VOD candidate check',
  );
  const compactPlaylistRuntimeProviderSrc = playlistRuntimeProviderSrc.replace(/\s+/g, ' ');
  assert.ok(
    compactPlaylistRuntimeProviderSrc.includes('channelBatch.some((channel) => isVodChannel(channel))'),
    'P0: Managed bootstrap must evaluate isVodChannel on channelBatch items',
  );
  assert.ok(
    playlistRuntimeProviderSrc.includes('buildLocalCatalogSeriesLookup'),
    'P0: Post-promotion must dispatch background Series Lookup build',
  );
  assert.ok(
    !lifecycleRepoSrc.includes('LOCAL_CATALOG_V3_STORES.searchTokens'),
    'P0: Snapshot batch write must not write searchTokens inline',
  );
  assert.ok(
    !lifecycleRepoSrc.includes('LOCAL_CATALOG_V3_STORES.searchDocuments'),
    'P0: Snapshot batch write must not write searchDocuments inline',
  );

  // Contract Check J: E.8.1 markers over the E.8.3T sanitized native transport
  const diagnosticSources = [
    playlistRuntimeProviderSrc,
    prepareHomePlaylistSrc,
    preparingHomeOrchestratorSrc,
  ];
  const diagnosticSource = diagnosticSources.join('\n');
  const essentialDiagnosticMarkers = [
    'IMPORT_START',
    'BATCH_SAMPLE',
    'V3_WRITE_SAMPLE',
    'FIRST_VOD_DETECTED',
    'FIRST_FOLD_READ_START',
    'FIRST_FOLD_READ_DONE',
    'FIRST_FOLD_READY_EMITTED',
    'FIRST_FOLD_READY_CONSUMED',
    'PREPARING_HOME_RELEASE',
    'IMPORT_EOF',
    'SNAPSHOT_PROMOTED',
  ];
  for (const marker of essentialDiagnosticMarkers) {
    assert.ok(
      diagnosticSource.includes(`e8DiagnosticLog('${marker}'`),
      `E.8.1: Missing diagnostic marker ${marker}`,
    );
  }
  assert.ok(
    playlistRuntimeProviderSrc.includes('const E8_BATCH_LOG_SAMPLE_INTERVAL = 50;'),
    'E.8.1: Batch diagnostic logging must use the 50-batch sample interval',
  );
  assert.ok(
    playlistRuntimeProviderSrc.includes("if (shouldLogBatchSample) {\n              e8DiagnosticLog('BATCH_SAMPLE'"),
    'E.8.1: BATCH_SAMPLE must remain guarded by sampling',
  );
  assert.ok(
    playlistRuntimeProviderSrc.includes('hasVodCandidate && !firstVodDetected'),
    'E.8.1: FIRST_VOD_DETECTED must remain a once-only event',
  );

  const diagnosticCallPattern =
    /e8DiagnosticLog\(\s*'([A-Z0-9_]+)'\s*,\s*\{([\s\S]*?)\}\s*,?\s*\);/g;
  const diagnosticCalls = [...diagnosticSource.matchAll(diagnosticCallPattern)];
  const preexistingDiagnosticCalls = diagnosticCalls.filter((call) =>
    essentialDiagnosticMarkers.includes(call[1]),
  );
  assert.equal(
    preexistingDiagnosticCalls.length,
    11,
    'E.8.1: Every preexisting diagnostic marker must retain its scalar object payload',
  );
  const forbiddenDiagnosticField =
    /\b(?:url|token|license|password|authorization|username|credential|source|channel)\w*\s*:/i;
  for (const diagnosticCall of diagnosticCalls) {
    assert.ok(
      !forbiddenDiagnosticField.test(diagnosticCall[2]),
      'E.8.1: Diagnostic payload contains a forbidden sensitive field',
    );
  }
  assert.ok(
    !diagnosticSource.includes("console.info('[XANDEFLIX_E8_DIAG]"),
    'E.8.3T: Runtime markers must use the centralized transport helper',
  );
  assert.ok(
    e8DiagnosticLogSrc.includes("registerPlugin<DiagnosticLogPlugin>('DiagnosticLog')") &&
      e8DiagnosticLogSrc.includes("Capacitor.getPlatform() === 'android'") &&
      e8DiagnosticLogSrc.includes('DiagnosticLog.log(options).catch(() => undefined)') &&
      e8DiagnosticLogSrc.includes('EVENT_FIELDS'),
    'E.8.3T: Missing guarded centralized Android diagnostic transport',
  );
  assert.ok(
    diagnosticLogPluginSrc.includes('@CapacitorPlugin(name = "DiagnosticLog")') &&
      diagnosticLogPluginSrc.includes('private static final String TAG = "XANDEFLIX_E8_DIAG";') &&
      diagnosticLogPluginSrc.includes('Log.i(TAG, message.toString());') &&
      diagnosticLogPluginSrc.includes('hasUnknownKeys(data)') &&
      !diagnosticLogPluginSrc.includes('JSON.stringify'),
    'E.8.3T: Native bridge must enforce its narrow scalar-only Log.i contract',
  );
  assert.ok(
    mainActivitySrc.includes('registerPlugin(DiagnosticLogPlugin.class);'),
    'E.8.3T: DiagnosticLogPlugin must be registered by MainActivity',
  );
  assert.equal(
    [...mainEntrySrc.matchAll(/e8DiagnosticLog\('TRANSPORT_PROBE'\);/g)].length,
    1,
    'E.8.3T: Startup must emit exactly one transport probe',
  );
  assert.ok(
    e8DiagnosticLogSrc.includes('TRANSPORT_PROBE: []') &&
      diagnosticLogPluginSrc.includes('"TRANSPORT_PROBE".equals(event) && data.length() != 1'),
    'E.8.3T: Transport probe must carry only its event name',
  );

  const diagnosticTransportSource = `${e8DiagnosticLogSrc}\n${diagnosticLogPluginSrc}`;
  const safeSourceEnumField =
    !hasForbiddenDiagnosticTransportField(
      "e8DiagnosticLog('SERIES_FALLBACK_SOURCE', { source: 'legacy_v2_fallback' });",
    );
  const realSensitiveSourceUrlBlocked = hasForbiddenDiagnosticTransportField(
    "const payload = { sourceUrl: 'https://example.invalid/playlist.m3u' };",
  );
  const realTokenFieldBlocked = hasForbiddenDiagnosticTransportField(
    "const payload = { token: 'opaque-test-token' };",
  );
  const realCredentialFieldBlocked = hasForbiddenDiagnosticTransportField(
    "const payload = { credential: 'opaque-test-credential' };",
  );
  assert.ok(safeSourceEnumField, 'E.8.3T: Safe source enum field must be accepted');
  assert.ok(realSensitiveSourceUrlBlocked, 'E.8.3T: sourceUrl must be blocked');
  assert.ok(realTokenFieldBlocked, 'E.8.3T: token must be blocked');
  assert.ok(realCredentialFieldBlocked, 'E.8.3T: credential must be blocked');
  assert.ok(
    !hasForbiddenDiagnosticTransportField(diagnosticTransportSource),
    'E.8.3T: Diagnostic transport declares a forbidden sensitive field',
  );
  assert.ok(
    !diagnosticTransportSource.includes('JSON.stringify'),
    'E.8.3T: Diagnostic transport must not serialize domain objects',
  );

  // Contract Check K: E.8.4C pre-import control-flow trace
  const preImportDiagnosticSources = [
    mainEntrySrc,
    loginPageSrc,
    preparingHomeOrchestratorSrc,
    appBootstrapSrc,
    prepareHomePlaylistSrc,
    playlistRuntimeProviderSrc,
  ];
  const preImportDiagnosticSource = preImportDiagnosticSources.join('\n');
  const essentialPreImportMarkers = [
    'CONFIG_FLAGS',
    'ACTIVATION_READY',
    'PREPARING_FLOW_ENTER',
    'APP_BOOTSTRAP_ENTER',
    'PREPARE_HOME_ENTER',
    'SOURCE_IMPORT_DISPATCH',
    'START_SOURCE_IMPORT_ENTER',
    'START_SOURCE_IMPORT_EARLY_RETURN',
  ];
  for (const marker of essentialPreImportMarkers) {
    assert.ok(
      preImportDiagnosticSource.includes(`e8DiagnosticLog('${marker}'`),
      `E.8.4C: Missing pre-import diagnostic marker ${marker}`,
    );
    assert.ok(
      e8DiagnosticLogSrc.includes(`${marker}:`) &&
        diagnosticLogPluginSrc.includes(`"${marker}"`),
      `E.8.4C: Diagnostic transport does not allow ${marker}`,
    );
  }

  const transportProbeIdx = mainEntrySrc.indexOf("e8DiagnosticLog('TRANSPORT_PROBE');");
  const configFlagsIdx = mainEntrySrc.indexOf("e8DiagnosticLog('CONFIG_FLAGS'");
  const appStartIdx = mainEntrySrc.indexOf("markDiscoveryPerformance('app_start');");
  assert.ok(
    transportProbeIdx !== -1 &&
      configFlagsIdx > transportProbeIdx &&
      appStartIdx > configFlagsIdx &&
      mainEntrySrc.includes(
        'snapshotImportEnabled: env.localCatalogSnapshotImportEnabled',
      ) &&
      mainEntrySrc.includes(
        'snapshotPromotionEnabled: env.localCatalogSnapshotPromotionEnabled',
      ),
    'E.8.4C: CONFIG_FLAGS must report only the two runtime booleans at startup',
  );

  const activationStoredIdx = loginPageSrc.indexOf('saveStoredLicenseActivation({');
  const activationReadyIdx = loginPageSrc.indexOf(
    "e8DiagnosticLog('ACTIVATION_READY', { authorized: true });",
  );
  const activationContinueIdx = loginPageSrc.indexOf('setShouldContinue(true);');
  assert.ok(
    activationStoredIdx !== -1 &&
      activationReadyIdx > activationStoredIdx &&
      activationContinueIdx > activationReadyIdx,
    'E.8.4C: ACTIVATION_READY must follow persisted activation and precede navigation',
  );

  const startAttemptIdx = preparingHomeOrchestratorSrc.indexOf(
    'function startAttempt() {',
  );
  const preparingEnterIdx = preparingHomeOrchestratorSrc.indexOf(
    "e8DiagnosticLog('PREPARING_FLOW_ENTER');",
  );
  const attemptIncrementIdx = preparingHomeOrchestratorSrc.indexOf(
    'const currentAttemptId = ++attemptId;',
  );
  assert.ok(
    startAttemptIdx !== -1 &&
      preparingEnterIdx > startAttemptIdx &&
      attemptIncrementIdx > preparingEnterIdx,
    'E.8.4C: PREPARING_FLOW_ENTER must be the first startAttempt statement',
  );

  const appBootstrapFunctionIdx = appBootstrapSrc.indexOf(
    'export async function runAppBootstrap({',
  );
  const appBootstrapEnterIdx = appBootstrapSrc.indexOf(
    "e8DiagnosticLog('APP_BOOTSTRAP_ENTER');",
  );
  const appBootstrapStoredActivationIdx = appBootstrapSrc.indexOf(
    'const storedActivation = getStoredLicenseActivation();',
  );
  const appBootstrapSkipIdx = appBootstrapSrc.indexOf(
    "e8DiagnosticLog('APP_BOOTSTRAP_SKIP', { reason: 'SESSION_CACHE_READY' });",
  );
  const cachedPrePreparationReturnIdx = appBootstrapSrc.indexOf(
    'return cachedResultBeforePreparation;',
  );
  assert.ok(
    appBootstrapFunctionIdx !== -1 &&
      appBootstrapEnterIdx > appBootstrapFunctionIdx &&
      appBootstrapStoredActivationIdx > appBootstrapEnterIdx &&
      appBootstrapSkipIdx !== -1 &&
      cachedPrePreparationReturnIdx > appBootstrapSkipIdx,
    'E.8.4C: App bootstrap entry and real session-cache skip must be traced in order',
  );

  const prepareHomeFunctionIdx = prepareHomePlaylistSrc.indexOf(
    'export async function prepareHomePlaylist({',
  );
  const prepareHomeEnterIdx = prepareHomePlaylistSrc.indexOf(
    "e8DiagnosticLog('PREPARE_HOME_ENTER');",
  );
  const consumerStartedIdx = prepareHomePlaylistSrc.indexOf(
    'const consumerStartedAt = performance.now();',
  );
  const sourceImportDispatchIdx = prepareHomePlaylistSrc.indexOf(
    "e8DiagnosticLog('SOURCE_IMPORT_DISPATCH'",
  );
  const sourceImportCallIdx = prepareHomePlaylistSrc.indexOf(
    'const task = startSourceImport(',
  );
  assert.ok(
    prepareHomeFunctionIdx !== -1 &&
      prepareHomeEnterIdx > prepareHomeFunctionIdx &&
      consumerStartedIdx > prepareHomeEnterIdx &&
      sourceImportDispatchIdx !== -1 &&
      sourceImportCallIdx > sourceImportDispatchIdx &&
      prepareHomePlaylistSrc.includes('managedRequested: Boolean('),
    'E.8.4C: Prepare Home entry and managed source-import dispatch must be traced in order',
  );

  const startSourceImportFunctionIdx = playlistRuntimeProviderSrc.indexOf(
    'const startSourceImport = useCallback((',
  );
  const startSourceImportEnterIdx = playlistRuntimeProviderSrc.indexOf(
    "e8DiagnosticLog('START_SOURCE_IMPORT_ENTER');",
  );
  const internalLicenseNormalizationIdx = playlistRuntimeProviderSrc.indexOf(
    'const internalLicenseId =',
    startSourceImportFunctionIdx,
  );
  const startSourceImportEarlyReturnIdx = playlistRuntimeProviderSrc.indexOf(
    "e8DiagnosticLog('START_SOURCE_IMPORT_EARLY_RETURN'",
    startSourceImportFunctionIdx,
  );
  const inFlightReturnIdx = playlistRuntimeProviderSrc.indexOf(
    'return inFlightImportTaskRef.current;',
    startSourceImportFunctionIdx,
  );
  const importStartIdx = playlistRuntimeProviderSrc.indexOf(
    "e8DiagnosticLog('IMPORT_START'",
    startSourceImportFunctionIdx,
  );
  assert.ok(
    startSourceImportFunctionIdx !== -1 &&
      startSourceImportEnterIdx > startSourceImportFunctionIdx &&
      internalLicenseNormalizationIdx > startSourceImportEnterIdx &&
      startSourceImportEarlyReturnIdx > internalLicenseNormalizationIdx &&
      inFlightReturnIdx > startSourceImportEarlyReturnIdx &&
      importStartIdx > inFlightReturnIdx &&
      playlistRuntimeProviderSrc.includes("reason: 'IN_FLIGHT_DEDUP'"),
    'E.8.4C: START_SOURCE_IMPORT_ENTER must precede every guard and the real dedup return must be traced',
  );

  const preImportPayloadCalls = [
    ...preImportDiagnosticSource.matchAll(diagnosticCallPattern),
  ].filter((call) => essentialPreImportMarkers.includes(call[1]));
  for (const diagnosticCall of preImportPayloadCalls) {
    assert.ok(
      !forbiddenDiagnosticField.test(diagnosticCall[2]),
      'E.8.4C: New diagnostic payload contains a forbidden sensitive field',
    );
  }
  assert.ok(
    e8DiagnosticLogSrc.includes("reason: 'SESSION_CACHE_READY'") &&
      e8DiagnosticLogSrc.includes("reason: 'IN_FLIGHT_DEDUP'") &&
      diagnosticLogPluginSrc.includes('"SESSION_CACHE_READY"') &&
      diagnosticLogPluginSrc.includes('"IN_FLIGHT_DEDUP"'),
    'E.8.4C: Early-return reasons must remain fixed sanitized enums',
  );

  outputPayload = {
    ok: true,
    PROGRESSIVE_BOOTSTRAP_SMOKE: {
      FIRST_FOLD_READ_MODEL_BUNDLE_VERIFIED: true,
      BEHAVIORAL_VOD_PREDICATE_EXECUTION: behavioralVodResult,
      HOME_RENDERABILITY_BEHAVIORAL_EXECUTION: homeRenderabilityResult,
      IN_FLIGHT_DEDUPLICATION_CONTRACT: true,
      FIRST_FOLD_EARLY_RESOLUTION_CONTRACT: true,
      FIRST_FOLD_EARLY_READ_MODE_STAGING: true,
      FIRST_FOLD_EOF_READ_MODE_ACTIVE: true,
      STAGING_READER_ISOLATION_XC24: true,
      APP_BOOTSTRAP_READ_MODE_ROUTING: true,
      BACKGROUND_REFRESH_INTERLOCK_PROTECTION: true,
      COLD_REFRESH_NOT_CONSUMED_PREMATURELY: true,
      LIVE_TV_LOADING_GUARD_XC23: true,
      CATALOG_CATEGORY_TRUE_PREPARING_XC23: true,
      CATEGORY_STAGING_NON_AUTHORITATIVE_XC24: true,
      CATEGORY_STAGING_SCOPE_ISOLATION: true,
      E8_3T_SAFE_SOURCE_ENUM_FIELD: safeSourceEnumField,
      E8_3T_REAL_SOURCE_URL_BLOCKED: realSensitiveSourceUrlBlocked,
      E8_3T_REAL_TOKEN_FIELD_BLOCKED: realTokenFieldBlocked,
      E8_3T_REAL_CREDENTIAL_FIELD_BLOCKED: realCredentialFieldBlocked,
      CATEGORY_INCREMENTAL_SIGNAL_WIRED: true,
      CATEGORY_AUTHORITY_BEHAVIORAL_EXECUTION: categoryAuthorityResult,
      LIVE_CONFORMANCE_BEHAVIORAL_EXECUTION: liveConformanceResult,
      LIVE_READ_PRECEDENCE_CANONICAL: true,
      LIVE_STAGING_BOUNDED_XC24: true,
      LIVE_INCREMENTAL_SIGNAL_ADVANCES: true,
      LIVE_INCREMENTAL_NO_SOURCE_REFRESH: true,
      HOME_INCREMENTAL_STAGING_BEHAVIORAL_EXECUTION: homeIncrementalStagingResult,
      HOME_INCREMENTAL_SIGNAL_WIRED: true,
      HOME_INCREMENTAL_BOUNDED_XC24: true,
      HOME_INCREMENTAL_CONTENT_PRESERVED: true,
      PROGRESS_BAR_DYNAMICS_CORRECTED: true,
      P0_MANAGED_BOOTSTRAP_V2_BYPASS: true,
      P0_COLLECT_CHANNELS_FALSE: true,
      P0_SMART_VOD_FIRST_FOLD_TRIGGER: true,
      P0_POST_PROMOTION_SERIES_LOOKUP_DISPATCH: true,
      P0_STREAMING_INLINE_SEARCH_TOKENS_SUPPRESSED: true,
      E8_DIAGNOSTIC_MARKERS_VERIFIED: true,
      E8_BATCH_LOG_SAMPLING_VERIFIED: true,
      E8_SENSITIVE_DIAGNOSTIC_FIELDS_ABSENT: true,
      E8_NATIVE_TRANSPORT_HELPER_VERIFIED: true,
      E8_NATIVE_PLUGIN_SCALAR_CONTRACT_VERIFIED: true,
      E8_TRANSPORT_PROBE_EXACTLY_ONCE_VERIFIED: true,
      E84C_PRE_IMPORT_MARKERS_VERIFIED: true,
      E84C_START_SOURCE_IMPORT_ENTRY_PRECEDES_GUARDS: true,
      E84C_NEW_MARKERS_SENSITIVE_FIELDS_ABSENT: true,
      INTERRUPTED_IMPORT_BOOTSTRAP_RECOVERY_EXECUTION: recoverySmokeResult,
    },
  };
} catch (error) {
  exitCode = 1;
  outputPayload = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
} finally {
  await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
}

process.stdout.write(`${JSON.stringify(outputPayload, null, 2)}\n`);
process.exit(exitCode);
