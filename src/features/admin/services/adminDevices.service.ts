import { supabase } from '../../../lib/supabase/supabaseClient';

import type { Device } from '../types/admin.types';

export interface CreateDeviceInput {
  client_id: string;
  device_name?: string | null;
  device_identifier?: string | null;
  platform?: string | null;
  is_active?: boolean;
}

export async function listAdminDevices(): Promise<Device[]> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Device[];
}

export async function listAdminDevicesByClient(clientId: string): Promise<Device[]> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Device[];
}

export async function createAdminDevice(input: CreateDeviceInput): Promise<Device> {
  const { data, error } = await supabase
    .from('devices')
    .insert({
      client_id: input.client_id,
      device_name: input.device_name ?? null,
      device_identifier: input.device_identifier ?? null,
      platform: input.platform ?? null,
      is_active: input.is_active ?? true,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Device;
}
