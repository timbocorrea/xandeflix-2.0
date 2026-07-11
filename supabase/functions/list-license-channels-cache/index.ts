import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';

type ListLicenseChannelsCacheRequest = {
  page?: number;
  pageSize?: number;
  search?: string;
  groupTitle?: string | null;
  licenseId?: string | null;
  sourceId?: string | null;
  isActive?: boolean | null;
};

type LicenseChannelCacheRecord = {
  id: string;
  license_id: string;
  license_iptv_source_id: string;
  name: string;
  stream_url: string;
  logo_url: string | null;
  group_title: string | null;
  tvg_id: string | null;
  sort_order: number;
  is_active: boolean;
  last_imported_at: string;
  created_at: string;
  updated_at: string;
};

type LicenseRecord = {
  id: string;
  license_code: string;
  label: string | null;
  admin_owner_id: string | null;
};

type LicenseIptvSourceRecord = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

type ListLicenseChannelsCacheItem = LicenseChannelCacheRecord & {
  license: Pick<LicenseRecord, 'id' | 'license_code' | 'label'> | null;
  source: LicenseIptvSourceRecord | null;
};

type ListLicenseChannelsCacheSummary = {
  totalAccessible: number;
  totalFiltered: number;
  sourceCount: number;
  activeCount: number;
  inactiveCount: number;
};

