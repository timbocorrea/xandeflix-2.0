import { supabase } from '../../../lib/supabase/supabaseClient';

import { getCurrentAdminProfile } from './adminAccess.service';
import type { Client } from '../types/admin.types';

export interface CreateClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: Client['status'];
  expires_at?: string | null;
  notes?: string | null;
}

export async function listAdminClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Client[];
}

export async function getAdminClientById(clientId: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as Client | null;
}

export async function createAdminClient(input: CreateClientInput): Promise<Client> {
  const adminProfile = await getCurrentAdminProfile();

  const { data, error } = await supabase
    .from('clients')
    .insert({
      admin_owner_id: adminProfile?.id ?? null,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      status: input.status ?? 'active',
      expires_at: input.expires_at ?? null,
      notes: input.notes ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Client;
}
