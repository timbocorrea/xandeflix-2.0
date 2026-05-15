import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';
type LicenseIptvSourceType = 'm3u' | 'xtream' | 'manual';

type ImportLicenseIptvSourceChannelsRequest = {
  sourceId?: string;
  limit?: number;
};

type ParsedChannel = {
  name: string;
  stream_url: string;
  logo_url: string | null;
  group_title: string | null;
  tvg_id: string | null;
  sort_order: number;
};

type CachedChannel = {
  id: string;
  name: string;
  stream_url: string;
  logo_url: string | null;
  group_title: string | null;
  tvg_id: string | null;
  sort_order: number;
  is_active: boolean;
};

type ImportSampleChannel = {
  name: string;
  groupTitle: string | null;
};

type ImportResult = {
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
  sampleChannels: ImportSampleChannel[];
  message: string;
};

type LicenseRecord = {
  id: string;
  license_code: string;
  admin_owner_id: string | null;
};

type LicenseIptvSourceRecord = {
  id: string;
  license_id: string;
  name: string;
  source_url: string;
  type: LicenseIptvSourceType;
  is_active: boolean;
  created_by: string;
};

type SupabaseClient = ReturnType<typeof createClient>;

const FETCH_TIMEOUT_MS = 20000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_IMPORT_LIMIT = 1000;
const MAX_IMPORT_LIMIT = 5000;
const MAX_SAMPLES = 10;
const WRITE_BATCH_SIZE = 500;

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

function normalizeText(value?: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeNullableText(value?: string | null) {
  return normalizeText(value) ?? null;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const [scheme, token] = authorization.trim().split(/\s+/);

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
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
  return actorRole === 'super_admin' || ownerId === actorId;
}

function createImportResult({
  limit,
  message,
  fetched = false,
  parsed = false,
  totalParsed = 0,
  totalImported = 0,
  totalUpdated = 0,
  totalReactivated = 0,
  totalSkipped = 0,
  totalFailed = 0,
  totalDeactivatedMissing = 0,
  wasLimited = false,
  sampleChannels = [],
}: Partial<ImportResult> & { limit: number; message: string }): ImportResult {
  return {
    fetched,
    parsed,
    totalParsed,
    totalImported,
    totalUpdated,
    totalReactivated,
    totalSkipped,
    totalFailed,
    totalDeactivatedMissing,
    wasLimited,
    limit,
    sampleChannels,
    message,
  };
}

function resolveImportLimit(value: unknown) {
  if (value === undefined || value === null) {
    return {
      ok: true as const,
      limit: DEFAULT_IMPORT_LIMIT,
      wasClamped: false,
    };
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return {
      ok: false as const,
      limit: DEFAULT_IMPORT_LIMIT,
      wasClamped: false,
    };
  }

  const normalizedLimit = Math.floor(value);

  if (normalizedLimit > MAX_IMPORT_LIMIT) {
    return {
      ok: true as const,
      limit: MAX_IMPORT_LIMIT,
      wasClamped: true,
    };
  }

  return {
    ok: true as const,
    limit: Math.max(1, normalizedLimit),
    wasClamped: false,
  };
}

function parseAttributes(line: string) {
  const attributes: Record<string, string> = {};
  const doubleQuotedAttributeRegex = /([\w-]+)="([^"]*)"/g;
  const singleQuotedAttributeRegex = /([\w-]+)='([^']*)'/g;

  for (const match of line.matchAll(doubleQuotedAttributeRegex)) {
    const [, key, value] = match;

    if (key) {
      attributes[key] = value ?? '';
    }
  }

  for (const match of line.matchAll(singleQuotedAttributeRegex)) {
    const [, key, value] = match;

    if (key && attributes[key] === undefined) {
      attributes[key] = value ?? '';
    }
  }

  return attributes;
}

function parseChannelName(line: string) {
  const commaIndex = line.lastIndexOf(',');

  if (commaIndex === -1) {
    return null;
  }

  return normalizeNullableText(line.slice(commaIndex + 1));
}

function isPlayableUrl(line: string) {
  const normalizedLine = line.trim().toLowerCase();

  return (
    normalizedLine.startsWith('http://') ||
    normalizedLine.startsWith('https://') ||
    normalizedLine.startsWith('rtmp://') ||
    normalizedLine.startsWith('rtsp://') ||
    normalizedLine.startsWith('udp://')
  );
}

