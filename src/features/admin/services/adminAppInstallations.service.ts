import { supabase } from '../../../lib/supabase/supabaseClient';

import type { AppInstallation, AppInstallationStatus } from '../types/admin.types';

export async function listAdminAppInstallations(): Promise<AppInstallation[]> {
  const { data, error } = await supabase
    .from('app_installations')
    .select('*')
    .order('last_seen_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as AppInstallation[];
}

type UpdateAdminAppInstallationStatusInput = {
  installationId: string;
  status: Extract<
    AppInstallationStatus,
    'activated' | 'inactive' | 'pending_uninstall' | 'manually_marked_uninstalled' | 'blocked'
  >;
};

export async function updateAdminAppInstallationStatus({
  installationId,
  status,
}: UpdateAdminAppInstallationStatusInput): Promise<AppInstallation> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    installation?: AppInstallation;
    error?: string;
  }>('update-app-installation-status', {
    body: {
      installationId,
      status,
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.installation) {
    throw new Error(data?.error ?? 'APP_INSTALLATION_STATUS_UPDATE_FAILED');
  }

  return data.installation;
}
