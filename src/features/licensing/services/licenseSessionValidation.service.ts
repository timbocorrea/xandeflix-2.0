import { supabase } from '@/lib/supabase/supabaseClient';

type ValidateStoredLicenseSessionInput = {
  licenseCode: string;
  deviceIdentifier: string;
};

type ValidateStoredLicenseSessionResult = {
  valid: boolean;
  error?: string;
};

type ValidateLicenseSessionResponse = {
  ok?: boolean;
  valid?: boolean;
  error?: string;
};

const VALID_LICENSE_SESSION_TTL_MS = 5 * 60 * 1000;

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
  return `${licenseCode}::${deviceIdentifier}`;
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
    return { valid: false, error: 'INVALID_REQUEST' };
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

  const currentRequest = validationRequests.get(scopeKey);

  if (currentRequest) {
    return currentRequest;
  }

  const request = (async (): Promise<ValidateStoredLicenseSessionResult> => {
    try {
      const { data, error } =
        await supabase.functions.invoke<ValidateLicenseSessionResponse>(
          'validate-license-session',
          {
            body: {
              licenseCode: normalizedLicenseCode,
              deviceIdentifier: normalizedDeviceIdentifier,
            },
          },
        );

      if (error) {
        return { valid: false, error: 'VALIDATION_FAILED' };
      }

      if (!data?.ok || data.valid !== true) {
        return { valid: false, error: data?.error ?? 'VALIDATION_FAILED' };
      }

      const result = { valid: true };
      validatedSessionCache.set(scopeKey, {
        validatedAt: Date.now(),
        result,
      });
      return result;
    } catch {
      return { valid: false, error: 'VALIDATION_FAILED' };
    } finally {
      validationRequests.delete(scopeKey);
    }
  })();

  validationRequests.set(scopeKey, request);
  return request;
}
