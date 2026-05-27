import { env } from '@/config/env';

import type {
  LicenseActivationResult,
  ActivatedLicense,
  ActivatedLicenseDevice,
} from '../types/license.types';

type ActivateLicenseSuccessResponse = {
  ok: true;
  license: ActivatedLicense;
  device: ActivatedLicenseDevice;
};

type ActivateLicenseErrorResponse = {
  ok?: false;
  error?: string;
  details?: string;
  status?: string;
};

type ActivateLicenseResponse =
  | ActivateLicenseSuccessResponse
  | ActivateLicenseErrorResponse;

function isActivateLicenseSuccess(
  data: ActivateLicenseResponse | null,
): data is ActivateLicenseSuccessResponse {
  return Boolean(data?.ok);
}

export async function activateLicense(input: {
  licenseCode: string;
  deviceIdentifier: string;
  deviceName?: string;
  platform?: string;
  manufacturer?: string;
  model?: string;
  appVersion?: string;
}): Promise<LicenseActivationResult> {
  const licenseCode = input.licenseCode.trim().toUpperCase();
  const deviceIdentifier = input.deviceIdentifier.trim();

  if (!licenseCode) {
    throw new Error('Código de licença não informado.');
  }

  if (!deviceIdentifier) {
    throw new Error('Identificador do dispositivo não informado.');
  }

  const response = await fetch(
    `${env.supabaseUrl}/functions/v1/activate-license`,
    {
      method: 'POST',
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        licenseCode,
        deviceIdentifier,
        deviceName: input.deviceName,
        platform: input.platform,
        manufacturer: input.manufacturer,
        model: input.model,
        appVersion: input.appVersion,
      }),
    },
  );

  const data = (await response.json().catch(() => null)) as
    | ActivateLicenseResponse
    | null;

  if (!response.ok || !isActivateLicenseSuccess(data)) {
    const errorData = data as ActivateLicenseErrorResponse | null;

    throw new Error(
      errorData?.details ||
        errorData?.error ||
        `Não foi possível ativar a licença. HTTP ${response.status}`,
    );
  }

  return {
    license: data.license,
    device: data.device,
  };
}
