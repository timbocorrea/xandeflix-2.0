import { Capacitor, registerPlugin } from '@capacitor/core';

const LEGACY_LICENSE_SESSION_LEASE_STORAGE_KEY =
  'xandeflix:license-session-lease:v1';
const LEASE_TTL_MAX_MS = 12 * 60 * 60 * 1000;

type NativeOfflineLicenseLeaseResult = {
  valid: boolean;
  validatedAt?: number;
  leaseExpiresAt?: number;
  storage: 'ANDROID_SHARED_PREFERENCES';
  keystoreProtected: boolean;
  tamperResistant: boolean;
  installationBound: boolean;
  scopeBound: boolean;
  serverSigned: boolean;
  maxTtlMs: number;
};

type NativeOfflineLicenseLeasePlugin = {
  save(input: {
    scopeHash: string;
    validatedAt: number;
    leaseExpiresAt: number;
  }): Promise<NativeOfflineLicenseLeaseResult & { saved: boolean }>;
  get(input: {
    scopeHash: string;
    now: number;
  }): Promise<NativeOfflineLicenseLeaseResult>;
  clear(): Promise<{ cleared: boolean }>;
};

const NativeOfflineLicenseLease =
  registerPlugin<NativeOfflineLicenseLeasePlugin>('OfflineLicenseLease');

function isSecureNativeLeaseAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function createScopeHash(scopeKey: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('LICENSE_SESSION_LEASE_CRYPTO_UNAVAILABLE');
  }

  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(scopeKey),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function removeLegacyBrowserLease() {
  try {
    window.localStorage.removeItem(LEGACY_LICENSE_SESSION_LEASE_STORAGE_KEY);
    window.localStorage.removeItem('xandeflix:u2f4d6c:lease-backup');
  } catch {
    // O lease legado editável nunca volta a ser aceito como autorização.
  }
}

export async function savePersistedLicenseSessionLease(input: {
  scopeKey: string;
  validatedAt: number;
  leaseTtlMs: number;
  canonicalExpiresAt?: string | null;
}) {
  removeLegacyBrowserLease();

  if (!isSecureNativeLeaseAvailable()) {
    return;
  }

  const canonicalExpiry = input.canonicalExpiresAt
    ? Date.parse(input.canonicalExpiresAt)
    : Number.NaN;
  const boundedTtlMs = Math.min(
    Math.max(0, input.leaseTtlMs),
    LEASE_TTL_MAX_MS,
  );
  const graceExpiry = input.validatedAt + boundedTtlMs;
  const leaseExpiresAt = Number.isFinite(canonicalExpiry)
    ? Math.min(graceExpiry, canonicalExpiry)
    : graceExpiry;

  if (
    leaseExpiresAt <= input.validatedAt ||
    leaseExpiresAt - input.validatedAt > LEASE_TTL_MAX_MS
  ) {
    await NativeOfflineLicenseLease.clear();
    return;
  }

  await NativeOfflineLicenseLease.save({
    scopeHash: await createScopeHash(input.scopeKey),
    validatedAt: input.validatedAt,
    leaseExpiresAt,
  });
}

export async function getValidPersistedLicenseSessionLease(input: {
  scopeKey: string;
  now: number;
}) {
  if (!isSecureNativeLeaseAvailable()) {
    return null;
  }

  try {
    const result = await NativeOfflineLicenseLease.get({
      scopeHash: await createScopeHash(input.scopeKey),
      now: input.now,
    });
    if (
      !result.valid ||
      !result.keystoreProtected ||
      !result.tamperResistant ||
      !result.installationBound ||
      !result.scopeBound ||
      typeof result.validatedAt !== 'number' ||
      typeof result.leaseExpiresAt !== 'number' ||
      result.leaseExpiresAt - result.validatedAt > LEASE_TTL_MAX_MS
    ) {
      return null;
    }

    return {
      validatedAt: result.validatedAt,
      leaseExpiresAt: result.leaseExpiresAt,
    };
  } catch {
    return null;
  }
}

export function clearPersistedLicenseSessionLease() {
  removeLegacyBrowserLease();
  if (isSecureNativeLeaseAvailable()) {
    void NativeOfflineLicenseLease.clear();
  }
}
