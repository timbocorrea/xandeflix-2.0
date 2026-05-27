import { supabase } from '@/lib/supabase/supabaseClient';
import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';

import { CATALOG_VOD_PRIORITY_GROUPS } from './catalogCategoryGroups.service';

type CatalogWarmupInput = {
  licenseCode: string;
  deviceIdentifier: string;
};

type CatalogWarmupResponse = {
  ok?: boolean;
  hasMore?: boolean;
  processed?: number;
  matched?: number;
  updated?: number;
  processedByGroup?: Record<string, number>;
  matchedByGroup?: Record<string, number>;
  error?: string;
  details?: string;
};

const CATALOG_WARMUP_THROTTLE_MS = 15 * 60 * 1000;
const CATALOG_WARMUP_LIMIT = 300;
const CATALOG_WARMUP_CONCURRENCY = 4;
const CATALOG_WARMUP_MAX_PER_GROUP = 60;
const CATALOG_WARMUP_MAX_CYCLES = 6;
const CATALOG_WARMUP_DELAY_MS = 2000;
const CATALOG_WARMUP_STORAGE_PREFIX = 'xandeflix.catalogVodWarmup';

export const CATALOG_WARMUP_REFRESH_EVENT =
  'xandeflix:catalog-vod-warmup-refreshed';
export const CATALOG_WARMUP_REFRESH_STORAGE_KEY =
  'xandeflix:catalog-vod-warmup:last-refreshed-at';

let runningWarmupKey: string | null = null;

function createWarmupKey({ licenseCode, deviceIdentifier }: CatalogWarmupInput) {
  return `${CATALOG_WARMUP_STORAGE_PREFIX}:${licenseCode.trim().toUpperCase()}:${deviceIdentifier.trim()}`;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function canStartWarmup(warmupKey: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  if (runningWarmupKey === warmupKey) {
    return false;
  }

  const lastStartedAt = Number(window.localStorage.getItem(warmupKey) ?? 0);

  return !lastStartedAt || Date.now() - lastStartedAt >= CATALOG_WARMUP_THROTTLE_MS;
}

function hasPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasPositiveGroupValue(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.values(value).some(hasPositiveNumber);
}

function hasUsefulWarmupProgress(data: CatalogWarmupResponse) {
  return (
    data.ok === true &&
    (hasPositiveNumber(data.processed) ||
      hasPositiveNumber(data.matched) ||
      hasPositiveNumber(data.updated) ||
      hasPositiveGroupValue(data.processedByGroup) ||
      hasPositiveGroupValue(data.matchedByGroup))
  );
}

function notifyCatalogWarmupRefreshed(summary?: unknown) {
  if (typeof window === 'undefined') {
    return;
  }

  const refreshedAt = Date.now();

  window.localStorage.setItem(
    CATALOG_WARMUP_REFRESH_STORAGE_KEY,
    String(refreshedAt),
  );

  window.dispatchEvent(
    new CustomEvent(CATALOG_WARMUP_REFRESH_EVENT, {
      detail: {
        refreshedAt,
        summary,
      },
    }),
  );
}

async function runCatalogVodWarmup(input: CatalogWarmupInput) {
  const warmupKey = createWarmupKey(input);
  runningWarmupKey = warmupKey;

  try {
    for (let cycle = 0; cycle < CATALOG_WARMUP_MAX_CYCLES; cycle += 1) {
      const { data, error } =
        await supabase.functions.invoke<CatalogWarmupResponse>(
          'enrich-license-channels-tmdb',
          {
            body: {
              mode: 'vod-warmup',
              licenseCode: input.licenseCode,
              deviceIdentifier: input.deviceIdentifier,
              limit: CATALOG_WARMUP_LIMIT,
              concurrency: CATALOG_WARMUP_CONCURRENCY,
              maxPerGroup: CATALOG_WARMUP_MAX_PER_GROUP,
              strategy: 'round-robin',
              priorityGroups: CATALOG_VOD_PRIORITY_GROUPS,
            },
          },
        );

      if (error || !data?.ok || data.error || data.details) {
        break;
      }

      if (hasUsefulWarmupProgress(data)) {
        notifyCatalogWarmupRefreshed(data);
      }

      if (!data.hasMore) {
        break;
      }

      if (cycle < CATALOG_WARMUP_MAX_CYCLES - 1) {
        await wait(CATALOG_WARMUP_DELAY_MS);
      }
    }
  } finally {
    runningWarmupKey = null;
  }
}

export function startCatalogVodWarmup(input?: Partial<CatalogWarmupInput>) {
  if (typeof window === 'undefined') {
    return;
  }

  const storedActivation = getStoredLicenseActivation();
  const licenseCode = (input?.licenseCode ?? storedActivation?.licenseCode)?.trim();
  const deviceIdentifier = (
    input?.deviceIdentifier ?? storedActivation?.deviceIdentifier
  )?.trim();

  if (!licenseCode || !deviceIdentifier) {
    return;
  }

  const warmupInput = {
    licenseCode,
    deviceIdentifier,
  };
  const warmupKey = createWarmupKey(warmupInput);

  if (!canStartWarmup(warmupKey)) {
    return;
  }

  window.localStorage.setItem(warmupKey, String(Date.now()));
  void runCatalogVodWarmup(warmupInput);
}