type SupabaseClient = ReturnType<typeof createClient>;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SOURCE_COUNT_PAGE_SIZE = 1000;

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

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const [scheme, token] = authorization.trim().split(/\s+/);

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeBooleanFilter(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function normalizeSearchPattern(value: string) {
  return value.replace(/[%,_()]/g, ' ').replace(/\s+/g, ' ').trim();
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

function buildAccessibleLicenseQuery({
  supabaseAdmin,
  actorId,
  actorRole,
}: {
  supabaseAdmin: SupabaseClient;
  actorId: string;
  actorRole: AdminRole;
}) {
  let query = supabaseAdmin
    .from('licenses')
    .select('id, license_code, label, admin_owner_id');

  if (actorRole !== 'super_admin') {
    query = query.eq('admin_owner_id', actorId);
  }

  return query;
}

function getQueryUrl(query: unknown) {
  const url = (query as { url?: URL }).url;

  if (!url) {
    throw new Error('SUMMARY_QUERY_UNAVAILABLE');
  }

  return new URL(url.toString());
}

function getServiceRoleHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

function parseExactCount(response: Response) {
  const contentRange = response.headers.get('content-range') ?? '';
  const totalText = contentRange.split('/').pop() ?? '';
  const total = Number(totalText);

  if (!Number.isFinite(total)) {
    throw new Error('SUMMARY_COUNT_UNAVAILABLE');
  }

  return total;
}

async function fetchExactCountFromUrl({
  url,
  serviceRoleKey,
}: {
  url: URL;
  serviceRoleKey: string;
}) {
  const countUrl = new URL(url.toString());
  countUrl.searchParams.set('select', 'id');

  const response = await fetch(countUrl, {
    method: 'HEAD',
    headers: {
      ...getServiceRoleHeaders(serviceRoleKey),
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });

  if (!response.ok) {
    throw new Error('SUMMARY_COUNT_FAILED');
  }

  return parseExactCount(response);
}

async function countDistinctSourcesFromUrl({
  url,
  serviceRoleKey,
}: {
  url: URL;
  serviceRoleKey: string;
}) {
  const sourceIds = new Set<string>();

  for (let from = 0; ; from += SOURCE_COUNT_PAGE_SIZE) {
    const pageUrl = new URL(url.toString());
    pageUrl.searchParams.set('select', 'license_iptv_source_id');

    const response = await fetch(pageUrl, {
      headers: {
        ...getServiceRoleHeaders(serviceRoleKey),
        Range: `${from}-${from + SOURCE_COUNT_PAGE_SIZE - 1}`,
      },
    });

    if (!response.ok) {
      throw new Error('SUMMARY_SOURCE_COUNT_FAILED');
    }

    const rows = (await response.json()) as Array<{
      license_iptv_source_id?: string | null;
    }>;

    for (const row of rows) {
      if (row.license_iptv_source_id) {
        sourceIds.add(row.license_iptv_source_id);
      }
    }

    if (rows.length < SOURCE_COUNT_PAGE_SIZE) {
      break;
    }
  }

  return sourceIds.size;
}

function withActiveFilter(url: URL, isActive: boolean) {
  const nextUrl = new URL(url.toString());
  nextUrl.searchParams.set('is_active', `eq.${isActive}`);

  return nextUrl;
}


async function listAllChannelGroups({
  supabaseAdmin,
  licenseIds,
}: {
  supabaseAdmin: SupabaseClient;
  licenseIds: string[];
}) {
  const groups = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;

    const { data, error } = await supabaseAdmin
      .from('license_channels_cache')
      .select('group_title')
      .in('license_id', licenseIds)
      .not('group_title', 'is', null)
      .order('group_title', { ascending: true })
      .range(from, to);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as { group_title: string | null }[];

    for (const row of rows) {
      if (row.group_title) {
        groups.add(row.group_title);
      }
    }

    if (rows.length < pageSize) {
      break;
    }
  }

  return Array.from(groups).sort((firstGroup, secondGroup) =>
    firstGroup.localeCompare(secondGroup, 'pt-BR', { sensitivity: 'base' }),
  );
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ ok: false, error: 'MISSING_ENV' }, 500);
    }

    const token = getBearerToken(request);

    if (!token) {
      return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }

    const { data: actorProfile, error: profileError } = await supabaseAdmin
      .from('admin_profiles')
      .select('id, role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (
      !actorProfile ||
      actorProfile.is_active !== true ||
      (actorProfile.role !== 'admin' && actorProfile.role !== 'super_admin')
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    const body = (await request.json().catch(() => ({}))) as ListLicenseChannelsCacheRequest;
    const page = resolvePage(body.page);
    const pageSize = resolvePageSize(body.pageSize);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const search = normalizeText(body.search);
    const searchPattern = search ? normalizeSearchPattern(search) : null;
    const groupTitle = normalizeText(body.groupTitle);
    const licenseId = normalizeText(body.licenseId);
    const sourceId = normalizeText(body.sourceId);
    const isActive = normalizeBooleanFilter(body.isActive);

    const { data: licenses, error: licensesError } = await buildAccessibleLicenseQuery({
      supabaseAdmin,
      actorId: actorProfile.id,
      actorRole: actorProfile.role as AdminRole,
    });

    if (licensesError) {
      throw licensesError;
    }

    const licenseRows = (licenses ?? []) as LicenseRecord[];
    const accessibleLicenseIds = licenseRows.map((license) => license.id);

    if (accessibleLicenseIds.length === 0) {
      const summary: ListLicenseChannelsCacheSummary = {
        totalAccessible: 0,
        totalFiltered: 0,
        sourceCount: 0,
        activeCount: 0,
        inactiveCount: 0,
      };

      return jsonResponse({
        ok: true,
        channels: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
        groups: [],
        summary,
      });
    }

    if (licenseId && !accessibleLicenseIds.includes(licenseId)) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    let query = supabaseAdmin
      .from('license_channels_cache')
      .select('*', { count: 'exact' })
      .in('license_id', licenseId ? [licenseId] : accessibleLicenseIds);
    const totalAccessibleUrl = getQueryUrl(query);

    if (sourceId) {
      query = query.eq('license_iptv_source_id', sourceId);
    }

    if (groupTitle) {
      query = query.eq('group_title', groupTitle);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive);
    }

    if (searchPattern) {
      query = query.or(
        `name.ilike.%${searchPattern}%,tvg_id.ilike.%${searchPattern}%,stream_url.ilike.%${searchPattern}%`,
      );
    }
    const filteredSummaryUrl = getQueryUrl(query);

    const { data: channels, error: channelsError, count } = await query
      .order('group_title', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (channelsError) {
      throw channelsError;
    }

    const [
      totalAccessible,
      sourceCount,
      activeCount,
      inactiveCount,
    ] = await Promise.all([
      fetchExactCountFromUrl({
        url: totalAccessibleUrl,
        serviceRoleKey: supabaseServiceRoleKey,
      }),
      countDistinctSourcesFromUrl({
        url: filteredSummaryUrl,
        serviceRoleKey: supabaseServiceRoleKey,
      }),
      fetchExactCountFromUrl({
        url: withActiveFilter(filteredSummaryUrl, true),
        serviceRoleKey: supabaseServiceRoleKey,
      }),
      fetchExactCountFromUrl({
        url: withActiveFilter(filteredSummaryUrl, false),
        serviceRoleKey: supabaseServiceRoleKey,
      }),
    ]);

    const totalFiltered = count ?? 0;
    const summary: ListLicenseChannelsCacheSummary = {
      totalAccessible,
      totalFiltered,
      sourceCount,
      activeCount,
      inactiveCount,
    };

    const channelRows = (channels ?? []) as LicenseChannelCacheRecord[];
    const sourceIds = Array.from(
      new Set(channelRows.map((channel) => channel.license_iptv_source_id)),
    );

    const { data: sources, error: sourcesError } =
      sourceIds.length > 0
        ? await supabaseAdmin
            .from('license_iptv_sources')
            .select('id, name, type, is_active')
            .in('id', sourceIds)
        : { data: [], error: null };

    if (sourcesError) {
      throw sourcesError;
    }

    const licensesById = new Map(
      licenseRows.map((license) => [
        license.id,
        {
          id: license.id,
          license_code: license.license_code,
          label: license.label,
        },
      ]),
    );

    const sourcesById = new Map(
      ((sources ?? []) as LicenseIptvSourceRecord[]).map((source) => [
        source.id,
        source,
      ]),
    );

    const items: ListLicenseChannelsCacheItem[] = channelRows.map((channel) => ({
      ...channel,
      license: licensesById.get(channel.license_id) ?? null,
      source: sourcesById.get(channel.license_iptv_source_id) ?? null,
    }));

    const groups = await listAllChannelGroups({
      supabaseAdmin,
      licenseIds: licenseId ? [licenseId] : accessibleLicenseIds,
    });

    return jsonResponse({
      ok: true,
      channels: items,
      totalCount: totalFiltered,
      page,
      pageSize,
      totalPages: Math.ceil(totalFiltered / pageSize),
      groups,
      summary,
    });
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: 'LIST_LICENSE_CHANNELS_CACHE_FAILED',
      },
      500,
    );
  }
});
