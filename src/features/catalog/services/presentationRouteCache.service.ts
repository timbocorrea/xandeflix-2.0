const PRESENTATION_CACHE_PREFIX = 'xandeflix:presentation-route-cache:v1:';
const PRESENTATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STORED_ROUTES = 24;

type PresentationCacheEntry<T> = {
  createdAt: number;
  value: T;
};

type PresentationCacheScope = {
  licenseCode: string;
  deviceIdentifier: string;
  sourceId?: string | null;
  route: string;
};

const memoryCache = new Map<string, PresentationCacheEntry<unknown>>();

function normalizeScopePart(value?: string | null) {
  return (value ?? '').trim();
}

export function createPresentationRouteCacheKey({
  licenseCode,
  deviceIdentifier,
  sourceId,
  route,
}: PresentationCacheScope) {
  return [
    licenseCode.trim().toUpperCase(),
    normalizeScopePart(deviceIdentifier),
    normalizeScopePart(sourceId),
    normalizeScopePart(route),
  ].join('::');
}

function storageKey(cacheKey: string) {
  return `${PRESENTATION_CACHE_PREFIX}${cacheKey}`;
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function isFresh(entry: PresentationCacheEntry<unknown>) {
  return Date.now() - entry.createdAt < PRESENTATION_CACHE_TTL_MS;
}

function pruneStoredPresentationCache() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const entries: Array<{ key: string; createdAt: number }> = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (!key?.startsWith(PRESENTATION_CACHE_PREFIX)) {
        continue;
      }

      const rawValue = window.localStorage.getItem(key);
      const entry = rawValue
        ? (JSON.parse(rawValue) as PresentationCacheEntry<unknown>)
        : null;

      if (!entry?.createdAt || !isFresh(entry)) {
        window.localStorage.removeItem(key);
        continue;
      }

      entries.push({ key, createdAt: entry.createdAt });
    }

    entries
      .sort((first, second) => second.createdAt - first.createdAt)
      .slice(MAX_STORED_ROUTES)
      .forEach((entry) => window.localStorage.removeItem(entry.key));
  } catch {
    // Cache local de apresentacao e apenas uma otimizacao do endpoint.
  }
}

export function readPresentationRouteCache<T>(
  scope: PresentationCacheScope,
): T | null {
  const cacheKey = createPresentationRouteCacheKey(scope);
  const cachedEntry = memoryCache.get(cacheKey);

  if (cachedEntry) {
    if (isFresh(cachedEntry)) {
      return cloneValue(cachedEntry.value as T);
    }

    memoryCache.delete(cacheKey);
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey(cacheKey));

    if (!rawValue) {
      return null;
    }

    const entry = JSON.parse(rawValue) as PresentationCacheEntry<T>;

    if (!entry?.createdAt || !isFresh(entry)) {
      window.localStorage.removeItem(storageKey(cacheKey));
      return null;
    }

    memoryCache.set(cacheKey, entry as PresentationCacheEntry<unknown>);
    return cloneValue(entry.value);
  } catch {
    window.localStorage.removeItem(storageKey(cacheKey));
    return null;
  }
}

export function writePresentationRouteCache<T>(
  scope: PresentationCacheScope,
  value: T,
) {
  const cacheKey = createPresentationRouteCacheKey(scope);
  const entry = {
    createdAt: Date.now(),
    value: cloneValue(value),
  } satisfies PresentationCacheEntry<T>;

  memoryCache.set(cacheKey, entry as PresentationCacheEntry<unknown>);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey(cacheKey), JSON.stringify(entry));
    pruneStoredPresentationCache();
  } catch {
    // Falha de cache local nao bloqueia navegacao.
  }
}