function sanitizeChannelName(value: string | null, fallbackIndex: number) {
  return normalizeText(value) ?? `Canal ${fallbackIndex}`;
}

function parseM3uChannels(
  content: string,
  limit: number,
): {
  channels: ParsedChannel[];
  totalParsed: number;
  totalSkipped: number;
  totalFailed: number;
  wasLimited: boolean;
  sampleChannels: ImportSampleChannel[];
  looksLikeM3u: boolean;
} {
  const channels: ParsedChannel[] = [];
  const sampleChannels: ImportSampleChannel[] = [];
  const seenStreamUrls = new Set<string>();

  let totalParsed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let extinfLines = 0;
  let firstNonEmptyLine = '';
  let pendingMetadata: {
    name: string | null;
    logoUrl: string | null;
    groupTitle: string | null;
    tvgId: string | null;
    tvgName: string | null;
  } | null = null;

  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (!firstNonEmptyLine) {
      firstNonEmptyLine = line;
    }

    if (line.startsWith('#EXTINF')) {
      extinfLines += 1;
      const attributes = parseAttributes(line);

      pendingMetadata = {
        name: parseChannelName(line),
        logoUrl: normalizeNullableText(attributes['tvg-logo']),
        groupTitle: normalizeNullableText(attributes['group-title']),
        tvgId: normalizeNullableText(attributes['tvg-id']),
        tvgName: normalizeNullableText(attributes['tvg-name']),
      };
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    if (!pendingMetadata) {
      continue;
    }

    if (!isPlayableUrl(line)) {
      totalFailed += 1;
      pendingMetadata = null;
      continue;
    }

    const streamUrl = normalizeText(line);

    if (!streamUrl) {
      totalFailed += 1;
      pendingMetadata = null;
      continue;
    }

    totalParsed += 1;

    if (seenStreamUrls.has(streamUrl)) {
      totalSkipped += 1;
      pendingMetadata = null;
      continue;
    }

    seenStreamUrls.add(streamUrl);

    const channelName = sanitizeChannelName(
      pendingMetadata.name ?? pendingMetadata.tvgName,
      totalParsed,
    );

    const channel: ParsedChannel = {
      name: channelName,
      stream_url: streamUrl,
      logo_url: pendingMetadata.logoUrl,
      group_title: pendingMetadata.groupTitle,
      tvg_id: pendingMetadata.tvgId,
      sort_order: channels.length,
    };

    channels.push(channel);

    if (sampleChannels.length < MAX_SAMPLES) {
      sampleChannels.push({
        name: channel.name,
        groupTitle: channel.group_title,
      });
    }

    pendingMetadata = null;

    if (channels.length >= limit) {
      return {
        channels,
        totalParsed,
        totalSkipped,
        totalFailed,
        wasLimited: true,
        sampleChannels,
        looksLikeM3u: firstNonEmptyLine.startsWith('#EXTM3U') || extinfLines > 0,
      };
    }
  }

  return {
    channels,
    totalParsed,
    totalSkipped,
    totalFailed,
    wasLimited: false,
    sampleChannels,
    looksLikeM3u: firstNonEmptyLine.startsWith('#EXTM3U') || extinfLines > 0,
  };
}

async function readResponseBody(response: Response) {
  if (!response.body) {
    const bodyText = await response.text();
    const encoded = new TextEncoder().encode(bodyText);

    return {
      bodyText: bodyText.slice(0, MAX_RESPONSE_BYTES),
      bytesRead: Math.min(encoded.byteLength, MAX_RESPONSE_BYTES),
      wasLimited: encoded.byteLength > MAX_RESPONSE_BYTES,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;
  let wasLimited = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done || !value) {
      break;
    }

    const remainingBytes = MAX_RESPONSE_BYTES - bytesRead;

    if (remainingBytes <= 0) {
      wasLimited = true;
      await reader.cancel();
      break;
    }

    if (value.byteLength > remainingBytes) {
      const slicedValue = value.slice(0, remainingBytes);
      chunks.push(decoder.decode(slicedValue, { stream: true }));
      bytesRead += slicedValue.byteLength;
      wasLimited = true;
      await reader.cancel();
      break;
    }

    chunks.push(decoder.decode(value, { stream: true }));
    bytesRead += value.byteLength;
  }

  chunks.push(decoder.decode());

  return {
    bodyText: chunks.join(''),
    bytesRead,
    wasLimited,
  };
}

