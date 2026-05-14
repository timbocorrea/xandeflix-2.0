import { supabase } from '../../../lib/supabase/supabaseClient';

import type { AdminProfile } from '../types/admin.types';

export async function listAdminUsers(): Promise<AdminProfile[]> {
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('id, email, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as AdminProfile[];
}
