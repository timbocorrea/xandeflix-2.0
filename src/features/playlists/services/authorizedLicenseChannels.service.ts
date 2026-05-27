import { supabase } from '@/lib/supabase/supabaseClient';

import type { IptvChannel } from '../types/playlist';

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 10;

type LicenseChannelContentKind = 'live' | 'movie' | 'series' | 'unknown';
type LicenseChannelTmdbMediaType = 'movie' | 'tv';
type LicenseChannelTmdbMatchStatus =
  | 'pending'
  | 'matched'
  | 'not_found'
  | 'ambiguous'
  | 'skipped'
  | 'error';

type LicenseChannelCacheItem = {
  id: string;
  name: string;
  stream_url: string;
  logo_url: string | null;
  group_title: string | null;
  tvg_id: string | null;
  sort_order?: number | null;
  is_active: boolean;
  content_kind?: LicenseChannelContentKind | null;
  tmdb_id?: number | null;
  tmdb_media_type?: LicenseChannelTmdbMediaType | null;
  tmdb_match_status?: LicenseChannelTmdbMatchStatus | null;
  tmdb_match_score?: number | null;
  tmdb_title?: string | null;
  tmdb_original_title?: string | null;
  tmdb_overview?: string | null;
  tmdb_poster_path?: string | null;
  tmdb_backdrop_path?: string | null;
  tmdb_release_year?: number | null;
  tmdb_rating?: number | null;
  tmdb_genres?: string[] | null;
  tmdb_last_enriched_at?: string | null;
};

type GetClientLicenseChannelsResponse = {
  ok?: boolean;
  channels?: LicenseChannelCacheItem[];
  totalPages?: number;
  error?: string;
  details?: string;
};

export type ListAuthorizedLicenseChannelsInput = {
  licenseCode: string;
  deviceIdentifier: string;
  pageSize?: number;
  maxPages?: number;
  requireTmdbMatched?: boolean;
  requireTmdbPoster?: boolean;
  contentKind?: 'live' | 'movie' | 'series';
  contentKinds?: Array<'live' | 'movie' | 'series'>;
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
    contentKind: channel.content_kind ?? null,
    tmdbId: channel.tmdb_id ?? null,
    tmdbMediaType: channel.tmdb_media_type ?? null,
    tmdbMatchStatus: channel.tmdb_match_status ?? null,
    tmdbMatchScore: channel.tmdb_match_score ?? null,
    tmdbTitle: channel.tmdb_title ?? null,
    tmdbOriginalTitle: channel.tmdb_original_title ?? null,
    tmdbOverview: channel.tmdb_overview ?? null,
    tmdbPosterPath: channel.tmdb_poster_path ?? null,
    tmdbBackdropPath: channel.tmdb_backdrop_path ?? null,
    tmdbReleaseYear: channel.tmdb_release_year ?? null,
    tmdbRating: channel.tmdb_rating ?? null,
    tmdbGenres: channel.tmdb_genres ?? null,
    tmdbLastEnrichedAt: channel.tmdb_last_enriched_at ?? null,
  };
}

async function fetchLicenseChannelsPage({
  licenseCode,
  deviceIdentifier,
  page,
  pageSize,
  requireTmdbMatched,
  requireTmdbPoster,
  contentKind,
  contentKinds,
}: {
  licenseCode: string;
  deviceIdentifier: string;
  page: number;
  pageSize: number;
  requireTmdbMatched?: boolean;
  requireTmdbPoster?: boolean;
  contentKind?: 'live' | 'movie' | 'series';
  contentKinds?: Array<'live' | 'movie' | 'series'>;
}) {
  const { data, error } =
    await supabase.functions.invoke<GetClientLicenseChannelsResponse>(
      'get-client-license-channels',
      {
        body: {
          licenseCode,
          deviceIdentifier,
          page,
          pageSize,
          ...(requireTmdbMatched === undefined ? {} : { requireTmdbMatched }),
          ...(requireTmdbPoster === undefined ? {} : { requireTmdbPoster }),
          ...(contentKind === undefined ? {} : { contentKind }),
          ...(contentKinds === undefined ? {} : { contentKinds }),
        },
      },
    );

  if (error) {
    throw error;
  }

  if (!data?.ok) {
    throw new Error(
      data?.details ?? data?.error ?? 'CLIENT_LICENSE_CHANNELS_FAILED',
    );
  }

  return {
    channels: data.channels ?? [],
    totalPages: data.totalPages ?? 0,
  };
}

export async function listAuthorizedLicenseChannels({
  licenseCode,
  deviceIdentifier,
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
  requireTmdbMatched,
  requireTmdbPoster,
  contentKind,
  contentKinds,
}: ListAuthorizedLicenseChannelsInput): Promise<IptvChannel[]> {
  const normalizedLicenseCode = licenseCode.trim().toUpperCase();
  const normalizedDeviceIdentifier = deviceIdentifier.trim();

  if (!normalizedLicenseCode || !normalizedDeviceIdentifier) {
    return [];
  }

  const firstPage = await fetchLicenseChannelsPage({
    licenseCode: normalizedLicenseCode,
    deviceIdentifier: normalizedDeviceIdentifier,
    page: 1,
    pageSize,
    requireTmdbMatched,
    requireTmdbPoster,
    contentKind,
    contentKinds,
  });

  const channelRows = [...firstPage.channels];
  const totalPages = Math.min(firstPage.totalPages || 1, maxPages);

  if (totalPages > 1) {
    const pagePromises = [];
    for (let page = 2; page <= totalPages; page += 1) {
      pagePromises.push(
        fetchLicenseChannelsPage({
          licenseCode: normalizedLicenseCode,
          deviceIdentifier: normalizedDeviceIdentifier,
          page,
          pageSize,
          requireTmdbMatched,
          requireTmdbPoster,
          contentKind,
          contentKinds,
        })
      );
    }
    const restPages = await Promise.all(pagePromises);
    for (const nextPage of restPages) {
      channelRows.push(...nextPage.channels);
    }
  }

  return channelRows
    .filter((channel) => channel.is_active && channel.stream_url.trim())
    .sort(sortLicenseChannels)
    .map(mapLicenseChannelToIptvChannel);
}
