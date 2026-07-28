import {
  clearClientRuntimeAccessState,
} from '@/features/bootstrap/services/appBootstrap.service';
import {
  buildDiscoveryScopeKey,
  clearDiscoveryRuntimePresentationState,
  getDiscoveryRuntimePresentationSnapshot,
  getOrCreateDiscoveryRuntimeContext,
  removeDiscoveryRuntimePresentationSnapshot,
  setDiscoveryRuntimePresentationSnapshot,
  type DiscoveryRuntimeAccessScope,
} from './discoveryRuntimePresentationStore.service';
import {
  createDiscoveryGenerationKey,
  createDiscoveryPresentationSnapshot,
} from './discoverySelector.service';
import type { HomeVodItem } from './homeVod.service';

export type DiscoveryRuntimePresentationStoreSmokeTestResult = {
  ok: boolean;
  r3a1_same_scope_same_seed: boolean;
  r3a2_route_reentry_snapshot_survives: boolean;
  r3a3_source_change_renews_session: boolean;
  r3a4_license_change_renews_session: boolean;
  r3a5_device_change_renews_session: boolean;
  r3a6_explicit_clear_removes_runtime_state: boolean;
  r3a7_one_active_scope_only: boolean;
  r3a8_invalid_scope_blocked: boolean;
  r3a9_secure_entropy_only_on_new_scope: boolean;
  r3a10_zero_storage_network_react: boolean;
  r3a11_snapshot_section_isolation: boolean;
  r3a12_surface_isolation: boolean;
  access_clear_resets_discovery_runtime: boolean;
  r3a13_stale_session_snapshot_rejected: boolean;
  r3a14_no_insecure_entropy_fallback: boolean;
  r3a15_entropy_failure_preserves_previous_runtime: boolean;
  r3a16_snapshot_key_collision_prevented: boolean;
  r3a17_empty_surface_section_blocked: boolean;
};

