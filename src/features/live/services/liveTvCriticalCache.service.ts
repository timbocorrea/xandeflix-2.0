import type { IptvChannel } from '@/features/playlists/types/playlist';

const LIVE_TV_CRITICAL_CACHE_STORAGE_KEY = 'xandeflix:live-tv-critical-cache:v5';
const LIVE_TV_CRITICAL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const LIVE_TV_CRITICAL_CACHE_LIMIT = 5000;

type LiveTvCriticalCacheEntry = {
  createdAt: number;
  licenseCode: string;
  deviceIdentifier: string;
  channels: IptvChannel[];
};

type LiveTvCriticalCacheInput = {
  licenseCode?: string | null;
  deviceIdentifier?: string | null;
};

type StoreLiveTvCriticalCacheInput = LiveTvCriticalCacheInput & {
  channels: IptvChannel[];
};

function normalizeLicenseCode(value?: string | null) {
  return value?.trim().toUpperCase() ?? '';
}

function normalizeDeviceIdentifier(value?: string | null) {
  return value?.trim() ?? '';
}

function cloneChannels(channels: IptvChannel[]) {
  return channels.map((channel) => ({ ...channel }));
}

function isSameActivation({
  entry,
  licenseCode,
  deviceIdentifier,
}: {
  entry: LiveTvCriticalCacheEntry;
  licenseCode: string;
  deviceIdentifier: string;
}) {
  return (
    normalizeLicenseCode(entry.licenseCode) === normalizeLicenseCode(licenseCode) &&
    normalizeDeviceIdentifier(entry.deviceIdentifier) ===
      normalizeDeviceIdentifier(deviceIdentifier)
  );
}

export function getCachedLiveTvCriticalChannels({
  licenseCode,
  deviceIdentifier,
}: LiveTvCriticalCacheInput) {
  const normalizedLicenseCode = normalizeLicenseCode(licenseCode);
  const normalizedDeviceIdentifier = normalizeDeviceIdentifier(deviceIdentifier);

  if (
    typeof window === 'undefined' ||
    !normalizedLicenseCode ||
    !normalizedDeviceIdentifier
  ) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(LIVE_TV_CRITICAL_CACHE_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const entry = JSON.parse(rawValue) as LiveTvCriticalCacheEntry;

    if (
      !entry?.createdAt ||
      !Array.isArray(entry.channels) ||
      !isSameActivation({
        entry,
        licenseCode: normalizedLicenseCode,
        deviceIdentifier: normalizedDeviceIdentifier,
      })
    ) {
      window.localStorage.removeItem(LIVE_TV_CRITICAL_CACHE_STORAGE_KEY);
      return null;
    }

    if (Date.now() - entry.createdAt >= LIVE_TV_CRITICAL_CACHE_TTL_MS) {
      window.localStorage.removeItem(LIVE_TV_CRITICAL_CACHE_STORAGE_KEY);
      return null;
    }

    return cloneChannels(entry.channels);
  } catch {
    window.localStorage.removeItem(LIVE_TV_CRITICAL_CACHE_STORAGE_KEY);
    return null;
  }
}

export function storeCachedLiveTvCriticalChannels({
  licenseCode,
  deviceIdentifier,
  channels,
}: StoreLiveTvCriticalCacheInput) {
  const normalizedLicenseCode = normalizeLicenseCode(licenseCode);
  const normalizedDeviceIdentifier = normalizeDeviceIdentifier(deviceIdentifier);

  if (
    typeof window === 'undefined' ||
    !normalizedLicenseCode ||
    !normalizedDeviceIdentifier ||
    channels.length === 0
  ) {
    return;
  }

  try {
    const limitedChannels = channels.slice(0, LIVE_TV_CRITICAL_CACHE_LIMIT);

    window.localStorage.setItem(
      LIVE_TV_CRITICAL_CACHE_STORAGE_KEY,
      JSON.stringify({
        createdAt: Date.now(),
        licenseCode: normalizedLicenseCode,
        deviceIdentifier: normalizedDeviceIdentifier,
        channels: cloneChannels(limitedChannels),
      } satisfies LiveTvCriticalCacheEntry),
    );
  } catch {
    // Cache persistente é otimização. Falha não deve bloquear a Live TV.
  }
}
