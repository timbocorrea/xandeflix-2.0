import { isLocalCatalogReadable } from '@/features/localCatalog/services/localCatalogReadability.service';
import type { LocalCatalogImportMetadata } from '@/features/localCatalog/types/localCatalog.types';
import type { NetworkStatus } from '@/features/network/services/networkMode.service';

export type CatalogBootMode = 'warm_start' | 'cold_start' | 'offline_start';

export type CatalogRefreshAction =
  | 'warm_start_background_refresh'
  | 'warm_start_no_refresh'
  | 'cold_start_full_refresh'
  | 'offline_use_snapshot'
  | 'offline_unreadable';

export type CatalogRefreshDecision = {
  action: CatalogRefreshAction;
  bootMode: CatalogBootMode;
  shouldRefreshInBackground: boolean;
  shouldBlockUi: boolean;
  snapshotAgeMs: number | null;
  reason: string;
};

export type EvaluateCatalogRefreshPolicyInput = {
  metadata: LocalCatalogImportMetadata | null | undefined;
  networkStatus: NetworkStatus;
  forceRefresh?: boolean;
  staleTtlMs?: number;
  currentTimeMs?: number;
};

export const DEFAULT_CATALOG_STALE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function evaluateCatalogRefreshPolicy({
  metadata,
  networkStatus,
  forceRefresh = false,
  staleTtlMs = DEFAULT_CATALOG_STALE_TTL_MS,
  currentTimeMs = Date.now(),
}: EvaluateCatalogRefreshPolicyInput): CatalogRefreshDecision {
  const isReadable = isLocalCatalogReadable(metadata);
  const timestampStr =
    metadata?.lastSuccessfulImportAt ??
    metadata?.completedAt ??
    metadata?.startedAt;
  const importedAtMs = timestampStr ? Date.parse(timestampStr) : null;
  const snapshotAgeMs =
    importedAtMs !== null && Number.isFinite(importedAtMs)
      ? Math.max(0, currentTimeMs - importedAtMs)
      : null;

  const isStale =
    snapshotAgeMs !== null ? snapshotAgeMs >= staleTtlMs : true;

  if (!networkStatus.isOnline) {
    if (isReadable) {
      return {
        action: 'offline_use_snapshot',
        bootMode: 'offline_start',
        shouldRefreshInBackground: false,
        shouldBlockUi: false,
        snapshotAgeMs,
        reason: 'Offline mode: using valid local snapshot without refresh.',
      };
    }

    return {
      action: 'offline_unreadable',
      bootMode: 'offline_start',
      shouldRefreshInBackground: false,
      shouldBlockUi: true,
      snapshotAgeMs: null,
      reason: 'Offline mode: no readable local snapshot available.',
    };
  }

  // Online
  if (isReadable) {
    // Local catalog exists and is readable -> Warm Start!
    if (forceRefresh) {
      return {
        action: 'warm_start_background_refresh',
        bootMode: 'warm_start',
        shouldRefreshInBackground: true,
        shouldBlockUi: false,
        snapshotAgeMs,
        reason: 'Warm start: user requested forced background refresh.',
      };
    }

    if (networkStatus.mode === 'mobile') {
      // On mobile data: Always prefer warm start + background refresh if stale
      if (isStale) {
        return {
          action: 'warm_start_background_refresh',
          bootMode: 'warm_start',
          shouldRefreshInBackground: true,
          shouldBlockUi: false,
          snapshotAgeMs,
          reason: 'Warm start on mobile network: snapshot is stale, triggering non-blocking background refresh.',
        };
      }

      return {
        action: 'warm_start_no_refresh',
        bootMode: 'warm_start',
        shouldRefreshInBackground: false,
        shouldBlockUi: false,
        snapshotAgeMs,
        reason: 'Warm start on mobile network: local snapshot is fresh, background refresh skipped.',
      };
    }

    // Wi-Fi or Unknown network
    if (isStale) {
      return {
        action: 'warm_start_background_refresh',
        bootMode: 'warm_start',
        shouldRefreshInBackground: true,
        shouldBlockUi: false,
        snapshotAgeMs,
        reason: 'Warm start on Wi-Fi/Unknown network: snapshot is stale, triggering background refresh.',
      };
    }

    return {
      action: 'warm_start_no_refresh',
      bootMode: 'warm_start',
      shouldRefreshInBackground: false,
      shouldBlockUi: false,
      snapshotAgeMs,
      reason: 'Warm start on Wi-Fi/Unknown network: local snapshot is fresh.',
    };
  }

  // Not readable locally -> Cold Start (Initial import required)
  return {
    action: 'cold_start_full_refresh',
    bootMode: 'cold_start',
    shouldRefreshInBackground: false,
    shouldBlockUi: true,
    snapshotAgeMs: null,
    reason: 'Cold start: local catalog is missing or unreadable, initial import required.',
  };
}
