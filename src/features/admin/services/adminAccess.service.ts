import { supabase } from '../../../lib/supabase/supabaseClient';

import type { AdminProfile } from '../types/admin.types';

export async function getCurrentAdminProfile(): Promise<AdminProfile | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as AdminProfile | null;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const adminProfile = await getCurrentAdminProfile();

  return Boolean(adminProfile);
}
