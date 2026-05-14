import { supabase } from '../../../lib/supabase/supabaseClient';

import type { AppInstallation, AppInstallationStatus } from '../types/admin.types';

export type AdminAppInstallationsSummary = {
  total: number;
  communicating: number;
  inactive: number;
  possiblyUninstalled: number;
};

export type ListPaginatedAdminAppInstallationsInput = {
  page: number;
  pageSize: number;
  status: AppInstallationStatus | null;
  platform: string | null;
  searchTerm: string;
};

export type ListPaginatedAdminAppInstallationsResult = {
  installations: AppInstallation[];
  totalCount: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getRange(page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  return { from, to };
}

function getIsoDateDaysAgo(days: number) {
  const date = new Date();

  date.setDate(date.getDate() - days);

  return date.toISOString();
}

export async function listAdminAppInstallations(): Promise<AppInstallation[]> {
  const { data, error } = await supabase
    .from('app_installations')
    .select('*')
    .order('last_seen_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as AppInstallation[];
}

export async function listPaginatedAdminAppInstallations({
  page,
  pageSize,
  status,
  platform,
  searchTerm,
}: ListPaginatedAdminAppInstallationsInput): Promise<ListPaginatedAdminAppInstallationsResult> {
  const { from, to } = getRange(page, pageSize);
  const normalizedSearchTerm = searchTerm.trim();

  let query = supabase
    .from('app_installations')
    .select('*', { count: 'exact' });

  if (status) {
    query = query.eq('installation_status', status);
  }

  if (platform) {
    query = query.eq('platform', platform);
  }

  if (normalizedSearchTerm.length > 0) {
    if (UUID_PATTERN.test(normalizedSearchTerm)) {
      query = query.or(
        `device_identifier.ilike.%${normalizedSearchTerm}%,linked_license_id.eq.${normalizedSearchTerm}`,
      );
    } else {
      query = query.ilike('device_identifier', `%${normalizedSearchTerm}%`);
    }
  }

  const { data, error, count } = await query
    .order('last_seen_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  return {
    installations: (data ?? []) as AppInstallation[],
    totalCount: count ?? 0,
  };
}

export async function listAdminAppInstallationPlatforms(): Promise<string[]> {
  const { data, error } = await supabase
    .from('app_installations')
    .select('platform')
    .not('platform', 'is', null)
    .order('platform', { ascending: true });

  if (error) {
    throw error;
  }

  return Array.from(
    new Set(
      (data ?? [])
        .map((item) => item.platform?.trim())
        .filter((platform): platform is string => Boolean(platform)),
    ),
  );
}

export async function getAdminAppInstallationsSummary({
  inactiveAfterDays,
  possiblyUninstalledAfterDays,
}: {
  inactiveAfterDays: number;
  possiblyUninstalledAfterDays: number;
}): Promise<AdminAppInstallationsSummary> {
  const inactiveCutoff = getIsoDateDaysAgo(inactiveAfterDays);
  const possiblyUninstalledCutoff = getIsoDateDaysAgo(possiblyUninstalledAfterDays);

  const [
    totalResult,
    communicatingResult,
    inactiveResult,
    possiblyUninstalledResult,
  ] = await Promise.all([
    supabase.from('app_installations').select('id', { count: 'exact', head: true }),
    supabase
      .from('app_installations')
      .select('id', { count: 'exact', head: true })
      .gte('last_seen_at', inactiveCutoff),
    supabase
      .from('app_installations')
      .select('id', { count: 'exact', head: true })
      .lt('last_seen_at', inactiveCutoff)
      .gte('last_seen_at', possiblyUninstalledCutoff),
    supabase
      .from('app_installations')
      .select('id', { count: 'exact', head: true })
      .lt('last_seen_at', possiblyUninstalledCutoff),
  ]);

  const error =
    totalResult.error ??
    communicatingResult.error ??
    inactiveResult.error ??
    possiblyUninstalledResult.error;

  if (error) {
    throw error;
  }

  return {
    total: totalResult.count ?? 0,
    communicating: communicatingResult.count ?? 0,
    inactive: inactiveResult.count ?? 0,
    possiblyUninstalled: possiblyUninstalledResult.count ?? 0,
  };
}

type UpdateAdminAppInstallationStatusInput = {
  installationId: string;
  status: Extract<
    AppInstallationStatus,
    'activated' | 'inactive' | 'pending_uninstall' | 'manually_marked_uninstalled' | 'blocked'
  >;
};

export async function updateAdminAppInstallationStatus({
  installationId,
  status,
}: UpdateAdminAppInstallationStatusInput): Promise<AppInstallation> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    installation?: AppInstallation;
    error?: string;
  }>('update-app-installation-status', {
    body: {
      installationId,
      status,
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.ok || !data.installation) {
    throw new Error(data?.error ?? 'APP_INSTALLATION_STATUS_UPDATE_FAILED');
  }

  return data.installation;
}
