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
  licenseId?: string;
  limit?: number;
  force?: boolean;
  groupTitle?: string;
};

type LicenseRecord = {
  id: string;
  license_code: string;
  admin_owner_id: string | null;
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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_GENRES_BY_ID = new Map<number, string>();

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

    let payload: EnrichLicenseChannelsTmdbRequest;

    try {
      payload = (await request.json()) as EnrichLicenseChannelsTmdbRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const licenseId = normalizeText(payload.licenseId);
    const limit = resolveLimit(payload.limit);
    const force = payload.force === true;
    const groupTitle = normalizeText(payload.groupTitle);

    if (!licenseId) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

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
      query = query.or(
        'tmdb_match_status.is.null,tmdb_match_status.eq.pending,tmdb_match_status.eq.error',
      );
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
