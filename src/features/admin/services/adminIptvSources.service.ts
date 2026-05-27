import { supabase } from '../../../lib/supabase/supabaseClient';

import type { IptvSource } from '../types/admin.types';

export interface CreateIptvSourceInput {
  client_id?: string | null;
  name: string;
  source_url: string;
  type?: IptvSource['type'];
  is_active?: boolean;
}

export interface UpdateIptvSourceInput {
  name?: string;
  source_url?: string;
  type?: IptvSource['type'];
  is_active?: boolean;
}

export async function listAdminIptvSources(): Promise<IptvSource[]> {
  const { data, error } = await supabase
    .from('iptv_sources')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as IptvSource[];
}

export async function listAdminIptvSourcesByClient(clientId: string): Promise<IptvSource[]> {
  const { data, error } = await supabase
    .from('iptv_sources')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as IptvSource[];
}

export async function createAdminIptvSource(input: CreateIptvSourceInput): Promise<IptvSource> {
  const { data, error } = await supabase
    .from('iptv_sources')
    .insert({
      client_id: input.client_id ?? null,
      name: input.name,
      source_url: input.source_url,
      type: input.type ?? 'm3u',
      is_active: input.is_active ?? true,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as IptvSource;
}

export async function updateAdminIptvSource(
  sourceId: string,
  input: UpdateIptvSourceInput,
): Promise<IptvSource> {
  const { data, error } = await supabase
    .from('iptv_sources')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as IptvSource;
}
