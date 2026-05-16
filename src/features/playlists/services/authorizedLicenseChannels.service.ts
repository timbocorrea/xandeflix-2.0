import { supabase } from '@/lib/supabase/supabaseClient';

import type { IptvChannel } from '../types/playlist';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 10;

type LicenseChannelCacheItem = {
  id: string;
  name: string;
  stream_url: string;
  logo_url: string | null;
  group_title: string | null;
  tvg_id: string | null;
  sort_order?: number | null;
  is_active: boolean;
};

type ListLicenseChannelsCacheResponse = {
  ok?: boolean;
  channels?: LicenseChannelCacheItem[];
  totalPages?: number;
  error?: string;
  details?: string;
};

export type ListAuthorizedLicenseChannelsInput = {
  licenseId: string;
  pageSize?: number;
  maxPages?: number;
};

function compareNullableText(current: string | null, next: string | null) {
  return (current ?? '').localeCompare(next ?? '', 'pt-BR', {
    sensitivity: 'base',
  });
}

function sortLicenseChannels(
  current: LicenseChannelCacheItem,
  next: LicenseChannelCacheItem,
) {
  const groupComparison = compareNullableText(
    current.group_title,
    next.group_title,
  );

  if (groupComparison !== 0) {
    return groupComparison;
  }

  const currentOrder =
    typeof current.sort_order === 'number' ? current.sort_order : 0;
  const nextOrder = typeof next.sort_order === 'number' ? next.sort_order : 0;

  if (currentOrder !== nextOrder) {
    return currentOrder - nextOrder;
  }

  return current.name.localeCompare(next.name, 'pt-BR', {
    sensitivity: 'base',
  });
}

function mapLicenseChannelToIptvChannel(
  channel: LicenseChannelCacheItem,
): IptvChannel {
  return {
    id: channel.id,
    name: channel.name,
    url: channel.stream_url,
    logo: channel.logo_url ?? undefined,
    groupTitle: channel.group_title ?? undefined,
    tvgId: channel.tvg_id ?? undefined,
    tvgName: channel.name,
  };
}

async function fetchLicenseChannelsPage({
  licenseId,
  page,
  pageSize,
}: {
  licenseId: string;
  page: number;
  pageSize: number;
}) {
  const { data, error } =
    await supabase.functions.invoke<ListLicenseChannelsCacheResponse>(
      'list-license-channels-cache',
      {
        body: {
          licenseId,
          page,
          pageSize,
          isActive: true,
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok) {
    throw new Error(data?.details ?? data?.error ?? 'LICENSE_CHANNEL_CACHE_FAILED');
  }

  return {
    channels: data.channels ?? [],
    totalPages: data.totalPages ?? 0,
  };
}

export async function listAuthorizedLicenseChannels({
  licenseId,
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
}: ListAuthorizedLicenseChannelsInput): Promise<IptvChannel[]> {
  const normalizedLicenseId = licenseId.trim();

  if (!normalizedLicenseId) {
    return [];
  }

  const firstPage = await fetchLicenseChannelsPage({
    licenseId: normalizedLicenseId,
    page: 1,
    pageSize,
  });

  const channelRows = [...firstPage.channels];
  const totalPages = Math.min(firstPage.totalPages || 1, maxPages);

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await fetchLicenseChannelsPage({
      licenseId: normalizedLicenseId,
      page,
      pageSize,
    });

    channelRows.push(...nextPage.channels);
  }

  return channelRows
    .filter((channel) => channel.is_active && channel.stream_url.trim())
    .sort(sortLicenseChannels)
    .map(mapLicenseChannelToIptvChannel);
}
