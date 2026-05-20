import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';
type ContentKind = 'movie' | 'series';
type TmdbMediaType = 'movie' | 'tv';
type TmdbMatchStatus =
  | 'matched'
  | 'not_found'
  | 'ambiguous'
  | 'skipped'
  | 'error';

type EnrichLicenseChannelsTmdbRequest = {
  mode?: 'vod-warmup';
  licenseId?: string;
  licenseCode?: string;
  deviceIdentifier?: string;
  limit?: number;
  concurrency?: number;
  maxPerGroup?: number;
  strategy?: 'priority' | 'round-robin';
  force?: boolean;
  groupTitle?: string;
  groupTitles?: string[];
  priorityGroups?: string[];
};

type LicenseRecord = {
  id: string;
  license_code: string;
  admin_owner_id: string | null;
  status?: string | null;
  expires_at?: string | null;
};

type LicenseDeviceRecord = {
  id: string;
  device_identifier: string;
  is_active: boolean;
};

type ChannelRecord = {
  id: string;
  license_id: string;
  name: string;
  group_title: string | null;
  tvg_id: string | null;
  content_kind: ContentKind | null;
  tmdb_match_status: string | null;
};

type TmdbSearchResult = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
};

type TmdbSearchResponse = {
  results?: TmdbSearchResult[];
};

type EnrichmentResult = {
  channelId: string;
  name: string;
  status: TmdbMatchStatus;
  tmdbId?: number;
  mediaType?: TmdbMediaType;
  reason?: string;
};

type EnrichmentSummary = {
  processed: number;
  matched: number;
  notFound: number;
  skipped: number;
  errors: number;
};

type SupabaseClient = ReturnType<typeof createClient>;
type WarmupStrategy = 'priority' | 'round-robin';
type WarmupCountByGroup = Record<string, number>;
type WarmupChannel = ChannelRecord & {
  selectedGroupTitle?: string | null;
};
type WarmupGroupCandidates = {
  groupTitle: string;
  channels: WarmupChannel[];
};

const DEFAULT_LIMIT = 50;
const DEFAULT_WARMUP_LIMIT = 300;
const MAX_LIMIT = 300;
const DEFAULT_WARMUP_CONCURRENCY = 4;
const MAX_WARMUP_CONCURRENCY = 6;
const DEFAULT_WARMUP_MAX_PER_GROUP = 60;
const WARMUP_TIME_BUDGET_MS = 22_000;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_GENRES_BY_ID = new Map<number, string>();
const PENDING_TMDB_STATUS_FILTER =
  'tmdb_match_status.is.null,tmdb_match_status.eq.pending,tmdb_match_status.eq.error';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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

function normalizeLicenseCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase();

  return normalized ? normalized : null;
}

function normalizeTextList(value?: string[] | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeText(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false;

  return new Date(expiresAt).getTime() < Date.now();
}

const LINEAR_CHANNEL_NAME_PATTERN =
  /^(a&e|amc|animal planet|arte 1|axn|band|bis|canal brasil|canal sony|cartoon|cinemax|cnn|combate|discovery|disney|espn|fox|fx|gloob|globo|hbo|max|megapix|mtv|multishow|nat geo|nick|paramount|premiere|record|sony|space|sportv|star|syfy|telecine|tnt|tooncast|universal|warner)(\s|$)/i;

const LINEAR_QUALITY_SUFFIX_PATTERN =
  /\b(sd|hd|fhd|uhd|4k|h265|hevc)\b/i;

function isLikelyLinearChannel(channel: Pick<ChannelRecord, 'name' | 'group_title'>) {
  const normalizedName = channel.name.trim().toLowerCase();
  const normalizedGroup = (channel.group_title ?? '').trim().toLowerCase();

  if (!normalizedName) {
    return false;
  }

  if (LINEAR_CHANNEL_NAME_PATTERN.test(normalizedName)) {
    return true;
  }

  if (
    normalizedGroup.includes('canais') &&
    LINEAR_QUALITY_SUFFIX_PATTERN.test(normalizedName)
  ) {
    return true;
  }

  return false;
}

function normalizeSearchTitle(value: string) {
  return value
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\([^\)]*\b(19|20)\d{2}\b[^\)]*\)/g, ' ')
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, ' ')
    .replace(/\b\d{1,2}x\d{1,3}\b/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(
      /\b(dual audio|dublado|legendado|hd|fhd|uhd|4k|1080p|720p|bluray|web-dl|webrip)\b/gi,
      ' ',
    )
    .replace(/[_|.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveLimit(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(value), MAX_LIMIT);
}

function resolveWarmupLimit(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_WARMUP_LIMIT;
  }

  return Math.min(Math.floor(value), MAX_LIMIT);
}

function resolveWarmupConcurrency(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_WARMUP_CONCURRENCY;
  }

  return Math.min(Math.floor(value), MAX_WARMUP_CONCURRENCY);
}

