import { supabase } from '../../../lib/supabase/supabaseClient';

import type {
  License,
  LicenseDevice,
  LicenseIptvSource,
  LicensePlanType,
  LicenseStatus,
  PlaybackSession,
} from '../types/admin.types';

async function throwFunctionInvokeError(error: unknown): Promise<never> {
  const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
  let structuredError: string | null = null;

  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();

      if (
        body &&
        typeof body === 'object' &&
        'error' in body &&
        typeof body.error === 'string'
      ) {
        structuredError = body.error;
      }
    } catch {
      structuredError = null;
    }
  }

  if (structuredError) {
    throw new Error(structuredError);
  }

  throw error;
}

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

export interface CreateAdminLicenseIptvSourceResponse {
  ok: boolean;
  source?: LicenseIptvSource;
  error?: string;
  details?: string;
}

export interface UpdateLicenseIptvSourceInput {
  name?: string;
  source_url?: string;
  type?: LicenseIptvSource['type'];
  is_active?: boolean;
}

export interface UpdateAdminLicenseIptvSourceResponse {
  ok: boolean;
  source?: LicenseIptvSource;
  error?: string;
  details?: string;
}

export interface LicenseIptvSourceDiagnosticChannel {
  name: string;
  groupTitle: string | null;
}

export interface LicenseIptvSourceDiagnostic {
  success: boolean;
  responded: boolean;
  httpStatus: number | null;
  httpStatusText: string | null;
  contentType: string | null;
  contentLength: number | null;
  bytesRead: number;
  wasTruncated: boolean;
  looksLikeM3u: boolean;
  startsWithExtM3u: boolean;
  extinfLines: number;
  playableUrlLines: number;
  entryCount: number;
  sampleGroups: string[];
  sampleChannels: LicenseIptvSourceDiagnosticChannel[];
  firstNonEmptyLine: string | null;
  errorMessage: string | null;
  testedAt: string;
}

export interface TestAdminLicenseIptvSourceResponse {
  ok: boolean;
  diagnostic?: LicenseIptvSourceDiagnostic;
  error?: string;
  details?: string;
}

export interface ImportLicenseIptvSourceChannelSample {
  name: string;
  groupTitle: string | null;
}

export interface ImportLicenseIptvSourceChannelsResult {
  fetched: boolean;
  parsed: boolean;
  totalParsed: number;
  totalImported: number;
  totalUpdated: number;
  totalReactivated: number;
  totalSkipped: number;
  totalFailed: number;
  totalDeactivatedMissing: number;
  wasLimited: boolean;
  limit: number;
  sampleChannels: ImportLicenseIptvSourceChannelSample[];
  message: string;
}

export interface ImportAdminLicenseIptvSourceChannelsResponse {
  ok: boolean;
  sourceId?: string;
  result?: ImportLicenseIptvSourceChannelsResult;
  error?: string;
  details?: string;
}

export interface CreateAdminLicenseDeviceInput {
  licenseId: string;
  deviceIdentifier: string;
  deviceName?: string | null;
  platform?: string | null;
  isActive?: boolean;
}

export interface CreateAdminLicenseDeviceResponse {
  ok: boolean;
  device?: LicenseDevice;
  alreadyExisted?: boolean;
  error?: string;
  details?: string;
}

export interface UpdateAdminLicenseDeviceStatusInput {
  deviceId: string;
  isActive: boolean;
}

export interface UpdateAdminLicenseDeviceStatusResponse {
  ok: boolean;
  device?: LicenseDevice;
  error?: string;
  details?: string;
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
  const { data, error } =
    await supabase.functions.invoke<CreateAdminLicenseIptvSourceResponse>(
      'create-license-iptv-source',
      {
        body: {
          license_id: input.license_id,
          name: input.name.trim(),
          source_url: input.source_url.trim(),
          type: input.type ?? 'm3u',
          is_active: input.is_active ?? true,
          created_by: input.created_by ?? 'admin',
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.source) {
    throw new Error(data?.error ?? 'CREATE_LICENSE_IPTV_SOURCE_FAILED');
  }

  return data.source;
}

export async function updateAdminLicenseIptvSource(
  sourceId: string,
  input: UpdateLicenseIptvSourceInput,
): Promise<LicenseIptvSource> {
  const { data, error } =
    await supabase.functions.invoke<UpdateAdminLicenseIptvSourceResponse>(
      'update-license-iptv-source',
      {
        body: {
          sourceId,
          ...input,
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.source) {
    throw new Error(data?.error ?? 'UPDATE_LICENSE_IPTV_SOURCE_FAILED');
  }

  return data.source;
}

export async function testAdminLicenseIptvSource(
  sourceId: string,
): Promise<LicenseIptvSourceDiagnostic> {
  const { data, error } =
    await supabase.functions.invoke<TestAdminLicenseIptvSourceResponse>(
      'test-license-iptv-source',
      {
        body: {
          sourceId,
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.diagnostic) {
    throw new Error(data?.error ?? 'TEST_LICENSE_IPTV_SOURCE_FAILED');
  }

  return data.diagnostic;
}

export async function importAdminLicenseIptvSourceChannels(
  sourceId: string,
  limit?: number,
): Promise<ImportLicenseIptvSourceChannelsResult> {
  const { data, error } =
    await supabase.functions.invoke<ImportAdminLicenseIptvSourceChannelsResponse>(
      'import-license-iptv-source-channels',
      {
        body: {
          sourceId,
          ...(limit === undefined ? {} : { limit }),
        },
      },
    );

  if (error) {
    await throwFunctionInvokeError(error);
  }

  if (!data?.ok || !data.result) {
    throw new Error(data?.error ?? 'IMPORT_LICENSE_IPTV_SOURCE_CHANNELS_FAILED');
  }

  return data.result;
}

export async function createAdminLicenseDevice(
  input: CreateAdminLicenseDeviceInput,
): Promise<LicenseDevice> {
  const { data, error } =
    await supabase.functions.invoke<CreateAdminLicenseDeviceResponse>(
      'create-license-device',
      {
        body: {
          licenseId: input.licenseId,
          deviceIdentifier: input.deviceIdentifier.trim(),
          deviceName: input.deviceName ?? null,
          platform: input.platform ?? null,
          isActive: input.isActive ?? true,
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.device) {
    throw new Error(data?.error ?? 'CREATE_LICENSE_DEVICE_FAILED');
  }

  return data.device;
}

export async function updateAdminLicenseDeviceStatus({
  deviceId,
  isActive,
}: UpdateAdminLicenseDeviceStatusInput): Promise<LicenseDevice> {
  const { data, error } =
    await supabase.functions.invoke<UpdateAdminLicenseDeviceStatusResponse>(
      'update-license-device-status',
      {
        body: {
          deviceId,
          isActive,
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.device) {
    throw new Error(data?.error ?? 'UPDATE_LICENSE_DEVICE_STATUS_FAILED');
  }

  return data.device;
}
