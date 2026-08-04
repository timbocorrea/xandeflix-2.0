import type { CatalogBootMode } from './catalogRefreshPolicy.service';
import type { NetworkMode } from '@/features/network/services/networkMode.service';

export type CatalogMetricsEvent = {
  timestamp: string;
  catalog_boot_mode: CatalogBootMode;
  snapshot_age_ms: number | null;
  refresh_duration_ms: number | null;
  refresh_bytes: number | null;
  refresh_result: 'success' | 'failed' | 'canceled' | 'skipped';
  network_mode: NetworkMode;
  failure_code?: string;
};

const MAX_METRICS_HISTORY = 50;
const metricsHistory: CatalogMetricsEvent[] = [];

export function recordCatalogMetrics(event: Omit<CatalogMetricsEvent, 'timestamp'>): CatalogMetricsEvent {
  const fullEvent: CatalogMetricsEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  metricsHistory.push(fullEvent);
  if (metricsHistory.length > MAX_METRICS_HISTORY) {
    metricsHistory.shift();
  }

  // Sanitized log without any sensitive parameters
  console.info('[XANDEFLIX_CATALOG_METRICS]', JSON.stringify({
    boot_mode: fullEvent.catalog_boot_mode,
    snapshot_age_ms: fullEvent.snapshot_age_ms,
    refresh_duration_ms: fullEvent.refresh_duration_ms,
    refresh_bytes: fullEvent.refresh_bytes,
    refresh_result: fullEvent.refresh_result,
    network_mode: fullEvent.network_mode,
    failure_code: fullEvent.failure_code ?? null,
  }));

  return fullEvent;
}

export function getCatalogMetricsHistory(): ReadonlyArray<CatalogMetricsEvent> {
  return [...metricsHistory];
}

export function clearCatalogMetricsHistory(): void {
  metricsHistory.length = 0;
}