function resolveWarmupMaxPerGroup(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_WARMUP_MAX_PER_GROUP;
  }

  return Math.min(Math.floor(value), MAX_LIMIT);
}

function resolveWarmupStrategy(value: unknown): WarmupStrategy {
  return value === 'priority' ? 'priority' : 'round-robin';
}

function createEmptySummary(): EnrichmentSummary {
  return {
    processed: 0,
    matched: 0,
    notFound: 0,
    skipped: 0,
    errors: 0,
  };
}

function addResultToSummary(
  summary: EnrichmentSummary,
  result: EnrichmentResult,
) {
  summary.processed += 1;

  if (result.status === 'matched') {
    summary.matched += 1;
    return;
  }

  if (result.status === 'not_found') {
    summary.notFound += 1;
    return;
  }

  if (result.status === 'skipped' || result.status === 'ambiguous') {
    summary.skipped += 1;
    return;
  }

  if (result.status === 'error') {
    summary.errors += 1;
  }
}

function addCountByGroup(counts: WarmupCountByGroup, groupTitle: string) {
  counts[groupTitle] = (counts[groupTitle] ?? 0) + 1;
}

function getWarmupGroupTitle(channel: WarmupChannel) {
  return channel.selectedGroupTitle ?? channel.group_title ?? 'Sem grupo';
}

function hasWarmupTimeBudgetExpired(startedAt: number) {
  return Date.now() - startedAt >= WARMUP_TIME_BUDGET_MS;
}

function canManageLicense({
  actorId,
  actorRole,
  ownerId,
}: {
  actorId: string;
  actorRole: AdminRole;
  ownerId: string | null;
}) {
  if (actorRole === 'super_admin') {
    return true;
  }

  return ownerId === actorId;
}

function clearTmdbMetadata(update: Record<string, unknown>) {
  return {
    ...update,
    tmdb_id: null,
    tmdb_match_score: null,
    tmdb_title: null,
    tmdb_original_title: null,
    tmdb_overview: null,
    tmdb_poster_path: null,
    tmdb_backdrop_path: null,
    tmdb_release_year: null,
    tmdb_rating: null,
    tmdb_genres: null,
  };
}

function resolveMediaType(contentKind: ContentKind | null): TmdbMediaType | null {
  if (contentKind === 'movie') return 'movie';
  if (contentKind === 'series') return 'tv';

  return null;
}

function resolveYear(result: TmdbSearchResult, mediaType: TmdbMediaType) {
  const dateValue =
    mediaType === 'movie' ? result.release_date : result.first_air_date;
  const year = dateValue ? Number(dateValue.slice(0, 4)) : NaN;

  return Number.isFinite(year) ? year : null;
}

function resolveTitle(result: TmdbSearchResult, mediaType: TmdbMediaType) {
  return mediaType === 'movie' ? result.title ?? null : result.name ?? null;
}

function resolveOriginalTitle(
  result: TmdbSearchResult,
  mediaType: TmdbMediaType,
) {
  return mediaType === 'movie'
    ? result.original_title ?? null
    : result.original_name ?? null;
}

function resolveMatchScore(result: TmdbSearchResult) {
  let score = 0;

  if (result.poster_path) score += 25;
  if (result.backdrop_path) score += 25;
  if (result.overview?.trim()) score += 20;
  if (result.vote_average && result.vote_average > 0) score += 10;
  if (result.release_date || result.first_air_date) score += 10;
  if ((result.genre_ids ?? []).length > 0) score += 10;

  return score;
}

function mapGenres(genreIds?: number[]) {
  return (genreIds ?? [])
    .map((genreId) => TMDB_GENRES_BY_ID.get(genreId))
    .filter((genre): genre is string => Boolean(genre));
}

