import {
  getAuthorizedIptvSource,
  type AuthorizedIptvSource,
} from '@/features/playlists/services/authorizedIptvSource.service';
import {
  clearPersistedLicenseSessionLease,
  getValidPersistedLicenseSessionLease,
  savePersistedLicenseSessionLease,
} from '../lib/licenseSessionLeaseStorage';

export type ValidateStoredLicenseSessionInput = {
  licenseCode: string;
  deviceIdentifier: string;
};

export type LicenseValidationStatus =
  | 'CHECKING'
  | 'VALID'
  | 'INVALID_LICENSE'
  | 'DEVICE_DISABLED'
  | 'LICENSE_EXPIRED'
  | 'CANONICAL_VALIDATION_UNAVAILABLE'
  | 'LOCAL_CANONICAL_LEASE_VALID'
  | 'LOCAL_CANONICAL_LEASE_EXPIRED';

export type ValidateStoredLicenseSessionResult = {
  valid: boolean;
  status: LicenseValidationStatus;
  error?: string;
  transientFailure?: boolean;
  authorizedSource?: AuthorizedIptvSource;
};

const VALID_LICENSE_SESSION_TTL_MS = 5 * 60 * 1000;
const LEASE_GRACE_TTL_MS = 12 * 60 * 60 * 1000;

type ValidatedLicenseSessionCacheEntry = {
  validatedAt: number;
  result: ValidateStoredLicenseSessionResult;
};

const validatedSessionCache = new Map<
  string,
  ValidatedLicenseSessionCacheEntry
>();
const validationRequests = new Map<
  string,
  Promise<ValidateStoredLicenseSessionResult>
>();

function createValidationScopeKey(
  licenseCode: string,
  deviceIdentifier: string,
) {
  return `${licenseCode.trim().toUpperCase()}::${deviceIdentifier.trim()}`;
}

export function clearValidatedLicenseSessionCache() {
  validatedSessionCache.clear();
  validationRequests.clear();
}

export async function validateStoredLicenseSession({
  licenseCode,
  deviceIdentifier,
}: ValidateStoredLicenseSessionInput): Promise<ValidateStoredLicenseSessionResult> {
  const normalizedLicenseCode = licenseCode.trim().toUpperCase();
  const normalizedDeviceIdentifier = deviceIdentifier.trim();

  if (!normalizedLicenseCode || !normalizedDeviceIdentifier) {
    return {
      valid: false,
      status: 'INVALID_LICENSE',
      error: 'INVALID_REQUEST',
    };
  }

  const scopeKey = createValidationScopeKey(
    normalizedLicenseCode,
    normalizedDeviceIdentifier,
  );
  const cachedEntry = validatedSessionCache.get(scopeKey);

  if (
    cachedEntry &&
    Date.now() - cachedEntry.validatedAt < VALID_LICENSE_SESSION_TTL_MS
  ) {
    return { ...cachedEntry.result };
  }

  const persistedLease = await getValidPersistedLicenseSessionLease({
    scopeKey,
    now: Date.now(),
  });

  if (
    persistedLease &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    return {
      valid: true,
      status: 'LOCAL_CANONICAL_LEASE_VALID',
      transientFailure: true,
    };
  }

  const currentRequest = validationRequests.get(scopeKey);

  if (currentRequest) {
    return currentRequest;
  }

  const request = (async (): Promise<ValidateStoredLicenseSessionResult> => {
    try {
      const authorizedSource = await getAuthorizedIptvSource({
        licenseCode: normalizedLicenseCode,
        deviceIdentifier: normalizedDeviceIdentifier,
      });

      const result: ValidateStoredLicenseSessionResult = {
        valid: true,
        status: 'VALID',
        authorizedSource,
      };

      validatedSessionCache.set(scopeKey, {
        validatedAt: Date.now(),
        result,
      });
      await savePersistedLicenseSessionLease({
        scopeKey,
        validatedAt: Date.now(),
        leaseTtlMs: LEASE_GRACE_TTL_MS,
        canonicalExpiresAt:
          authorizedSource.license?.expiresAt ?? authorizedSource.client?.expiresAt,
      });

      return result;
    } catch (err: unknown) {
      const errorCode =
        err instanceof Error && 'code' in err && (err as { code?: string }).code
          ? (err as { code?: string }).code!
          : err instanceof Error
            ? err.message
            : 'SERVER_ERROR';

      let status: LicenseValidationStatus = 'CANONICAL_VALIDATION_UNAVAILABLE';
      let isPermanentRejection = false;

      if (
        errorCode === 'LICENSE_NOT_FOUND' ||
        errorCode === 'LICENSE_BLOCKED' ||
        errorCode === 'LICENSE_INACTIVE'
      ) {
        status = 'INVALID_LICENSE';
        isPermanentRejection = true;
      } else if (
        errorCode === 'DEVICE_NOT_ACTIVATED' ||
        errorCode === 'DEVICE_INACTIVE' ||
        errorCode === 'DEVICE_NOT_AUTHORIZED'
      ) {
        status = 'DEVICE_DISABLED';
        isPermanentRejection = true;
      } else if (
        errorCode === 'LICENSE_EXPIRED' ||
        errorCode === 'CLIENT_EXPIRED'
      ) {
        status = 'LICENSE_EXPIRED';
        isPermanentRejection = true;
      }

      if (isPermanentRejection) {
        validatedSessionCache.delete(scopeKey);
        clearPersistedLicenseSessionLease();
        return {
          valid: false,
          status,
          error: errorCode,
          transientFailure: false,
        };
      }

      const previousValidEntry = validatedSessionCache.get(scopeKey);
      if (
        previousValidEntry &&
        previousValidEntry.result.valid &&
        Date.now() - previousValidEntry.validatedAt < LEASE_GRACE_TTL_MS
      ) {
        return {
          valid: true,
          status: 'LOCAL_CANONICAL_LEASE_VALID',
          transientFailure: true,
          authorizedSource: previousValidEntry.result.authorizedSource,
        };
      }

      if (persistedLease) {
        return {
          valid: true,
          status: 'LOCAL_CANONICAL_LEASE_VALID',
          transientFailure: true,
        };
      }

      const leaseExpired = Boolean(previousValidEntry || persistedLease);
      return {
        valid: false,
        status: leaseExpired
          ? 'LOCAL_CANONICAL_LEASE_EXPIRED'
          : 'CANONICAL_VALIDATION_UNAVAILABLE',
        transientFailure: true,
        error: errorCode,
      };
    } finally {
      validationRequests.delete(scopeKey);
    }
  })();

  validationRequests.set(scopeKey, request);
  return request;
}
