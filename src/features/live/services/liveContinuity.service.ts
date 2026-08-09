export type LiveContinuityScope = {
  internalLicenseId: string;
  sourceId: string;
  deviceIdentifier: string;
};

export type LiveContinuityRecord = {
  version: 1;
  channelId: string;
  updatedAt: number;
};

export type LiveContinuityStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type LiveContinuityResolutionResult<T> = {
  status: 'RESTORED' | 'STALE_DISCARDED' | 'NO_STATE';
  channel: T | null;
  record?: LiveContinuityRecord | null;
};

function getStorageInstance(customStorage?: LiveContinuityStorage): LiveContinuityStorage | null {
  if (customStorage) {
    return customStorage;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function sanitizeScopeKeySegment(value?: string | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

export function buildLiveContinuityStorageKey(scope: LiveContinuityScope): string | null {
  const licenseId = sanitizeScopeKeySegment(scope?.internalLicenseId);
  const sourceId = sanitizeScopeKeySegment(scope?.sourceId);
  const deviceId = sanitizeScopeKeySegment(scope?.deviceIdentifier);

  if (!licenseId || !sourceId || !deviceId) {
    return null;
  }

  return `xandeflix:live-continuity:v1:${licenseId}:${sourceId}:${deviceId}`;
}

export function saveLiveLastChannel(
  scope: LiveContinuityScope,
  channelId: string,
  storage?: LiveContinuityStorage,
): boolean {
  const key = buildLiveContinuityStorageKey(scope);
  const trimmedId = channelId?.trim();

  if (!key || !trimmedId) {
    return false;
  }

  const targetStorage = getStorageInstance(storage);
  if (!targetStorage) {
    return false;
  }

  try {
    const record: LiveContinuityRecord = {
      version: 1,
      channelId: trimmedId,
      updatedAt: Date.now(),
    };
    targetStorage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function readLiveLastChannel(
  scope: LiveContinuityScope,
  storage?: LiveContinuityStorage,
): LiveContinuityRecord | null {
  const key = buildLiveContinuityStorageKey(scope);
  if (!key) {
    return null;
  }

  const targetStorage = getStorageInstance(storage);
  if (!targetStorage) {
    return null;
  }

  try {
    const raw = targetStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LiveContinuityRecord>;
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.channelId === 'string' &&
      parsed.channelId.trim() !== ''
    ) {
      return {
        version: 1,
        channelId: parsed.channelId.trim(),
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLiveLastChannel(
  scope: LiveContinuityScope,
  storage?: LiveContinuityStorage,
): void {
  const key = buildLiveContinuityStorageKey(scope);
  if (!key) {
    return;
  }

  const targetStorage = getStorageInstance(storage);
  if (!targetStorage) {
    return;
  }

  try {
    targetStorage.removeItem(key);
  } catch {
    // no-op
  }
}

export function resolveLiveContinuity<T extends { id: string; url: string }>(
  scope: LiveContinuityScope,
  channels: T[],
  storage?: LiveContinuityStorage,
): LiveContinuityResolutionResult<T> {
  const playableChannels = (channels ?? []).filter(
    (item) => Boolean(item?.id?.trim()) && Boolean(item?.url?.trim()),
  );
  const firstPlayable = playableChannels[0] ?? null;

  const record = readLiveLastChannel(scope, storage);

  if (!record) {
    return {
      status: 'NO_STATE',
      channel: firstPlayable,
    };
  }

  const restored = playableChannels.find((item) => item.id.trim() === record.channelId);

  if (restored) {
    return {
      status: 'RESTORED',
      channel: restored,
      record,
    };
  }

  clearLiveLastChannel(scope, storage);

  return {
    status: 'STALE_DISCARDED',
    channel: firstPlayable,
    record,
  };
}
