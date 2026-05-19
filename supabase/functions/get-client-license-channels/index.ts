import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type GetClientLicenseChannelsRequest = {
  licenseCode?: string;
  deviceIdentifier?: string;
  page?: number;
  pageSize?: number;
  requireTmdbMatched?: boolean;
  requireTmdbPoster?: boolean;
};

type LicenseRecord = {
  id: string;
  license_code: string;
  status: string;
  expires_at: string | null;
};

type LicenseDeviceRecord = {
  id: string;
  device_identifier: string;
  is_active: boolean;
};

type LicenseChannelCacheRecord = {
  id: string;
  name: string;
  stream_url: string;
  logo_url: string | null;
  group_title: string | null;
  tvg_id: string | null;
  sort_order: number | null;
  is_active: boolean;

  content_kind?: string | null;

  tmdb_id?: number | null;
  tmdb_media_type?: string | null;
  tmdb_match_status?: string | null;
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

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeLicenseCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase();

  return normalized ? normalized : null;
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;

  return new Date(expiresAt).getTime() < Date.now();
}

function resolvePage(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_PAGE;
  }

  return Math.floor(value);
}

function resolvePageSize(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.floor(value), MAX_PAGE_SIZE);
}

function serializeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;

    return JSON.stringify({
      code: record.code,
      message: record.message,
      details: record.details,
      hint: record.hint,
      name: record.name,
    });
  }

  return String(error);
}

function serializeChannel(channel: LicenseChannelCacheRecord) {
  return {
    id: channel.id,
    name: channel.name,
    stream_url: channel.stream_url,
    logo_url: channel.logo_url,
    group_title: channel.group_title,
    tvg_id: channel.tvg_id,
    sort_order: channel.sort_order ?? 0,
    is_active: channel.is_active,

    content_kind: channel.content_kind ?? null,

    tmdb_id: channel.tmdb_id ?? null,
    tmdb_media_type: channel.tmdb_media_type ?? null,
    tmdb_match_status: channel.tmdb_match_status ?? null,
    tmdb_match_score: channel.tmdb_match_score ?? null,

    tmdb_title: channel.tmdb_title ?? null,
    tmdb_original_title: channel.tmdb_original_title ?? null,
    tmdb_overview: channel.tmdb_overview ?? null,

    tmdb_poster_path: channel.tmdb_poster_path ?? null,
    tmdb_backdrop_path: channel.tmdb_backdrop_path ?? null,

    tmdb_release_year: channel.tmdb_release_year ?? null,
    tmdb_rating: channel.tmdb_rating ?? null,
    tmdb_genres: channel.tmdb_genres ?? null,
    tmdb_last_enriched_at: channel.tmdb_last_enriched_at ?? null,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR' }, 500);
    }

    let payload: GetClientLicenseChannelsRequest;

    try {
      payload = (await request.json()) as GetClientLicenseChannelsRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const licenseCode = normalizeLicenseCode(payload.licenseCode);
    const deviceIdentifier = normalizeText(payload.deviceIdentifier);
    const page = resolvePage(payload.page);
    const pageSize = resolvePageSize(payload.pageSize);
    const requireTmdbMatched = payload.requireTmdbMatched === true;
    const requireTmdbPoster = payload.requireTmdbPoster === true;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    if (!licenseCode || !deviceIdentifier) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, status, expires_at')
      .eq('license_code', licenseCode)
      .maybeSingle();

    if (licenseError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: licenseError.message }, 500);
    }

    if (!license) {
      return jsonResponse({ ok: false, error: 'LICENSE_NOT_FOUND' }, 404);
    }

    const licenseRecord = license as LicenseRecord;

    if (licenseRecord.status === 'blocked') {
      return jsonResponse({ ok: false, error: 'LICENSE_BLOCKED' }, 403);
    }

    if (licenseRecord.status !== 'active') {
      return jsonResponse({ ok: false, error: 'LICENSE_INACTIVE' }, 403);
    }

    if (isExpired(licenseRecord.expires_at)) {
      return jsonResponse({ ok: false, error: 'LICENSE_EXPIRED' }, 403);
    }

    const { data: device, error: deviceError } = await supabaseAdmin
      .from('license_devices')
      .select('id, device_identifier, is_active')
      .eq('license_id', licenseRecord.id)
      .eq('device_identifier', deviceIdentifier)
      .maybeSingle();

    if (deviceError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: deviceError.message }, 500);
    }

    if (!device) {
      return jsonResponse({ ok: false, error: 'DEVICE_NOT_ACTIVATED' }, 403);
    }

    const deviceRecord = device as LicenseDeviceRecord;

    if (!deviceRecord.is_active) {
      return jsonResponse({ ok: false, error: 'DEVICE_INACTIVE' }, 403);
    }

    let channelsQuery = supabaseAdmin
      .from('license_channels_cache')
      .select(
        'id, name, stream_url, logo_url, group_title, tvg_id, sort_order, is_active, content_kind, tmdb_id, tmdb_media_type, tmdb_match_status, tmdb_match_score, tmdb_title, tmdb_original_title, tmdb_overview, tmdb_poster_path, tmdb_backdrop_path, tmdb_release_year, tmdb_rating, tmdb_genres, tmdb_last_enriched_at',
        {
          count: 'exact',
        },
      )
      .eq('license_id', licenseRecord.id)
      .eq('is_active', true);

    if (requireTmdbMatched) {
      channelsQuery = channelsQuery
        .eq('tmdb_match_status', 'matched')
        .not('tmdb_title', 'is', null);
    }

    if (requireTmdbPoster) {
      channelsQuery = channelsQuery.not('tmdb_poster_path', 'is', null);
    }

    const { data: channels, error: channelsError, count } = await channelsQuery
      .order('group_title', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (channelsError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: channelsError.message }, 500);
    }

    await supabaseAdmin
      .from('license_devices')
      .update({
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', deviceRecord.id);

    const channelRows = (channels ?? []) as LicenseChannelCacheRecord[];

    return jsonResponse({
      ok: true,
      channels: channelRows.map(serializeChannel),
      totalCount: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: 'GET_CLIENT_LICENSE_CHANNELS_FAILED',
        details: serializeErrorDetails(error),
      },
      500,
    );
  }
});
