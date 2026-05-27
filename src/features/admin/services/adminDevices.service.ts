import { supabase } from '../../../lib/supabase/supabaseClient';

import type { Device } from '../types/admin.types';

export type LicenseDeviceOperationalStatus =
  | 'active'
  | 'idle'
  | 'inactive'
  | 'expired';

export interface LicenseAuthorizedDevice {
  id: string;
  license_id: string;
  license_code: string | null;
  client_id: string | null;
  client_name: string | null;
  device_identifier: string;
  device_name: string | null;
  platform: string | null;
  is_active: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  license_status: string | null;
  license_expires_at: string | null;
  plan_interval: string;
  last_seen_days: number | null;
  operational_status: LicenseDeviceOperationalStatus;
  operational_label: string;
  removable: boolean;
}

interface ListLicenseDevicesAdminResponse {
  ok: boolean;
  devices?: LicenseAuthorizedDevice[];
  error?: string;
  details?: string;
}

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

export async function listAdminLicenseAuthorizedDevices(): Promise<LicenseAuthorizedDevice[]> {
  const { data, error } = await supabase.functions.invoke<ListLicenseDevicesAdminResponse>(
    'list-license-devices-admin',
    {
      body: {},
    },
  );

  if (error) {
    throw error;
  }

  if (!data?.ok) {
    throw new Error(data?.error ?? 'LIST_LICENSE_DEVICES_ADMIN_FAILED');
  }

  return data.devices ?? [];
}





export async function deleteAdminLicenseAuthorizedDevice(deviceId: string): Promise<void> {
  const { error } = await supabase
    .from('license_devices')
    .delete()
    .eq('id', deviceId);

  if (error) {
    throw error;
  }
}

export async function deleteAdminLicenseAuthorizedDevices(deviceIds: string[]): Promise<void> {
  if (deviceIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('license_devices')
    .delete()
    .in('id', deviceIds);

  if (error) {
    throw error;
  }
}
