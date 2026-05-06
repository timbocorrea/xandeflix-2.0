import { supabase } from '../../../lib/supabase/supabaseClient';

import type { ChannelCache } from '../types/admin.types';

export interface CreateChannelCacheInput {
  iptv_source_id: string;
  name: string;
  logo_url?: string | null;
  group_title?: string | null;
  stream_url: string;
  tvg_id?: string | null;
  sort_order?: number | null;
}

export async function listAdminChannelsCache(): Promise<ChannelCache[]> {
  const { data, error } = await supabase
    .from('channels_cache')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ChannelCache[];
}

export async function listAdminChannelsCacheBySource(
  iptvSourceId: string,
): Promise<ChannelCache[]> {
  const { data, error } = await supabase
    .from('channels_cache')
    .select('*')
    .eq('iptv_source_id', iptvSourceId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ChannelCache[];
}

export async function createAdminChannelCache(
  input: CreateChannelCacheInput,
): Promise<ChannelCache> {
  const { data, error } = await supabase
    .from('channels_cache')
    .insert({
      iptv_source_id: input.iptv_source_id,
      name: input.name,
      logo_url: input.logo_url ?? null,
      group_title: input.group_title ?? null,
      stream_url: input.stream_url,
      tvg_id: input.tvg_id ?? null,
      sort_order: input.sort_order ?? 0,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as ChannelCache;
}