async function tmdbFetch<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${TMDB_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB_HTTP_${response.status}`);
  }

  return (await response.json()) as T;
}

async function loadGenres(apiKey: string) {
  if (TMDB_GENRES_BY_ID.size > 0) {
    return;
  }

  const [movieGenres, tvGenres] = await Promise.all([
    tmdbFetch<{ genres?: { id: number; name: string }[] }>(
      '/genre/movie/list?language=pt-BR',
      apiKey,
    ),
    tmdbFetch<{ genres?: { id: number; name: string }[] }>(
      '/genre/tv/list?language=pt-BR',
      apiKey,
    ),
  ]);

  for (const genre of [
    ...(movieGenres.genres ?? []),
    ...(tvGenres.genres ?? []),
  ]) {
    TMDB_GENRES_BY_ID.set(genre.id, genre.name);
  }
}

async function searchTmdb({
  apiKey,
  query,
  mediaType,
}: {
  apiKey: string;
  query: string;
  mediaType: TmdbMediaType;
}) {
  const encodedQuery = encodeURIComponent(query);
  const response = await tmdbFetch<TmdbSearchResponse>(
    `/search/${mediaType}?query=${encodedQuery}&language=pt-BR&include_adult=false&page=1`,
    apiKey,
  );

  return response.results ?? [];
}

function pickBestResult(results: TmdbSearchResult[]) {
  if (results.length === 0) {
    return null;
  }

  return [...results].sort((current, next) => {
    return resolveMatchScore(next) - resolveMatchScore(current);
  })[0];
}

async function enrichChannel({
  channel,
  apiKey,
}: {
  channel: ChannelRecord;
  apiKey: string;
}): Promise<{
  result: EnrichmentResult;
  update: Record<string, unknown>;
}> {
  const mediaType = resolveMediaType(channel.content_kind);

  if (!mediaType) {
    return {
      result: {
        channelId: channel.id,
        name: channel.name,
        status: 'skipped',
        reason: 'UNSUPPORTED_CONTENT_KIND',
      },
      update: clearTmdbMetadata({
        tmdb_match_status: 'skipped',
        tmdb_last_enriched_at: new Date().toISOString(),
      }),
    };
  }

  if (isLikelyLinearChannel(channel)) {
    return {
      result: {
        channelId: channel.id,
        name: channel.name,
        status: 'skipped',
        mediaType,
        reason: 'LIKELY_LINEAR_CHANNEL',
      },
      update: clearTmdbMetadata({
        tmdb_media_type: mediaType,
        tmdb_match_status: 'skipped',
        tmdb_last_enriched_at: new Date().toISOString(),
      }),
    };
  }

  const query = normalizeSearchTitle(channel.name);

  if (!query) {
    return {
      result: {
        channelId: channel.id,
        name: channel.name,
        status: 'skipped',
        mediaType,
        reason: 'EMPTY_QUERY',
      },
      update: clearTmdbMetadata({
        tmdb_media_type: mediaType,
        tmdb_match_status: 'skipped',
        tmdb_last_enriched_at: new Date().toISOString(),
      }),
    };
  }

  try {
    const results = await searchTmdb({ apiKey, query, mediaType });
    const bestResult = pickBestResult(results);

    if (!bestResult) {
      return {
        result: {
          channelId: channel.id,
          name: channel.name,
          status: 'not_found',
          mediaType,
          reason: query,
        },
        update: clearTmdbMetadata({
          tmdb_media_type: mediaType,
          tmdb_match_status: 'not_found',
          tmdb_last_enriched_at: new Date().toISOString(),
        }),
      };
    }

    const score = resolveMatchScore(bestResult);
    const status: TmdbMatchStatus = score >= 60 ? 'matched' : 'ambiguous';

    return {
      result: {
        channelId: channel.id,
        name: channel.name,
        status,
        tmdbId: bestResult.id,
        mediaType,
      },
      update: {
        tmdb_id: bestResult.id,
        tmdb_media_type: mediaType,
        tmdb_match_status: status,
        tmdb_match_score: score,
        tmdb_title: resolveTitle(bestResult, mediaType),
        tmdb_original_title: resolveOriginalTitle(bestResult, mediaType),
        tmdb_overview: bestResult.overview ?? null,
        tmdb_poster_path: bestResult.poster_path ?? null,
        tmdb_backdrop_path: bestResult.backdrop_path ?? null,
        tmdb_release_year: resolveYear(bestResult, mediaType),
        tmdb_rating:
          typeof bestResult.vote_average === 'number'
            ? Number(bestResult.vote_average.toFixed(2))
            : null,
        tmdb_genres: mapGenres(bestResult.genre_ids),
        tmdb_last_enriched_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      result: {
        channelId: channel.id,
        name: channel.name,
        status: 'error',
        mediaType,
        reason: error instanceof Error ? error.message : String(error),
      },
      update: clearTmdbMetadata({
        tmdb_media_type: mediaType,
        tmdb_match_status: 'error',
        tmdb_last_enriched_at: new Date().toISOString(),
      }),
    };
  }
}

async function validateWarmupLicense({
  supabaseAdmin,
  licenseCode,
  deviceIdentifier,
}: {
  supabaseAdmin: SupabaseClient;
  licenseCode: string;
  deviceIdentifier: string;
}): Promise<
  | { ok: true; license: LicenseRecord; device: LicenseDeviceRecord }
  | { ok: false; response: Response }
> {
  const { data: license, error: licenseError } = await supabaseAdmin
    .from('licenses')
    .select('id, license_code, admin_owner_id, status, expires_at')
    .eq('license_code', licenseCode)
    .maybeSingle();

  if (licenseError) {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: 'SERVER_ERROR', details: licenseError.message },
        500,
      ),
    };
  }

  if (!license) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'LICENSE_NOT_FOUND' }, 404),
    };
  }

  const typedLicense = license as LicenseRecord;

  if (typedLicense.status === 'blocked') {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'LICENSE_BLOCKED' }, 403),
    };
  }

  if (typedLicense.status !== 'active') {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'LICENSE_INACTIVE' }, 403),
    };
  }

  if (isExpired(typedLicense.expires_at)) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'LICENSE_EXPIRED' }, 403),
    };
  }

  const { data: device, error: deviceError } = await supabaseAdmin
    .from('license_devices')
    .select('id, device_identifier, is_active')
    .eq('license_id', typedLicense.id)
    .eq('device_identifier', deviceIdentifier)
    .maybeSingle();

  if (deviceError) {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: 'SERVER_ERROR', details: deviceError.message },
        500,
      ),
    };
  }

  if (!device) {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: 'DEVICE_NOT_ACTIVATED' },
        403,
      ),
    };
  }

  const typedDevice = device as LicenseDeviceRecord;

  if (!typedDevice.is_active) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'DEVICE_INACTIVE' }, 403),
    };
  }

  await supabaseAdmin
    .from('license_devices')
    .update({
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', typedDevice.id);

  return {
    ok: true,
    license: typedLicense,
    device: typedDevice,
  };
}

async function fetchPendingVodChannels({
  supabaseAdmin,
  licenseId,
  groupTitle,
  limit,
  force = false,
  activeOnly = false,
}: {
  supabaseAdmin: SupabaseClient;
  licenseId: string;
  groupTitle?: string | null;
  limit: number;
  force?: boolean;
  activeOnly?: boolean;
}) {
  let query = supabaseAdmin
    .from('license_channels_cache')
    .select(
      'id, license_id, name, group_title, tvg_id, content_kind, tmdb_match_status',
    )
    .eq('license_id', licenseId)
    .in('content_kind', ['movie', 'series']);

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  if (groupTitle) {
    query = query.eq('group_title', groupTitle);
  }

  if (!force) {
    query = query.or(PENDING_TMDB_STATUS_FILTER);
  }

  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as ChannelRecord[];
}

function selectPriorityCandidateChannels({
  groupedCandidates,
  limit,
}: {
  groupedCandidates: WarmupGroupCandidates[];
  limit: number;
}) {
  const selectedChannels: WarmupChannel[] = [];
  const selectedChannelIds = new Set<string>();

  for (const group of groupedCandidates) {
    for (const channel of group.channels) {
      if (selectedChannels.length >= limit) {
        return selectedChannels;
      }

      if (selectedChannelIds.has(channel.id)) {
        continue;
      }

      selectedChannelIds.add(channel.id);
      selectedChannels.push(channel);
    }
  }

  return selectedChannels;
}

function selectRoundRobinCandidateChannels({
  groupedCandidates,
  limit,
}: {
  groupedCandidates: WarmupGroupCandidates[];
  limit: number;
}) {
  const selectedChannels: WarmupChannel[] = [];
  const selectedChannelIds = new Set<string>();
  const maxGroupLength = Math.max(
    0,
    ...groupedCandidates.map((group) => group.channels.length),
  );

  for (let index = 0; index < maxGroupLength; index += 1) {
    for (const group of groupedCandidates) {
      const channel = group.channels[index];

      if (!channel || selectedChannelIds.has(channel.id)) {
        continue;
      }

      selectedChannelIds.add(channel.id);
      selectedChannels.push(channel);

      if (selectedChannels.length >= limit) {
        return selectedChannels;
      }
    }
  }

  return selectedChannels;
}

function selectWarmupCandidateChannels({
  groupedCandidates,
  limit,
  strategy,
}: {
  groupedCandidates: WarmupGroupCandidates[];
  limit: number;
  strategy: WarmupStrategy;
}) {
  if (strategy === 'priority') {
    return selectPriorityCandidateChannels({ groupedCandidates, limit });
  }

  return selectRoundRobinCandidateChannels({ groupedCandidates, limit });
}

async function processSingleWarmupChannel({
  supabaseAdmin,
  tmdbApiKey,
  licenseId,
  channel,
}: {
  supabaseAdmin: SupabaseClient;
  tmdbApiKey: string;
  licenseId: string;
  channel: WarmupChannel;
}): Promise<EnrichmentResult> {
  try {
    const enrichment = await enrichChannel({
      channel,
      apiKey: tmdbApiKey,
    });

    const { error: updateError } = await supabaseAdmin
      .from('license_channels_cache')
      .update(enrichment.update)
      .eq('id', channel.id)
      .eq('license_id', licenseId);

    const result: EnrichmentResult = updateError
      ? {
          channelId: channel.id,
          name: channel.name,
          status: 'error',
          reason: updateError.message,
        }
      : enrichment.result;

    return result;
  } catch (error) {
    return {
      channelId: channel.id,
      name: channel.name,
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function processWarmupChannels({
  supabaseAdmin,
  tmdbApiKey,
  licenseId,
  channels,
  concurrency,
  summary,
  processedByGroup,
  matchedByGroup,
  startedAt,
}: {
  supabaseAdmin: SupabaseClient;
  tmdbApiKey: string;
  licenseId: string;
  channels: WarmupChannel[];
  concurrency: number;
  summary: EnrichmentSummary;
  processedByGroup: WarmupCountByGroup;
  matchedByGroup: WarmupCountByGroup;
  startedAt: number;
}) {
  let nextChannelIndex = 0;
  let stoppedByTimeBudget = false;
  const workerCount = Math.min(concurrency, channels.length);

  async function processNextChannel() {
    for (;;) {
      if (nextChannelIndex >= channels.length) {
        return;
      }

      if (hasWarmupTimeBudgetExpired(startedAt)) {
        stoppedByTimeBudget = true;
        return;
      }

      const channel = channels[nextChannelIndex];
      nextChannelIndex += 1;

      if (!channel) {
        return;
      }

      const result = await processSingleWarmupChannel({
        supabaseAdmin,
        tmdbApiKey,
        licenseId,
        channel,
      });
      const groupTitle = getWarmupGroupTitle(channel);

      addResultToSummary(summary, result);
      addCountByGroup(processedByGroup, groupTitle);

      if (result.status === 'matched') {
        addCountByGroup(matchedByGroup, groupTitle);
      }
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, () => processNextChannel()),
  );

  return { stoppedByTimeBudget };
}

async function countPendingVodChannels({
  supabaseAdmin,
  licenseId,
  groupTitles,
}: {
  supabaseAdmin: SupabaseClient;
  licenseId: string;
  groupTitles?: string[];
}) {
  let query = supabaseAdmin
    .from('license_channels_cache')
    .select('id', { count: 'exact', head: true })
    .eq('license_id', licenseId)
    .eq('is_active', true)
    .in('content_kind', ['movie', 'series'])
    .or(PENDING_TMDB_STATUS_FILTER);

  if (groupTitles?.length === 1) {
    query = query.eq('group_title', groupTitles[0]);
  } else if (groupTitles && groupTitles.length > 1) {
    query = query.in('group_title', groupTitles);
  }

  const { count, error } = await query;

  if (error) {
    return null;
  }

  return count ?? 0;
}

async function runVodWarmup({
  payload,
  supabaseAdmin,
  tmdbApiKey,
}: {
  payload: EnrichLicenseChannelsTmdbRequest;
  supabaseAdmin: SupabaseClient;
  tmdbApiKey: string;
}) {
  const licenseCode = normalizeLicenseCode(payload.licenseCode);
  const deviceIdentifier = normalizeText(payload.deviceIdentifier);

  if (!licenseCode || !deviceIdentifier) {
    return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
  }

  const validation = await validateWarmupLicense({
    supabaseAdmin,
    licenseCode,
    deviceIdentifier,
  });

  if (!validation.ok) {
    return validation.response;
  }

  await loadGenres(tmdbApiKey);

  const startedAt = Date.now();
  const limit = resolveWarmupLimit(payload.limit);
  const concurrency = resolveWarmupConcurrency(payload.concurrency);
  const maxPerGroup = resolveWarmupMaxPerGroup(payload.maxPerGroup);
  const groupTitle = normalizeText(payload.groupTitle);
  const groupTitles = groupTitle
    ? [groupTitle]
    : normalizeTextList(payload.groupTitles);
  const priorityGroups = groupTitles.length
    ? []
    : normalizeTextList(payload.priorityGroups);
  const orderedGroups = groupTitles.length ? groupTitles : priorityGroups;
  const strategy = resolveWarmupStrategy(
    payload.strategy ?? (priorityGroups.length ? 'round-robin' : 'priority'),
  );
  const groupedCandidates: WarmupGroupCandidates[] = [];
  const summary = createEmptySummary();
  const processedByGroup: WarmupCountByGroup = {};
  const matchedByGroup: WarmupCountByGroup = {};
  let stoppedByTimeBudget = false;

  for (const orderedGroup of orderedGroups) {
    if (hasWarmupTimeBudgetExpired(startedAt)) {
      stoppedByTimeBudget = true;
      break;
    }

    const groupLimit = priorityGroups.length > 0 ? maxPerGroup : limit;
    const channels = await fetchPendingVodChannels({
      supabaseAdmin,
      licenseId: validation.license.id,
      groupTitle: orderedGroup,
      limit: Math.min(groupLimit, limit),
      activeOnly: true,
    });

    if (channels.length > 0) {
      groupedCandidates.push({
        groupTitle: orderedGroup,
        channels: channels.map((channel) => ({
          ...channel,
          selectedGroupTitle: orderedGroup,
        })),
      });
    }
  }

  let selectedChannels =
    groupedCandidates.length > 0
      ? selectWarmupCandidateChannels({
          groupedCandidates,
          limit,
          strategy,
        })
      : [];

  if (orderedGroups.length === 0 && !stoppedByTimeBudget) {
    const channels = await fetchPendingVodChannels({
      supabaseAdmin,
      licenseId: validation.license.id,
      limit,
      activeOnly: true,
    });

    selectedChannels = channels.map((channel) => ({
      ...channel,
      selectedGroupTitle: channel.group_title,
    }));
  }

  if (selectedChannels.length > 0 && !stoppedByTimeBudget) {
    const result = await processWarmupChannels({
      supabaseAdmin,
      tmdbApiKey,
      licenseId: validation.license.id,
      channels: selectedChannels,
      concurrency,
      summary,
      processedByGroup,
      matchedByGroup,
      startedAt,
    });

    stoppedByTimeBudget = result.stoppedByTimeBudget;
  }

  const remainingGroupTitles = orderedGroups.length ? orderedGroups : undefined;
  const remainingEstimate = await countPendingVodChannels({
    supabaseAdmin,
    licenseId: validation.license.id,
    groupTitles: remainingGroupTitles,
  });
  const selectedGroups = Array.from(
    new Set(selectedChannels.map(getWarmupGroupTitle)),
  );
  const hasMore =
    stoppedByTimeBudget ||
    (remainingEstimate === null
      ? selectedChannels.length >= limit
      : remainingEstimate > 0);

  return jsonResponse({
    ok: true,
    mode: 'vod-warmup',
    licenseId: validation.license.id,
    licenseCode: validation.license.license_code,
    limit,
    concurrency,
    strategy,
    maxPerGroup,
    groupTitle: groupTitle ?? undefined,
    groupTitles: groupTitles.length ? groupTitles : undefined,
    priorityGroups: priorityGroups.length ? priorityGroups : undefined,
    selectedGroups,
    ...summary,
    processedByGroup,
    matchedByGroup,
    remainingEstimate,
    hasMore,
    stoppedByTimeBudget,
  });
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const tmdbApiKey = Deno.env.get('TMDB_API_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !tmdbApiKey) {
      return jsonResponse({ ok: false, error: 'MISSING_ENV' }, 500);
    }

    let payload: EnrichLicenseChannelsTmdbRequest;

    try {
      payload = (await request.json()) as EnrichLicenseChannelsTmdbRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    if (payload.mode === 'vod-warmup') {
      return await runVodWarmup({
        payload,
        supabaseAdmin,
        tmdbApiKey,
      });
    }

    const bearerToken = getBearerToken(request);

    if (!bearerToken) {
      return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }

    const supabaseAuthClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    });

    const {
      data: { user: actor },
      error: actorError,
    } = await supabaseAuthClient.auth.getUser();

    if (actorError || !actor) {
      return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }

    const { data: actorProfile, error: actorProfileError } =
      await supabaseAuthClient
        .from('admin_profiles')
        .select('id, role, is_active')
        .eq('id', actor.id)
        .eq('is_active', true)
        .maybeSingle();

    if (actorProfileError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: actorProfileError.message,
        },
        500,
      );
    }

    if (
      !actorProfile ||
      (actorProfile.role !== 'admin' && actorProfile.role !== 'super_admin')
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    const licenseId = normalizeText(payload.licenseId);
    const limit = resolveLimit(payload.limit);
    const force = payload.force === true;
    const groupTitle = normalizeText(payload.groupTitle);

    if (!licenseId) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, admin_owner_id')
      .eq('id', licenseId)
      .maybeSingle();

    if (licenseError) {
      return jsonResponse(
        { ok: false, error: 'SERVER_ERROR', details: licenseError.message },
        500,
      );
    }

    if (!license) {
      return jsonResponse({ ok: false, error: 'LICENSE_NOT_FOUND' }, 404);
    }

    const typedLicense = license as LicenseRecord;

    if (
      !canManageLicense({
        actorId: actor.id,
        actorRole: actorProfile.role as AdminRole,
        ownerId: typedLicense.admin_owner_id,
      })
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    await loadGenres(tmdbApiKey);

    let query = supabaseAdmin
      .from('license_channels_cache')
      .select(
        'id, license_id, name, group_title, tvg_id, content_kind, tmdb_match_status',
      )
      .eq('license_id', licenseId)
      .in('content_kind', ['movie', 'series']);

    if (groupTitle) {
      query = query.eq('group_title', groupTitle);
    }

    query = query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(limit);

    if (!force) {
      query = query.or(PENDING_TMDB_STATUS_FILTER);
    }

    const { data: channels, error: channelsError } = await query;

    if (channelsError) {
      return jsonResponse(
        { ok: false, error: 'SERVER_ERROR', details: channelsError.message },
        500,
      );
    }

    const channelRows = (channels ?? []) as ChannelRecord[];
    const results: EnrichmentResult[] = [];

    for (const channel of channelRows) {
      const enrichment = await enrichChannel({ channel, apiKey: tmdbApiKey });
      const { data: persistedChannel, error: updateError } = await supabaseAdmin
        .from('license_channels_cache')
        .update(enrichment.update)
        .eq('id', channel.id)
        .eq('license_id', licenseId)
        .select('id, tmdb_id, tmdb_match_status, tmdb_title, tmdb_poster_path')
        .maybeSingle();

      if (updateError) {
        results.push({
          channelId: channel.id,
          name: channel.name,
          status: 'error',
          reason: updateError.message,
        });
      } else {
        results.push({
          ...enrichment.result,
          persisted: Boolean(persistedChannel),
          persistedStatus: persistedChannel?.tmdb_match_status ?? null,
          persistedTmdbId: persistedChannel?.tmdb_id ?? null,
          persistedTitle: persistedChannel?.tmdb_title ?? null,
          persistedPosterPath: persistedChannel?.tmdb_poster_path ?? null,
        });
      }
    }

    return jsonResponse({
      ok: true,
      licenseId,
      limit,
      force,
      groupTitle,
      processed: results.length,
      results,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: 'ENRICH_LICENSE_CHANNELS_TMDB_FAILED',
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
