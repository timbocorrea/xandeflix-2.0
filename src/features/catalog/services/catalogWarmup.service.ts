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
