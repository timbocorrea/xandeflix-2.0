import { supabase } from '../../../lib/supabase/supabaseClient';
import {
  areSupabaseContentWritesDisabled,
  SUPABASE_CONTENT_WRITES_DISABLED_REASON,
} from '@/config/env';

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

export type AdminLicenseChannelsCacheFailureStage =
  | 'ENVIRONMENT'
  | 'AUTH_USER'
  | 'ADMIN_PROFILE'
  | 'ACCESSIBLE_LICENSES'
  | 'CHANNEL_PAGE'
  | 'TOTAL_ACCESSIBLE'
  | 'TOTAL_FILTERED'
  | 'ACTIVE_COUNT'
  | 'INACTIVE_COUNT'
  | 'SOURCE_LOOKUP'
  | 'GROUP_LIST'
  | 'RESPONSE_ASSEMBLY'
  | 'UNKNOWN';

export type ListAdminLicenseChannelsCacheResponse = {
  ok: boolean;
  channels?: AdminLicenseChannelCacheItem[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  groups?: string[];
  summary?: AdminLicenseChannelsCacheSummary;
  summaryWarnings?: string[];
  error?: string;
  failureStage?: AdminLicenseChannelsCacheFailureStage;
  traceId?: string;
};

export type AdminLicenseChannelsCacheSummary = {
  totalAccessible: number;
  totalFiltered: number;
  sourceCount: number | null;
  activeCount: number;
  inactiveCount: number;
};

export type AdminLicenseChannelsCacheResult = {
  channels: AdminLicenseChannelCacheItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  groups: string[];
  summary: AdminLicenseChannelsCacheSummary;
  summaryWarnings: string[];
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

function getFunctionErrorStatus(error: unknown) {
  const context = (error as { context?: { status?: unknown } })?.context;

  return typeof context?.status === 'number' ? context.status : null;
}

function normalizeListFunctionError(error: unknown) {
  const status = getFunctionErrorStatus(error);

  if (status === 401) {
    return 'UNAUTHORIZED';
  }

  if (status === 403) {
    return 'FORBIDDEN';
  }

  if (status === 404) {
    return 'EDGE_FUNCTION_UNAVAILABLE';
  }

  if (status && status >= 500) {
    return 'ADMIN_CHANNELS_LOAD_FAILED';
  }

  const message = error instanceof Error ? error.message : '';

  if (/failed to send a request/i.test(message)) {
    return 'EDGE_FUNCTION_REQUEST_FAILED';
  }

  return 'ADMIN_CHANNELS_LOAD_FAILED';
}

function isNonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeSummary(summary: AdminLicenseChannelsCacheSummary | undefined) {
  if (!summary) {
    throw new Error('RESPONSE_SCHEMA_INVALID');
  }

  if (
    !isNonNegativeNumber(summary.totalAccessible) ||
    !isNonNegativeNumber(summary.totalFiltered) ||
    !isNonNegativeNumber(summary.activeCount) ||
    !isNonNegativeNumber(summary.inactiveCount) ||
    !(
      summary.sourceCount === null ||
      isNonNegativeNumber(summary.sourceCount)
    )
  ) {
    throw new Error('RESPONSE_SCHEMA_INVALID');
  }

  return summary;
}

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
    throw new Error(normalizeListFunctionError(error));
  }

  if (!data?.ok) {
    throw new Error(data?.error ?? 'LIST_LICENSE_CHANNELS_CACHE_FAILED');
  }

  const summary = normalizeSummary(data.summary);

  return {
    channels: data.channels ?? [],
    totalCount: data.totalCount ?? summary.totalFiltered,
    page: data.page ?? input.page ?? 1,
    pageSize: data.pageSize ?? input.pageSize ?? 25,
    totalPages: data.totalPages ?? 0,
    groups: data.groups ?? [],
    summary,
    summaryWarnings: (data.summaryWarnings ?? []).filter(
      (warning): warning is string => typeof warning === 'string',
    ),
  };
}

export async function updateAdminLicenseChannelStatus(
  input: UpdateAdminLicenseChannelStatusInput,
) {
  if (areSupabaseContentWritesDisabled()) {
    throw new Error(SUPABASE_CONTENT_WRITES_DISABLED_REASON);
  }

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
