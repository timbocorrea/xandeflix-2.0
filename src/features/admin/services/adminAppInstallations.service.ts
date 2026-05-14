import { supabase } from '../../../lib/supabase/supabaseClient';

import type { AppInstallation } from '../types/admin.types';

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
