import { supabase } from '../../../lib/supabase/supabaseClient';

import type { LicenseChannelCache } from '../types/admin.types';

export type AdminLicenseChannelCacheLicense = {
  id: string;
  license_code: string;
  label: string | null;
};

export type AdminLicenseChannelCacheSource = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

export type AdminLicenseChannelCacheItem = LicenseChannelCache & {
  license: AdminLicenseChannelCacheLicense | null;
  source: AdminLicenseChannelCacheSource | null;
};

export type ListAdminLicenseChannelsCacheInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  groupTitle?: string | null;
  licenseId?: string | null;
  sourceId?: string | null;
  isActive?: boolean | null;
};

export type ListAdminLicenseChannelsCacheResponse = {
  ok: boolean;
  channels?: AdminLicenseChannelCacheItem[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  groups?: string[];
  error?: string;
  details?: string;
};

export type AdminLicenseChannelsCacheResult = {
  channels: AdminLicenseChannelCacheItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  groups: string[];
};

export type UpdateAdminLicenseChannelStatusInput = {
  channelId: string;
  isActive: boolean;
};

export type UpdateAdminLicenseChannelStatusResponse = {
  ok: boolean;
  channel?: Pick<LicenseChannelCache, 'id' | 'name' | 'is_active' | 'updated_at'>;
  error?: string;
  details?: string;
};

export async function listAdminLicenseChannelsCache(
  input: ListAdminLicenseChannelsCacheInput = {},
): Promise<AdminLicenseChannelsCacheResult> {
  const { data, error } =
    await supabase.functions.invoke<ListAdminLicenseChannelsCacheResponse>(
      'list-license-channels-cache',
      {
        body: input,
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok) {
    throw new Error(data?.error ?? 'LIST_LICENSE_CHANNELS_CACHE_FAILED');
  }

  return {
    channels: data.channels ?? [],
    totalCount: data.totalCount ?? 0,
    page: data.page ?? input.page ?? 1,
    pageSize: data.pageSize ?? input.pageSize ?? 25,
    totalPages: data.totalPages ?? 0,
    groups: data.groups ?? [],
  };
}

export async function updateAdminLicenseChannelStatus(
  input: UpdateAdminLicenseChannelStatusInput,
) {
  const { data, error } =
    await supabase.functions.invoke<UpdateAdminLicenseChannelStatusResponse>(
      'update-license-channel-status',
      {
        body: input,
      },
    );

  if (error) {
    if (data?.error) {
      throw new Error(data.error);
    }

    throw error;
  }

  if (!data?.ok || !data.channel) {
    throw new Error(data?.error ?? 'LICENSE_CHANNEL_STATUS_UPDATE_FAILED');
  }

  return data.channel;
}
