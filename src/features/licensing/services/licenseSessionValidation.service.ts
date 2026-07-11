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

export async function validateStoredLicenseSession({
  licenseCode,
  deviceIdentifier,
}: ValidateStoredLicenseSessionInput): Promise<ValidateStoredLicenseSessionResult> {
  const normalizedLicenseCode = licenseCode.trim().toUpperCase();
  const normalizedDeviceIdentifier = deviceIdentifier.trim();

  if (!normalizedLicenseCode || !normalizedDeviceIdentifier) {
    return { valid: false, error: 'INVALID_REQUEST' };
  }

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

    return { valid: true };
  } catch {
    return { valid: false, error: 'VALIDATION_FAILED' };
  }
}
