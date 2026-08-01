import { fnv1a32Pure } from './discoverySelector.service';
import {
  buildDiscoveryScopeKey,
  type DiscoveryRuntimeAccessScope,
} from './discoveryRuntimePresentationStore.service';

export const ROTATION_HISTORY_VERSION = 1;
export const ROTATION_HISTORY_MAX_ITEMS_PER_BUCKET = 24;

export type RotationHistoryKind =
  | 'HOME_HERO'
  | 'MOVIES_HERO'
  | 'SERIES_HERO'
  | 'CATEGORY_COVER'
  | 'CATEGORY_DISCOVERY_WINDOW';

type RotationHistoryRecord = {
  version: number;
  buckets: Record<string, string[]>;
};

function scopeFingerprint(scope: DiscoveryRuntimeAccessScope) {
  const scopeKey = buildDiscoveryScopeKey(scope);

  if (!scopeKey) {
    return null;
  }

  const primary = fnv1a32Pure(scopeKey).toString(16).padStart(8, '0');
  const secondary = fnv1a32Pure(`rotation:${scopeKey}`)
    .toString(16)
    .padStart(8, '0');
  return `${primary}${secondary}`;
}

function storageKey(scope: DiscoveryRuntimeAccessScope) {
  const fingerprint = scopeFingerprint(scope);
  return fingerprint
    ? `xandeflix:rotation-history:v${ROTATION_HISTORY_VERSION}:${fingerprint}`
    : null;
}

function bucketKey(kind: RotationHistoryKind, surfaceKey: string) {
  const normalizedSurface = surfaceKey.trim();
  return normalizedSurface ? `${kind}:${normalizedSurface}` : null;
}

function readHistory(scope: DiscoveryRuntimeAccessScope): RotationHistoryRecord {
  const key = storageKey(scope);

  if (!key || typeof window === 'undefined') {
    return { version: ROTATION_HISTORY_VERSION, buckets: {} };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as
      | Partial<RotationHistoryRecord>
      | null;

    if (
      parsed?.version !== ROTATION_HISTORY_VERSION ||
      !parsed.buckets ||
      typeof parsed.buckets !== 'object'
    ) {
      return { version: ROTATION_HISTORY_VERSION, buckets: {} };
    }

    const buckets: Record<string, string[]> = {};

    for (const [name, values] of Object.entries(parsed.buckets)) {
      if (!Array.isArray(values)) {
        continue;
      }
      buckets[name] = Array.from(
        new Set(
          values
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ).slice(-ROTATION_HISTORY_MAX_ITEMS_PER_BUCKET);
    }

    return { version: ROTATION_HISTORY_VERSION, buckets };
  } catch {
    return { version: ROTATION_HISTORY_VERSION, buckets: {} };
  }
}

function writeHistory(
  scope: DiscoveryRuntimeAccessScope,
  history: RotationHistoryRecord,
) {
  const key = storageKey(scope);

  if (!key || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(history));
  } catch {
    // Histórico é uma otimização local; falha não altera o catálogo canônico.
  }
}

export function getRecentRotationItemIds(input: {
  scope: DiscoveryRuntimeAccessScope;
  kind: RotationHistoryKind;
  surfaceKey: string;
}) {
  const key = bucketKey(input.kind, input.surfaceKey);

  if (!key) {
    return [];
  }

  return [...(readHistory(input.scope).buckets[key] ?? [])];
}

export function recordRotationItemIds(input: {
  scope: DiscoveryRuntimeAccessScope;
  kind: RotationHistoryKind;
  surfaceKey: string;
  itemIds: readonly string[];
}) {
  const key = bucketKey(input.kind, input.surfaceKey);
  const nextIds = Array.from(
    new Set(input.itemIds.map((itemId) => itemId.trim()).filter(Boolean)),
  );

  if (!key || nextIds.length === 0) {
    return;
  }

  const history = readHistory(input.scope);
  const previous = history.buckets[key] ?? [];
  history.buckets[key] = [...previous.filter((id) => !nextIds.includes(id)), ...nextIds]
    .slice(-ROTATION_HISTORY_MAX_ITEMS_PER_BUCKET);
  writeHistory(input.scope, history);
}

export function clearRotationHistoryForScopeForTests(
  scope: DiscoveryRuntimeAccessScope,
) {
  const key = storageKey(scope);

  if (key && typeof window !== 'undefined') {
    window.localStorage.removeItem(key);
  }
}
