import { env } from '@/config/env';

export type AppInstallationStatus =
  | 'installed'
  | 'awaiting_activation'
  | 'activated'
  | 'inactive'
  | 'possibly_uninstalled'
  | 'pending_uninstall'
  | 'manually_marked_uninstalled'
  | 'blocked';

export type AppInstallation = {
  id: string;
  device_identifier: string;
  installation_status: AppInstallationStatus;
  platform?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  app_version?: string | null;
  first_seen_at: string;
  last_seen_at: string;
  linked_license_id?: string | null;
  linked_license_device_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

type RegisterAppInstallationInput = {
  deviceIdentifier: string;
  platform?: string;
  manufacturer?: string;
  model?: string;
  appVersion?: string;
};

type HeartbeatAppInstallationInput = {
  deviceIdentifier: string;
  appVersion?: string;
};

type AppInstallationResponse = {
  ok?: boolean;
  installation?: AppInstallation;
  error?: string;
  details?: string;
};

async function invokeAppInstallationFunction(
  functionName: 'register-app-installation' | 'heartbeat-app-installation',
  payload: Record<string, unknown>,
) {
  const response = await fetch(`${env.supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as AppInstallationResponse | null;

  if (!response.ok || !data?.ok || !data.installation) {
    throw new Error(
      data?.details
        || data?.error
        || `Não foi possível comunicar instalação do app. HTTP ${response.status}`,
    );
  }

  return data.installation;
}

export function registerAppInstallation(input: RegisterAppInstallationInput) {
  return invokeAppInstallationFunction('register-app-installation', {
    deviceIdentifier: input.deviceIdentifier,
    platform: input.platform,
    manufacturer: input.manufacturer,
    model: input.model,
    appVersion: input.appVersion,
  });
}

export function heartbeatAppInstallation(input: HeartbeatAppInstallationInput) {
  return invokeAppInstallationFunction('heartbeat-app-installation', {
    deviceIdentifier: input.deviceIdentifier,
    appVersion: input.appVersion,
  });
}
