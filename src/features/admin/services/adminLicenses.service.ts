import { supabase } from '../../../lib/supabase/supabaseClient';

import type {
  License,
  LicenseDevice,
  LicenseIptvSource,
  LicensePlanType,
  LicenseStatus,
  PlaybackSession,
} from '../types/admin.types';

export interface CreateLicenseInput {
  license_code: string;
  label?: string | null;
  plan_type?: LicensePlanType;
  expires_at?: string | null;
  max_devices?: number;
  max_concurrent_streams?: number;
  allow_user_manage_sources?: boolean;
  notes?: string | null;
}

export interface CreateAdminLicenseResponse {
  ok: boolean;
  license?: License;
  error?: string;
  details?: string;
}

export interface UpdateAdminLicenseStatusInput {
  licenseId: string;
  status: Extract<LicenseStatus, 'active' | 'expired' | 'canceled'>;
}

export interface UpdateAdminLicenseStatusResponse {
  ok: boolean;
  license?: License;
  error?: string;
  details?: string;
}

export interface UpdateAdminLicenseDetailsInput {
  licenseId: string;
  label?: string | null;
  plan_type: LicensePlanType;
  expires_at?: string | null;
  max_devices: number;
  max_concurrent_streams: number;
  allow_user_manage_sources: boolean;
  notes?: string | null;
}

export interface UpdateAdminLicenseDetailsResponse {
  ok: boolean;
  license?: License;
  error?: string;
  details?: string;
}

export interface CreateLicenseIptvSourceInput {
  license_id: string;
  name: string;
  source_url: string;
  type?: LicenseIptvSource['type'];
  is_active?: boolean;
  created_by?: LicenseIptvSource['created_by'];
}

export interface UpdateLicenseIptvSourceInput {
  name?: string;
  source_url?: string;
  type?: LicenseIptvSource['type'];
  is_active?: boolean;
}

export async function listAdminLicenses(): Promise<License[]> {
  const { data, error } = await supabase
    .from('licenses')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as License[];
}

export async function createAdminLicense(input: CreateLicenseInput): Promise<License> {
  const { data, error } =
    await supabase.functions.invoke<CreateAdminLicenseResponse>(
      'create-license',
      {
        body: {
          license_code: input.license_code.trim().toUpperCase(),
          label: input.label ?? null,
          plan_type: input.plan_type ?? 'monthly',
          expires_at: input.expires_at ?? null,
          max_devices: input.max_devices ?? 1,
          max_concurrent_streams: input.max_concurrent_streams ?? 1,
          allow_user_manage_sources: input.allow_user_manage_sources ?? true,
          notes: input.notes ?? null,
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.license) {
    throw new Error(data?.error ?? 'CREATE_LICENSE_FAILED');
  }

  return data.license;
}

export async function updateAdminLicenseStatus({
  licenseId,
  status,
}: UpdateAdminLicenseStatusInput): Promise<License> {
  const { data, error } =
    await supabase.functions.invoke<UpdateAdminLicenseStatusResponse>(
      'update-license-status',
      {
        body: {
          licenseId,
          status,
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.license) {
    throw new Error(data?.error ?? 'UPDATE_LICENSE_STATUS_FAILED');
  }

  return data.license;
}

export async function updateAdminLicenseDetails({
  licenseId,
  label,
  plan_type,
  expires_at,
  max_devices,
  max_concurrent_streams,
  allow_user_manage_sources,
  notes,
}: UpdateAdminLicenseDetailsInput): Promise<License> {
  const { data, error } =
    await supabase.functions.invoke<UpdateAdminLicenseDetailsResponse>(
      'update-license-details',
      {
        body: {
          licenseId,
          label,
          plan_type,
          expires_at,
          max_devices,
          max_concurrent_streams,
          allow_user_manage_sources,
          notes,
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.license) {
    throw new Error(data?.error ?? 'UPDATE_LICENSE_DETAILS_FAILED');
  }

  return data.license;
}

export async function listAdminLicenseDevices(licenseId: string): Promise<LicenseDevice[]> {
  const { data, error } = await supabase
    .from('license_devices')
    .select('*')
    .eq('license_id', licenseId)
    .order('last_seen_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as LicenseDevice[];
}

export async function listAdminLicenseIptvSources(
  licenseId: string,
): Promise<LicenseIptvSource[]> {
  const { data, error } = await supabase
    .from('license_iptv_sources')
    .select('*')
    .eq('license_id', licenseId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as LicenseIptvSource[];
}

export async function listAdminPlaybackSessions(
  licenseId: string,
): Promise<PlaybackSession[]> {
  const { data, error } = await supabase
    .from('playback_sessions')
    .select('*')
    .eq('license_id', licenseId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as PlaybackSession[];
}

export async function createAdminLicenseIptvSource(
  input: CreateLicenseIptvSourceInput,
): Promise<LicenseIptvSource> {
  const { data, error } = await supabase
    .from('license_iptv_sources')
    .insert({
      license_id: input.license_id,
      name: input.name.trim(),
      source_url: input.source_url.trim(),
      type: input.type ?? 'm3u',
      is_active: input.is_active ?? true,
      created_by: input.created_by ?? 'admin',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as LicenseIptvSource;
}

export async function updateAdminLicenseIptvSource(
  sourceId: string,
  input: UpdateLicenseIptvSourceInput,
): Promise<LicenseIptvSource> {
  const { data, error } = await supabase
    .from('license_iptv_sources')
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

  return data as LicenseIptvSource;
}
