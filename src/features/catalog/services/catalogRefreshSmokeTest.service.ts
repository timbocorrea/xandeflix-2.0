import {
  evaluateCatalogRefreshPolicy,
  DEFAULT_CATALOG_STALE_TTL_MS,
} from './catalogRefreshPolicy.service';
import type { NetworkStatus } from '@/features/network/services/networkMode.service';
import {
  clearCatalogMetricsHistory,
  getCatalogMetricsHistory,
} from './catalogMetrics.service';
import { runCatalogBackgroundRefresh } from './catalogBackgroundRefresh.service';
import type { LocalCatalogImportMetadata } from '@/features/localCatalog/types/localCatalog.types';
import type { PlaylistSource, PlaylistRuntimeAuthorizationContext } from '@/features/playlists/types/playlist';

export interface CatalogRefreshSmokeResult {
  ok: boolean;
  TEST_1_WARM_START_VALID_SNAPSHOT: boolean;
  TEST_2_COLD_START_NO_SNAPSHOT: boolean;
  TEST_3_MOBILE_NETWORK_POLICY: boolean;
  TEST_4_OFFLINE_MODE_SNAPSHOT_PRESERVED: boolean;
  TEST_5_INTERRUPTED_REFRESH_STAGING_DISCARDED: boolean;
  SECURITY_METRICS_SANITIZED: boolean;
  errorCode?: string;
}

function assertCondition(condition: unknown, errorCode: string): asserts condition {
  if (!condition) {
    throw new Error(errorCode);
  }
}

function createValidMetadata(ageMs = 0): LocalCatalogImportMetadata {
  const now = Date.now();
  const isoTime = new Date(now - ageMs).toISOString();
  return {
    sourceId: 'src-test-123',
    sourceType: 'm3u',
    completedAt: isoTime,
    lastSuccessfulImportAt: isoTime,
    parsedCount: 150,
    importedCount: 150,
    updatedCount: 0,
    removedCount: 0,
    unknownCount: 0,
    withoutGroupCount: 0,
    classificationVersion: 1,
    status: 'ready',
  };
}

export async function runCatalogRefreshSmokeTest(): Promise<CatalogRefreshSmokeResult> {
  clearCatalogMetricsHistory();

  // TESTE 1: Snapshot válido existente (Wi-Fi) -> Warm start, opens Home immediately
  const validFreshMetadata = createValidMetadata(60_000); // 1 minute old
  const wifiStatus: NetworkStatus = { mode: 'wifi', isOnline: true };

  const test1Decision = evaluateCatalogRefreshPolicy({
    metadata: validFreshMetadata,
    networkStatus: wifiStatus,
  });

  const test1WarmStartValidSnapshot =
    test1Decision.bootMode === 'warm_start' &&
    test1Decision.shouldBlockUi === false &&
    test1Decision.action === 'warm_start_no_refresh';

  assertCondition(test1WarmStartValidSnapshot, 'TEST_1_WARM_START_VALID_SNAPSHOT_FAILED');

  // TESTE 2: Sem snapshot -> Cold start normal
  const test2Decision = evaluateCatalogRefreshPolicy({
    metadata: null,
    networkStatus: wifiStatus,
  });

  const test2ColdStartNoSnapshot =
    test2Decision.bootMode === 'cold_start' &&
    test2Decision.shouldBlockUi === true &&
    test2Decision.action === 'cold_start_full_refresh';

  assertCondition(test2ColdStartNoSnapshot, 'TEST_2_COLD_START_NO_SNAPSHOT_FAILED');

  // TESTE 3: Mobile -> Não bloquear UI, usar warm start + background refresh se stale
  const mobileStatus: NetworkStatus = { mode: 'mobile', isOnline: true, effectiveType: '4g' };
  const staleMetadata = createValidMetadata(DEFAULT_CATALOG_STALE_TTL_MS + 1000); // Stale

  const test3Decision = evaluateCatalogRefreshPolicy({
    metadata: staleMetadata,
    networkStatus: mobileStatus,
  });

  const test3MobileNetworkPolicy =
    test3Decision.bootMode === 'warm_start' &&
    test3Decision.shouldBlockUi === false &&
    test3Decision.shouldRefreshInBackground === true &&
    test3Decision.action === 'warm_start_background_refresh';

  assertCondition(test3MobileNetworkPolicy, 'TEST_3_MOBILE_NETWORK_POLICY_FAILED');

  // TESTE 4: Offline -> Último snapshot permanece disponível, sem tentar rede
  const offlineStatus: NetworkStatus = { mode: 'unknown', isOnline: false };

  const test4Decision = evaluateCatalogRefreshPolicy({
    metadata: validFreshMetadata,
    networkStatus: offlineStatus,
  });

  const test4OfflineModeSnapshotPreserved =
    test4Decision.bootMode === 'offline_start' &&
    test4Decision.shouldBlockUi === false &&
    test4Decision.shouldRefreshInBackground === false &&
    test4Decision.action === 'offline_use_snapshot';

  assertCondition(test4OfflineModeSnapshotPreserved, 'TEST_4_OFFLINE_MODE_SNAPSHOT_PRESERVED_FAILED');

  // TESTE 5: Refresh interrompido (AbortSignal) -> Snapshot antigo continua válido, staging descartado
  const abortController = new AbortController();
  abortController.abort();

  const dummySource: PlaylistSource = {
    sourceId: 'src-test-cancel',
    sourceType: 'm3u',
    name: 'Fonte Cancelamento',
    url: 'http://example.invalid/cancel.m3u',
  };

  const dummyAuthContext: PlaylistRuntimeAuthorizationContext = {
    internalLicenseId: 'lic-id-cancel',
  };

  const refreshResult = await runCatalogBackgroundRefresh({
    playlistSource: dummySource,
    authorizationContext: dummyAuthContext,
    networkMode: 'mobile',
    bootMode: 'warm_start',
    signal: abortController.signal,
  });

  const test5InterruptedRefreshStagingDiscarded =
    refreshResult.status === 'canceled' &&
    refreshResult.promotedSnapshotId === null;

  assertCondition(
    test5InterruptedRefreshStagingDiscarded,
    'TEST_5_INTERRUPTED_REFRESH_STAGING_DISCARDED_FAILED',
  );

  // SANIDADE DE SEGURANÇA: Verificar histórico de métricas sanitizado
  const metricsHistory = getCatalogMetricsHistory();
  const serializedMetrics = JSON.stringify(metricsHistory);

  const securityMetricsSanitized =
    metricsHistory.length > 0 &&
    !serializedMetrics.includes('http://') &&
    !serializedMetrics.includes('https://') &&
    !serializedMetrics.includes('LIC-CANCEL') &&
    !serializedMetrics.includes('DEV-CANCEL') &&
    !serializedMetrics.includes('password');

  assertCondition(securityMetricsSanitized, 'SECURITY_METRICS_SANITIZED_FAILED');

  return {
    ok: true,
    TEST_1_WARM_START_VALID_SNAPSHOT: test1WarmStartValidSnapshot,
    TEST_2_COLD_START_NO_SNAPSHOT: test2ColdStartNoSnapshot,
    TEST_3_MOBILE_NETWORK_POLICY: test3MobileNetworkPolicy,
    TEST_4_OFFLINE_MODE_SNAPSHOT_PRESERVED: test4OfflineModeSnapshotPreserved,
    TEST_5_INTERRUPTED_REFRESH_STAGING_DISCARDED: test5InterruptedRefreshStagingDiscarded,
    SECURITY_METRICS_SANITIZED: securityMetricsSanitized,
  };
}