async function fetchSourcePlaylist(sourceUrl: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return {
      ok: false as const,
      error: 'IPTV_SOURCE_FETCH_FAILED',
      details: 'Invalid source URL.',
    };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      ok: false as const,
      error: 'IPTV_SOURCE_FETCH_FAILED',
      details: 'Only HTTP and HTTPS sources are supported.',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      headers: {
        Accept:
          'application/vnd.apple.mpegurl, application/x-mpegurl, audio/x-mpegurl, text/plain, */*',
        'User-Agent': 'Xandeflix-Admin-IPTV-Import/1.0',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false as const,
        error: 'IPTV_SOURCE_FETCH_FAILED',
        details: `Source returned HTTP ${response.status}.`,
      };
    }

    const bodyResult = await readResponseBody(response);

    return {
      ok: true as const,
      ...bodyResult,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: 'IPTV_SOURCE_FETCH_FAILED',
      details:
        error instanceof Error && error.name === 'AbortError'
          ? 'Source fetch timed out.'
          : error instanceof Error
            ? error.message
            : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function hasCacheChanges(existing: CachedChannel, nextChannel: ParsedChannel) {
  return (
    existing.name !== nextChannel.name ||
    existing.logo_url !== nextChannel.logo_url ||
    existing.group_title !== nextChannel.group_title ||
    existing.tvg_id !== nextChannel.tvg_id ||
    existing.sort_order !== nextChannel.sort_order ||
    existing.is_active !== true
  );
}

function toCacheRow({
  channel,
  licenseId,
  sourceId,
  nowIso,
}: {
  channel: ParsedChannel;
  licenseId: string;
  sourceId: string;
  nowIso: string;
}) {
  return {
    license_id: licenseId,
    license_iptv_source_id: sourceId,
    name: channel.name,
    stream_url: channel.stream_url,
    logo_url: channel.logo_url,
    group_title: channel.group_title,
    tvg_id: channel.tvg_id,
    sort_order: channel.sort_order,
    is_active: true,
    last_imported_at: nowIso,
    updated_at: nowIso,
  };
}

function chunkRows<T>(rows: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }

  return chunks;
}

async function writeRowsInChunks({
  supabaseAdmin,
  rows,
  mode,
}: {
  supabaseAdmin: SupabaseClient;
  rows: Record<string, unknown>[];
  mode: 'insert' | 'upsert';
}) {
  for (const chunk of chunkRows(rows, WRITE_BATCH_SIZE)) {
    const query =
      mode === 'insert'
        ? supabaseAdmin.from('license_channels_cache').insert(chunk)
        : supabaseAdmin
          .from('license_channels_cache')
          .upsert(chunk, {
            onConflict: 'license_iptv_source_id,stream_url',
          });

    const { error } = await query;

    if (error) {
      throw error;
    }
  }
}