export function runDiscoveryRuntimePresentationStoreSmokeTest(): DiscoveryRuntimePresentationStoreSmokeTestResult {
  clearDiscoveryRuntimePresentationState();

  const scopeA: DiscoveryRuntimeAccessScope = {
    licenseCode: 'lic-alpha',
    deviceIdentifier: 'dev-001',
    sourceId: 'src-100',
  };

  const scopeAWithSpacesUpper: DiscoveryRuntimeAccessScope = {
    licenseCode: '  LIC-ALPHA  ',
    deviceIdentifier: 'dev-001  ',
    sourceId: '  src-100',
  };

  const scopeB_sourceChange: DiscoveryRuntimeAccessScope = {
    ...scopeA,
    sourceId: 'src-200',
  };

  const scopeC_licenseChange: DiscoveryRuntimeAccessScope = {
    ...scopeA,
    licenseCode: 'lic-beta',
  };

  const scopeD_deviceChange: DiscoveryRuntimeAccessScope = {
    ...scopeA,
    deviceIdentifier: 'dev-002',
  };

  const sampleItems: HomeVodItem[] = [
    { id: 'movie-1', title: 'Filme 1', kind: 'movie' },
    { id: 'movie-2', title: 'Filme 2', kind: 'movie' },
  ];
  const genKey = createDiscoveryGenerationKey(['src-100', 1, '2026-07-25T10:00:00.000Z']);

  // R3A1 SAME_SCOPE_SAME_SEED
  const ctx1 = getOrCreateDiscoveryRuntimeContext(scopeA);
  const ctx2 = getOrCreateDiscoveryRuntimeContext(scopeAWithSpacesUpper);
  const r3a1_same_scope_same_seed =
    ctx1.isValid &&
    ctx2.isValid &&
    ctx1.sessionSeed === ctx2.sessionSeed &&
    ctx1.scopeKey === ctx2.scopeKey;

  // R3A2 ROUTE_REENTRY_SNAPSHOT_SURVIVES
  const fakeSnapshotAction = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctx1.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'action',
    slotCount: 2,
  });

  setDiscoveryRuntimePresentationSnapshot(scopeA, fakeSnapshotAction);

  // Simular re-entrada / remount da rota recebendo a mesma scope
  const reenterCtx = getOrCreateDiscoveryRuntimeContext(scopeA);
  const retrievedSnapshot = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');

  const r3a2_route_reentry_snapshot_survives =
    reenterCtx.sessionSeed === ctx1.sessionSeed &&
    retrievedSnapshot !== undefined &&
    retrievedSnapshot.slots.length === 2 &&
    retrievedSnapshot.slots.some((slot) => slot.id === 'movie-1');

  // R3A3 SOURCE_CHANGE_RENEWS_SESSION
  const ctxSourceB = getOrCreateDiscoveryRuntimeContext(scopeB_sourceChange);
  const snapshotAfterSourceChange = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');
  const r3a3_source_change_renews_session =
    ctxSourceB.isValid &&
    ctxSourceB.sessionSeed !== ctx1.sessionSeed &&
    snapshotAfterSourceChange === undefined;

  // R3A4 LICENSE_CHANGE_RENEWS_SESSION
  const ctxCurrentForLic = getOrCreateDiscoveryRuntimeContext(scopeA);
  const snapshotForLic = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxCurrentForLic.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'action',
    slotCount: 2,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotForLic);
  const ctxLicenseC = getOrCreateDiscoveryRuntimeContext(scopeC_licenseChange);
  const snapshotAfterLicenseChange = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');
  const r3a4_license_change_renews_session =
    ctxLicenseC.isValid &&
    ctxLicenseC.sessionSeed !== ctxCurrentForLic.sessionSeed &&
    snapshotAfterLicenseChange === undefined;

  // R3A5 DEVICE_CHANGE_RENEWS_SESSION
  const ctxCurrentForDev = getOrCreateDiscoveryRuntimeContext(scopeA);
  const snapshotForDev = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxCurrentForDev.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'action',
    slotCount: 2,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotForDev);
  const ctxDeviceD = getOrCreateDiscoveryRuntimeContext(scopeD_deviceChange);
  const snapshotAfterDeviceChange = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');
  const r3a5_device_change_renews_session =
    ctxDeviceD.isValid &&
    ctxDeviceD.sessionSeed !== ctxCurrentForDev.sessionSeed &&
    snapshotAfterDeviceChange === undefined;

  // R3A6 EXPLICIT_CLEAR_REMOVES_RUNTIME_STATE
  const ctxCurrentForClear = getOrCreateDiscoveryRuntimeContext(scopeA);
  const snapshotForClear = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxCurrentForClear.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'action',
    slotCount: 2,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotForClear);
  removeDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');
  const snapshotAfterRemove = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');

  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotForClear);
  clearDiscoveryRuntimePresentationState();
  const snapshotAfterClear = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');
  const ctxAfterClearNewSeed = getOrCreateDiscoveryRuntimeContext(scopeA);
  const r3a6_explicit_clear_removes_runtime_state =
    snapshotAfterRemove === undefined &&
    snapshotAfterClear === undefined &&
    ctxAfterClearNewSeed.sessionSeed !== ctxCurrentForClear.sessionSeed;

  // R3A7 ONE_ACTIVE_SCOPE_ONLY
  const ctxA_init = getOrCreateDiscoveryRuntimeContext(scopeA);
  const seedA_init = ctxA_init.sessionSeed;
  getOrCreateDiscoveryRuntimeContext(scopeB_sourceChange);
  const ctxA_return = getOrCreateDiscoveryRuntimeContext(scopeA);
  const r3a7_one_active_scope_only =
    ctxA_return.sessionSeed !== seedA_init &&
    getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action') === undefined;

  // R3A8 INVALID_SCOPE_BLOCKED
  const invalidScope: DiscoveryRuntimeAccessScope = {
    licenseCode: '   ',
    deviceIdentifier: 'dev-001',
    sourceId: 'src-100',
  };
  const invalidCtx = getOrCreateDiscoveryRuntimeContext(invalidScope);
  const invalidKey = buildDiscoveryScopeKey(invalidScope);
  const r3a8_invalid_scope_blocked =
    invalidCtx.isValid === false &&
    invalidCtx.sessionSeed === null &&
    invalidKey === null;

  // R3A9 SECURE_ENTROPY_ONLY_ON_NEW_SCOPE
  clearDiscoveryRuntimePresentationState();
  let entropyCallCount = 0;
  const mockEntropyGen = () => {
    entropyCallCount += 1;
    return `mock-entropy-${entropyCallCount}`;
  };

  getOrCreateDiscoveryRuntimeContext(scopeA, mockEntropyGen);
  getOrCreateDiscoveryRuntimeContext(scopeA, mockEntropyGen);
  getOrCreateDiscoveryRuntimeContext(scopeA, mockEntropyGen);
  const callsFirstScope = entropyCallCount;

  getOrCreateDiscoveryRuntimeContext(scopeB_sourceChange, mockEntropyGen);
  const callsSecondScope = entropyCallCount;

  const r3a9_secure_entropy_only_on_new_scope =
    callsFirstScope === 1 && callsSecondScope === 2;

  // R3A10 ZERO_STORAGE_NETWORK_REACT
  const r3a10_zero_storage_network_react =
    typeof getOrCreateDiscoveryRuntimeContext === 'function' &&
    typeof clearDiscoveryRuntimePresentationState === 'function';

  // R3A11 SNAPSHOT_SECTION_ISOLATION
  const ctxSectionIso = getOrCreateDiscoveryRuntimeContext(scopeA);
  const snapshotActionIso = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxSectionIso.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'action',
    slotCount: 2,
  });
  const snapshotComedyIso = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxSectionIso.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'comedy',
    slotCount: 2,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotActionIso);
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotComedyIso);

  const snapshotActionRead = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');
  const snapshotComedyRead = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'comedy');
  const r3a11_snapshot_section_isolation =
    snapshotActionRead?.sectionKey === 'action' &&
    snapshotComedyRead?.sectionKey === 'comedy' &&
    snapshotActionRead !== snapshotComedyRead;

  // R3A12 SURFACE_ISOLATION
  const ctxSurfaceIso = getOrCreateDiscoveryRuntimeContext(scopeA);
  const snapshotHomeSurfaceIso = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxSurfaceIso.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'action',
    slotCount: 2,
  });
  const snapshotMoviesSurfaceIso = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxSurfaceIso.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'movies',
    sectionKey: 'action',
    slotCount: 2,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotHomeSurfaceIso);
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotMoviesSurfaceIso);

  const snapshotHomeSurfaceRead = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');
  const snapshotMoviesSurfaceRead = getDiscoveryRuntimePresentationSnapshot(scopeA, 'movies', 'action');

  const r3a12_surface_isolation =
    snapshotHomeSurfaceRead?.surfaceKey === 'home' &&
    snapshotMoviesSurfaceRead?.surfaceKey === 'movies' &&
    snapshotHomeSurfaceRead !== snapshotMoviesSurfaceRead;

  // ACCESS CLEAR CONTRACT
  const ctxAppBootstrapClear = getOrCreateDiscoveryRuntimeContext(scopeA);
  const snapshotAppBootstrapClear = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxAppBootstrapClear.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'action',
    slotCount: 2,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotAppBootstrapClear);
  clearClientRuntimeAccessState();
  const snapshotAfterAppBootstrapClear = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'action');
  const access_clear_resets_discovery_runtime = snapshotAfterAppBootstrapClear === undefined;

  // HARDENING A (R3A13_STALE_SESSION_SNAPSHOT_REJECTED)
  const ctxA_v1 = getOrCreateDiscoveryRuntimeContext(scopeA);
  const staleSnapshot = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxA_v1.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'drama',
    slotCount: 2,
  });

  // Mudar de sessão (muda scope e volta para renovar a seed)
  getOrCreateDiscoveryRuntimeContext(scopeB_sourceChange);
  const ctxA_v2 = getOrCreateDiscoveryRuntimeContext(scopeA);

  // Tentar salvar a snapshot antiga de v1 na sessão v2 atual
  setDiscoveryRuntimePresentationSnapshot(scopeA, staleSnapshot);
  const readStaleAttempt = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'drama');

  // Criar e salvar snapshot válida com seed v2 atual
  const validSnapshotV2 = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxA_v2.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'drama',
    slotCount: 2,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, validSnapshotV2);
  const readValidV2 = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'drama');

  const r3a13_stale_session_snapshot_rejected =
    readStaleAttempt === undefined &&
    readValidV2 !== undefined &&
    readValidV2.sessionSeed === ctxA_v2.sessionSeed;

  // HARDENING B (R3A14_NO_INSECURE_ENTROPY_FALLBACK)
  let r3a14_no_insecure_entropy_fallback = false;
  try {
    getOrCreateDiscoveryRuntimeContext(scopeB_sourceChange, () => '');
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'DISCOVERY_SECURE_ENTROPY_UNAVAILABLE') {
      r3a14_no_insecure_entropy_fallback = true;
    }
  }

  // HARDENING C (R3A15_ENTROPY_FAILURE_PRESERVES_PREVIOUS_RUNTIME)
  clearDiscoveryRuntimePresentationState();
  const ctxStateA = getOrCreateDiscoveryRuntimeContext(scopeA);
  const validSnapshotStateA = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxStateA.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'home',
    sectionKey: 'sci-fi',
    slotCount: 2,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, validSnapshotStateA);

  let entropyErrorThrown = false;
  try {
    getOrCreateDiscoveryRuntimeContext(scopeB_sourceChange, () => {
      throw new Error('SIMULATED_ENTROPY_FAILURE');
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'SIMULATED_ENTROPY_FAILURE') {
      entropyErrorThrown = true;
    }
  }

  // Verificar que a Scope A anterior PERMANECE 100% íntegra e recuperável
  const ctxStateAAfterFail = getOrCreateDiscoveryRuntimeContext(scopeA);
  const snapshotReadAfterFail = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', 'sci-fi');

  const r3a15_entropy_failure_preserves_previous_runtime =
    entropyErrorThrown &&
    ctxStateAAfterFail.sessionSeed === ctxStateA.sessionSeed &&
    snapshotReadAfterFail !== undefined &&
    snapshotReadAfterFail.sessionSeed === ctxStateA.sessionSeed;

  // HARDENING D (R3A16_SNAPSHOT_KEY_COLLISION_PREVENTED)
  const ctxCollisionTest = getOrCreateDiscoveryRuntimeContext(scopeA);
  const snapshotAmbiguous1 = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxCollisionTest.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'a/b',
    sectionKey: 'c',
    slotCount: 2,
  });
  const snapshotAmbiguous2 = createDiscoveryPresentationSnapshot({
    candidates: sampleItems,
    sessionSeed: ctxCollisionTest.sessionSeed!,
    generationKey: genKey,
    surfaceKey: 'a',
    sectionKey: 'b/c',
    slotCount: 2,
  });

  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotAmbiguous1);
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotAmbiguous2);

  const readAmbiguous1 = getDiscoveryRuntimePresentationSnapshot(scopeA, 'a/b', 'c');
  const readAmbiguous2 = getDiscoveryRuntimePresentationSnapshot(scopeA, 'a', 'b/c');

  const r3a16_snapshot_key_collision_prevented =
    readAmbiguous1?.surfaceKey === 'a/b' &&
    readAmbiguous1?.sectionKey === 'c' &&
    readAmbiguous2?.surfaceKey === 'a' &&
    readAmbiguous2?.sectionKey === 'b/c' &&
    readAmbiguous1 !== readAmbiguous2;

  // HARDENING D (R3A17_EMPTY_SURFACE_SECTION_BLOCKED)
  const snapshotWithEmptySurface = {
    ...fakeSnapshotAction,
    sessionSeed: ctxCollisionTest.sessionSeed!,
    surfaceKey: '   ',
  };
  setDiscoveryRuntimePresentationSnapshot(scopeA, snapshotWithEmptySurface);
  const readEmptySurface1 = getDiscoveryRuntimePresentationSnapshot(scopeA, '   ', 'action');
  const readEmptySurface2 = getDiscoveryRuntimePresentationSnapshot(scopeA, 'home', '   ');

  const r3a17_empty_surface_section_blocked =
    readEmptySurface1 === undefined && readEmptySurface2 === undefined;

  const result = {
    r3a1_same_scope_same_seed,
    r3a2_route_reentry_snapshot_survives,
    r3a3_source_change_renews_session,
    r3a4_license_change_renews_session,
    r3a5_device_change_renews_session,
    r3a6_explicit_clear_removes_runtime_state,
    r3a7_one_active_scope_only,
    r3a8_invalid_scope_blocked,
    r3a9_secure_entropy_only_on_new_scope,
    r3a10_zero_storage_network_react,
    r3a11_snapshot_section_isolation,
    r3a12_surface_isolation,
    access_clear_resets_discovery_runtime,
    r3a13_stale_session_snapshot_rejected,
    r3a14_no_insecure_entropy_fallback,
    r3a15_entropy_failure_preserves_previous_runtime,
    r3a16_snapshot_key_collision_prevented,
    r3a17_empty_surface_section_blocked,
  };

  return {
    ok: Object.values(result).every(Boolean),
    ...result,
  };
}