async function insertImportAudit({
  supabaseAdmin,
  actorId,
  license,
  source,
  result,
  success,
  error,
}: {
  supabaseAdmin: SupabaseClient;
  actorId: string;
  license: LicenseRecord;
  source: LicenseIptvSourceRecord;
  result: ImportResult;
  success: boolean;
  error?: string;
}) {
  await supabaseAdmin.from('audit_logs').insert({
    actor_id: actorId,
    action: 'license_iptv_source_channels_imported',
    entity: 'license_iptv_sources',
    entity_id: source.id,
    metadata: {
      licenseId: license.id,
      licenseCode: license.license_code,
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      success,
      error: error ?? null,
      totalParsed: result.totalParsed,
      totalImported: result.totalImported,
      totalUpdated: result.totalUpdated,
      totalReactivated: result.totalReactivated,
      totalSkipped: result.totalSkipped,
      totalFailed: result.totalFailed,
      totalDeactivatedMissing: result.totalDeactivatedMissing,
      wasLimited: result.wasLimited,
      limit: result.limit,
      sampleChannels: result.sampleChannels,
      action: 'import_channels',
    },
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

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR' }, 500);
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
        .select('id, email, role, is_active')
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

    let payload: ImportLicenseIptvSourceChannelsRequest;

    try {
      payload = (await request.json()) as ImportLicenseIptvSourceChannelsRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const sourceId = normalizeText(payload.sourceId);
    const limitResult = resolveImportLimit(payload.limit);

    if (!sourceId || !limitResult.ok) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const importLimit = limitResult.limit;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: source, error: sourceError } = await supabaseAdmin
      .from('license_iptv_sources')
      .select('id, license_id, name, source_url, type, is_active, created_by')
      .eq('id', sourceId)
      .maybeSingle();

    if (sourceError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: sourceError.message,
        },
        500,
      );
    }

    if (!source) {
      return jsonResponse(
        { ok: false, error: 'LICENSE_IPTV_SOURCE_NOT_FOUND' },
        404,
      );
    }

    const typedSource = source as LicenseIptvSourceRecord;

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, admin_owner_id')
      .eq('id', typedSource.license_id)
      .maybeSingle();

    if (licenseError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: licenseError.message,
        },
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

    if (typedSource.type === 'xtream') {
      const result = createImportResult({
        limit: importLimit,
        message: 'Importacao Xtream ainda nao suportada nesta fase.',
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: 'XTREAM_IMPORT_NOT_SUPPORTED_YET',
      });

      return jsonResponse(
        { ok: false, error: 'XTREAM_IMPORT_NOT_SUPPORTED_YET', result },
        400,
      );
    }

    if (typedSource.type !== 'm3u') {
      const result = createImportResult({
        limit: importLimit,
        message: 'Tipo de fonte ainda nao suportado para importacao.',
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: 'IPTV_SOURCE_TYPE_NOT_SUPPORTED',
      });

      return jsonResponse(
        { ok: false, error: 'IPTV_SOURCE_TYPE_NOT_SUPPORTED', result },
        400,
      );
    }

    const fetchResult = await fetchSourcePlaylist(typedSource.source_url);

    if (!fetchResult.ok) {
      const result = createImportResult({
        fetched: false,
        limit: importLimit,
        message: 'Nao foi possivel acessar a fonte IPTV.',
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: fetchResult.error,
      });

      return jsonResponse(
        {
          ok: false,
          error: fetchResult.error,
          details: fetchResult.details,
          result,
        },
        502,
      );
    }

    const parsedResult = parseM3uChannels(fetchResult.bodyText, importLimit);
    const wasLimited =
      fetchResult.wasLimited || parsedResult.wasLimited || limitResult.wasClamped;

    if (!parsedResult.looksLikeM3u || parsedResult.channels.length === 0) {
      const result = createImportResult({
        fetched: true,
        parsed: false,
        totalParsed: parsedResult.totalParsed,
        totalSkipped: parsedResult.totalSkipped,
        totalFailed: parsedResult.totalFailed,
        wasLimited,
        limit: importLimit,
        sampleChannels: parsedResult.sampleChannels,
        message: 'Nao foi possivel interpretar a playlist M3U.',
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: 'IPTV_SOURCE_PARSE_FAILED',
      });

      return jsonResponse(
        { ok: false, error: 'IPTV_SOURCE_PARSE_FAILED', result },
        400,
      );
    }

    const { data: existingChannels, error: existingChannelsError } =
      await supabaseAdmin
        .from('license_channels_cache')
        .select(
          'id, name, stream_url, logo_url, group_title, tvg_id, sort_order, is_active',
        )
        .eq('license_iptv_source_id', typedSource.id);

    if (existingChannelsError) {
      const result = createImportResult({
        fetched: true,
        parsed: true,
        totalParsed: parsedResult.totalParsed,
        totalSkipped: parsedResult.totalSkipped,
        totalFailed: parsedResult.totalFailed + parsedResult.channels.length,
        wasLimited,
        limit: importLimit,
        sampleChannels: parsedResult.sampleChannels,
        message: 'Nao foi possivel ler o cache de canais.',
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: 'CHANNELS_CACHE_IMPORT_FAILED',
      });

      return jsonResponse(
        {
          ok: false,
          error: 'CHANNELS_CACHE_IMPORT_FAILED',
          details: existingChannelsError.message,
          result,
        },
        500,
      );
    }

    const existingRows = (existingChannels ?? []) as CachedChannel[];
    const existingByStreamUrl = new Map<string, CachedChannel>();

    for (const existingChannel of existingRows) {
      existingByStreamUrl.set(existingChannel.stream_url, existingChannel);
    }

    const nowIso = new Date().toISOString();
    const parsedStreamUrls = new Set(
      parsedResult.channels.map((channel) => channel.stream_url),
    );
    const rowsToInsert: Record<string, unknown>[] = [];
    const rowsToUpdate: Record<string, unknown>[] = [];
    const rowsToReactivate: Record<string, unknown>[] = [];
    const rowsToDeactivateMissing: Record<string, unknown>[] = [];
    let unchangedSkipped = 0;

    for (const existingChannel of existingRows) {
      if (
        existingChannel.is_active &&
        !parsedStreamUrls.has(existingChannel.stream_url)
      ) {
        rowsToDeactivateMissing.push({
          id: existingChannel.id,
          license_id: typedLicense.id,
          license_iptv_source_id: typedSource.id,
          name: existingChannel.name,
          stream_url: existingChannel.stream_url,
          logo_url: existingChannel.logo_url,
          group_title: existingChannel.group_title,
          tvg_id: existingChannel.tvg_id,
          sort_order: existingChannel.sort_order,
          is_active: false,
          updated_at: nowIso,
        });
      }
    }

    for (const channel of parsedResult.channels) {
      const existingChannel = existingByStreamUrl.get(channel.stream_url);

      if (!existingChannel) {
        rowsToInsert.push(
          toCacheRow({
            channel,
            licenseId: typedLicense.id,
            sourceId: typedSource.id,
            nowIso,
          }),
        );
        continue;
      }

      if (!existingChannel.is_active) {
        rowsToReactivate.push(
          toCacheRow({
            channel,
            licenseId: typedLicense.id,
            sourceId: typedSource.id,
            nowIso,
          }),
        );
        continue;
      }

      if (hasCacheChanges(existingChannel, channel)) {
        rowsToUpdate.push(
          toCacheRow({
            channel,
            licenseId: typedLicense.id,
            sourceId: typedSource.id,
            nowIso,
          }),
        );
        continue;
      }

      unchangedSkipped += 1;
    }

    try {
      await writeRowsInChunks({
        supabaseAdmin,
        rows: rowsToInsert,
        mode: 'insert',
      });
      await writeRowsInChunks({
        supabaseAdmin,
        rows: rowsToUpdate,
        mode: 'upsert',
      });
      await writeRowsInChunks({
        supabaseAdmin,
        rows: rowsToReactivate,
        mode: 'upsert',
      });
      await writeRowsInChunks({
        supabaseAdmin,
        rows: rowsToDeactivateMissing,
        mode: 'upsert',
      });
    } catch (error) {
      const result = createImportResult({
        fetched: true,
        parsed: true,
        totalParsed: parsedResult.totalParsed,
        totalImported: 0,
        totalUpdated: 0,
        totalSkipped: parsedResult.totalSkipped + unchangedSkipped,
        totalFailed:
          rowsToInsert.length +
          rowsToUpdate.length +
          rowsToReactivate.length +
          rowsToDeactivateMissing.length,
        wasLimited,
        limit: importLimit,
        sampleChannels: parsedResult.sampleChannels,
        message: 'Nao foi possivel gravar os canais no cache.',
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: 'CHANNELS_CACHE_IMPORT_FAILED',
      });

      return jsonResponse(
        {
          ok: false,
          error: 'CHANNELS_CACHE_IMPORT_FAILED',
          details: error instanceof Error ? error.message : String(error),
          result,
        },
        500,
      );
    }

    const result = createImportResult({
      fetched: true,
      parsed: true,
      totalParsed: parsedResult.totalParsed,
      totalImported: rowsToInsert.length,
      totalUpdated: rowsToUpdate.length,
      totalReactivated: rowsToReactivate.length,
      totalSkipped: parsedResult.totalSkipped + unchangedSkipped,
      totalFailed: parsedResult.totalFailed,
      totalDeactivatedMissing: rowsToDeactivateMissing.length,
      wasLimited,
      limit: importLimit,
      sampleChannels: parsedResult.sampleChannels,
      message: wasLimited
        ? 'Importacao concluida com limite operacional. Canais ausentes foram inativados.'
        : 'Importacao concluida. Canais ausentes foram inativados.',
    });

    await insertImportAudit({
      supabaseAdmin,
      actorId: actor.id,
      license: typedLicense,
      source: typedSource,
      result,
      success: true,
    });

    return jsonResponse({
      ok: true,
      sourceId: typedSource.id,
      result,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: 'SERVER_ERROR',
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
