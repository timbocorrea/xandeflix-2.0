import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdminRole = "admin" | "super_admin";
type LicenseIptvSourceType = "m3u" | "xtream" | "manual";

type ImportLicenseIptvSourceChannelsRequest = {
  sourceId?: string;
  limit?: number;
};

type ChannelContentKind = "live" | "movie" | "series" | "unknown";

type ParsedChannel = {
  name: string;
  stream_url: string;
  logo_url: string | null;
  group_title: string | null;
  tvg_id: string | null;
  sort_order: number;
  content_kind: ChannelContentKind;
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

const FETCH_TIMEOUT_MS = 300000;
const DEFAULT_IMPORT_LIMIT = 350000;
const MAX_IMPORT_LIMIT = 350000;
const MAX_SAMPLES = 10;
const WRITE_BATCH_SIZE = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
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

function normalizeClassificationText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function includesAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

const MOVIE_GROUP_TERMS = [
  "filme",
  "filmes",
  "movie",
  "movies",
  "cinema",
  "vod",
  "lancamento",
  "lancamentos",
  "estreia",
  "estreias",
];

const SERIES_GROUP_TERMS = [
  "serie",
  "series",
  "temporada",
  "temporadas",
  "episodio",
  "episodios",
  "novela",
  "novelas",
];

const LIVE_GROUP_TERMS = [
  "canal",
  "canais",
  "ao vivo",
  "live",
  "tv",
  "news",
  "noticias",
  "jornal",
  "esporte",
  "esportes",
  "sport",
  "sports",
  "radio",
];

const LINEAR_CHANNEL_NAME_PATTERN =
  /^(a&e|amc|animal planet|arte 1|axn|band|bis|canal brasil|cartoon|cinemax|cnn|combate|discovery|disney|espn|fox|fx|gloob|globo|hbo|max|megapix|mtv|multishow|nat geo|nick|paramount|premiere|record|sony|space|sportv|star|syfy|telecine|tnt|tooncast|universal|warner)(\s|$)/i;

const LINEAR_QUALITY_SUFFIX_PATTERN = /\b(sd|hd|fhd|uhd|4k|h265|hevc)\b/i;

const SERIES_NAME_PATTERNS = [
  /\bs\d{1,2}\s*e\d{1,3}\b/i,
  /\b\d{1,2}x\d{1,3}\b/i,
  /\btemporada\s+\d{1,2}\b/i,
  /\bt\d{1,2}\s*e\d{1,3}\b/i,
];

const MOVIE_YEAR_PATTERN = /\b(19|20)\d{2}\b/;

function classifyChannelContentKind({
  name,
  groupTitle,
}: {
  name: string;
  groupTitle: string | null;
}): ChannelContentKind {
  const normalizedGroup = normalizeClassificationText(groupTitle);
  const normalizedName = normalizeClassificationText(name);

  if (!normalizedGroup && !normalizedName) {
    return "unknown";
  }

  if (LINEAR_CHANNEL_NAME_PATTERN.test(normalizedName)) {
    return "live";
  }

  if (
    includesAnyTerm(normalizedGroup, LIVE_GROUP_TERMS) &&
    LINEAR_QUALITY_SUFFIX_PATTERN.test(normalizedName)
  ) {
    return "live";
  }

  if (includesAnyTerm(normalizedGroup, SERIES_GROUP_TERMS)) {
    return "series";
  }

  if (SERIES_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
    return "series";
  }

  if (includesAnyTerm(normalizedGroup, MOVIE_GROUP_TERMS)) {
    return "movie";
  }

  if (
    MOVIE_YEAR_PATTERN.test(name) &&
    !includesAnyTerm(normalizedGroup, LIVE_GROUP_TERMS)
  ) {
    return "movie";
  }

  if (includesAnyTerm(normalizedGroup, LIVE_GROUP_TERMS)) {
    return "live";
  }

  return "unknown";
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const [scheme, token] = authorization.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token) {
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
  return actorRole === "super_admin" || ownerId === actorId;
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

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
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
      attributes[key] = value ?? "";
    }
  }

  for (const match of line.matchAll(singleQuotedAttributeRegex)) {
    const [, key, value] = match;

    if (key && attributes[key] === undefined) {
      attributes[key] = value ?? "";
    }
  }

  return attributes;
}

function parseChannelName(line: string) {
  const commaIndex = line.lastIndexOf(",");

  if (commaIndex === -1) {
    return null;
  }

  return normalizeNullableText(line.slice(commaIndex + 1));
}

function isPlayableUrl(line: string) {
  const normalizedLine = line.trim().toLowerCase();

  return (
    normalizedLine.startsWith("http://") ||
    normalizedLine.startsWith("https://") ||
    normalizedLine.startsWith("rtmp://") ||
    normalizedLine.startsWith("rtsp://") ||
    normalizedLine.startsWith("udp://")
  );
}

function sanitizeChannelName(value: string | null, fallbackIndex: number) {
  return normalizeText(value) ?? `Canal ${fallbackIndex}`;
}

type PendingM3uMetadata = {
  name: string | null;
  logoUrl: string | null;
  groupTitle: string | null;
  tvgId: string | null;
  tvgName: string | null;
};

type StreamImportStats = {
  totalParsed: number;
  totalAccepted: number;
  totalWritten: number;
  totalSkipped: number;
  totalFailed: number;
  wasLimited: boolean;
  reachedEnd: boolean;
  looksLikeM3u: boolean;
  sampleChannels: ImportSampleChannel[];
  extinfLines: number;
  firstNonEmptyLine: string;
  sortOrder: number;
};

function createStreamImportStats(): StreamImportStats {
  return {
    totalParsed: 0,
    totalAccepted: 0,
    totalWritten: 0,
    totalSkipped: 0,
    totalFailed: 0,
    wasLimited: false,
    reachedEnd: false,
    looksLikeM3u: false,
    sampleChannels: [],
    extinfLines: 0,
    firstNonEmptyLine: "",
    sortOrder: 0,
  };
}

function updateLooksLikeM3u(stats: StreamImportStats) {
  stats.looksLikeM3u =
    stats.firstNonEmptyLine.startsWith("#EXTM3U") || stats.extinfLines > 0;
}

function parseExtinfMetadata(line: string): PendingM3uMetadata {
  const attributes = parseAttributes(line);

  return {
    name: parseChannelName(line),
    logoUrl: normalizeNullableText(attributes["tvg-logo"]),
    groupTitle: normalizeNullableText(attributes["group-title"]),
    tvgId: normalizeNullableText(attributes["tvg-id"]),
    tvgName: normalizeNullableText(attributes["tvg-name"]),
  };
}

async function fetchSourcePlaylist(sourceUrl: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return {
      ok: false as const,
      error: "IPTV_SOURCE_FETCH_FAILED",
      details: "Invalid source URL.",
    };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return {
      ok: false as const,
      error: "IPTV_SOURCE_FETCH_FAILED",
      details: "Only HTTP and HTTPS sources are supported.",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const cleanup = () => clearTimeout(timeoutId);

  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        Accept:
          "application/vnd.apple.mpegurl, application/x-mpegurl, audio/x-mpegurl, text/plain, */*",
        "User-Agent": "Xandeflix-Admin-IPTV-Import/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      cleanup();

      return {
        ok: false as const,
        error: "IPTV_SOURCE_FETCH_FAILED",
        details: `Source returned HTTP ${response.status}.`,
      };
    }

    if (!response.body) {
      cleanup();

      return {
        ok: false as const,
        error: "IPTV_SOURCE_FETCH_FAILED",
        details: "Source response did not provide a readable stream.",
      };
    }

    return {
      ok: true as const,
      response,
      cleanup,
    };
  } catch (error) {
    cleanup();

    return {
      ok: false as const,
      error: "IPTV_SOURCE_FETCH_FAILED",
      details:
        error instanceof Error && error.name === "AbortError"
          ? "Source fetch timed out."
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }
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
    content_kind: channel.content_kind,
    is_active: true,
    last_imported_at: nowIso,
    updated_at: nowIso,
  };
}

async function flushChannelBatch({
  supabaseAdmin,
  batch,
  licenseId,
  sourceId,
  nowIso,
  stats,
}: {
  supabaseAdmin: SupabaseClient;
  batch: ParsedChannel[];
  licenseId: string;
  sourceId: string;
  nowIso: string;
  stats: StreamImportStats;
}) {
  if (batch.length === 0) {
    return;
  }

  const seenStreamUrls = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  for (const channel of batch) {
    if (seenStreamUrls.has(channel.stream_url)) {
      stats.totalSkipped += 1;
      continue;
    }

    seenStreamUrls.add(channel.stream_url);
    rows.push(
      toCacheRow({
        channel,
        licenseId,
        sourceId,
        nowIso,
      }),
    );
  }

  batch.length = 0;

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("license_channels_cache")
    .upsert(rows, {
      onConflict: "license_iptv_source_id,stream_url",
    });

  if (error) {
    throw error;
  }

  stats.totalWritten += rows.length;
}

async function parseAndWriteM3uStream({
  response,
  supabaseAdmin,
  licenseId,
  sourceId,
  limit,
  nowIso,
  stats,
}: {
  response: Response;
  supabaseAdmin: SupabaseClient;
  licenseId: string;
  sourceId: string;
  limit: number;
  nowIso: string;
  stats: StreamImportStats;
}) {
  if (!response.body) {
    throw new Error("Source response did not provide a readable stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const batch: ParsedChannel[] = [];

  let buffer = "";
  let pendingMetadata: PendingM3uMetadata | null = null;

  async function processLine(rawLine: string) {
    const line = rawLine.trim();

    if (!line) {
      return false;
    }

    if (!stats.firstNonEmptyLine) {
      stats.firstNonEmptyLine = line;
    }

    if (line.startsWith("#EXTINF")) {
      stats.extinfLines += 1;
      pendingMetadata = parseExtinfMetadata(line);
      return false;
    }

    if (line.startsWith("#")) {
      return false;
    }

    if (!pendingMetadata) {
      return false;
    }

    if (!isPlayableUrl(line)) {
      stats.totalFailed += 1;
      pendingMetadata = null;
      return false;
    }

    const streamUrl = normalizeText(line);

    if (!streamUrl) {
      stats.totalFailed += 1;
      pendingMetadata = null;
      return false;
    }

    stats.totalParsed += 1;

    if (stats.totalAccepted >= limit) {
      stats.wasLimited = true;
      pendingMetadata = null;
      return true;
    }

    const channelName = sanitizeChannelName(
      pendingMetadata.name ?? pendingMetadata.tvgName,
      stats.totalParsed,
    );

    const channel: ParsedChannel = {
      name: channelName,
      stream_url: streamUrl,
      logo_url: pendingMetadata.logoUrl,
      group_title: pendingMetadata.groupTitle,
      tvg_id: pendingMetadata.tvgId,
      sort_order: stats.sortOrder,
      content_kind: classifyChannelContentKind({
        name: channelName,
        groupTitle: pendingMetadata.groupTitle,
      }),
    };

    stats.sortOrder += 1;
    stats.totalAccepted += 1;

    if (stats.sampleChannels.length < MAX_SAMPLES) {
      stats.sampleChannels.push({
        name: channel.name,
        groupTitle: channel.group_title,
      });
    }

    batch.push(channel);
    pendingMetadata = null;

    if (batch.length >= WRITE_BATCH_SIZE) {
      await flushChannelBatch({
        supabaseAdmin,
        batch,
        licenseId,
        sourceId,
        nowIso,
        stats,
      });
    }

    return false;
  }

  async function flushAndStop() {
    await flushChannelBatch({
      supabaseAdmin,
      batch,
      licenseId,
      sourceId,
      nowIso,
      stats,
    });
    updateLooksLikeM3u(stats);
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.search(/\r?\n/);

    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      const newlineLength =
        buffer[newlineIndex] === "\r" && buffer[newlineIndex + 1] === "\n"
          ? 2
          : 1;

      buffer = buffer.slice(newlineIndex + newlineLength);

      if (await processLine(line)) {
        await reader.cancel();
        await flushAndStop();
        return stats;
      }

      newlineIndex = buffer.search(/\r?\n/);
    }
  }

  buffer += decoder.decode();

  if (buffer && (await processLine(buffer))) {
    await flushAndStop();
    return stats;
  }

  stats.reachedEnd = true;

  await flushAndStop();

  return stats;
}

async function countRowsMissingCurrentImport({
  supabaseAdmin,
  sourceId,
  nowIso,
}: {
  supabaseAdmin: SupabaseClient;
  sourceId: string;
  nowIso: string;
}) {
  const { count: neverImportedCount, error: neverImportedError } =
    await supabaseAdmin
      .from("license_channels_cache")
      .select("id", { count: "exact", head: true })
      .eq("license_iptv_source_id", sourceId)
      .eq("is_active", true)
      .is("last_imported_at", null);

  if (neverImportedError) {
    throw neverImportedError;
  }

  const { count: staleImportedCount, error: staleImportedError } =
    await supabaseAdmin
      .from("license_channels_cache")
      .select("id", { count: "exact", head: true })
      .eq("license_iptv_source_id", sourceId)
      .eq("is_active", true)
      .lt("last_imported_at", nowIso);

  if (staleImportedError) {
    throw staleImportedError;
  }

  return (neverImportedCount ?? 0) + (staleImportedCount ?? 0);
}

async function deactivateRowsMissingCurrentImport({
  supabaseAdmin,
  sourceId,
  nowIso,
}: {
  supabaseAdmin: SupabaseClient;
  sourceId: string;
  nowIso: string;
}) {
  const baseUpdate = {
    is_active: false,
    updated_at: nowIso,
  };

  const { error: neverImportedError } = await supabaseAdmin
    .from("license_channels_cache")
    .update(baseUpdate)
    .eq("license_iptv_source_id", sourceId)
    .eq("is_active", true)
    .is("last_imported_at", null);

  if (neverImportedError) {
    throw neverImportedError;
  }

  const { error: staleImportedError } = await supabaseAdmin
    .from("license_channels_cache")
    .update(baseUpdate)
    .eq("license_iptv_source_id", sourceId)
    .eq("is_active", true)
    .lt("last_imported_at", nowIso);

  if (staleImportedError) {
    throw staleImportedError;
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
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    action: "license_iptv_source_channels_imported",
    entity: "license_iptv_sources",
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
      action: "import_channels",
    },
  });
}

type XtreamCredentials = {
  origin: string;
  username: string;
  password: string;
};

function resolveXtreamCredentials(sourceUrl: string): XtreamCredentials | null {
  try {
    const parsed = new URL(sourceUrl);
    const username = normalizeText(parsed.searchParams.get("username"));
    const password = normalizeText(parsed.searchParams.get("password"));

    if (!username || !password) {
      return null;
    }

    return {
      origin: `${parsed.protocol}//${parsed.host}`,
      username,
      password,
    };
  } catch {
    return null;
  }
}

function sanitizeXtreamExtension(value: unknown, fallback: string) {
  const normalized =
    typeof value === "string"
      ? value
          .trim()
          .replace(/^\./, "")
          .replace(/[^a-z0-9]/gi, "")
          .toLowerCase()
      : "";

  return normalized || fallback;
}

function getXtreamString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getXtreamNumericId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return value.trim();
  }

  return "";
}

function buildXtreamApiUrl({
  credentials,
  action,
}: {
  credentials: XtreamCredentials;
  action: string;
}) {
  const url = new URL("/player_api.php", credentials.origin);

  url.searchParams.set("username", credentials.username);
  url.searchParams.set("password", credentials.password);
  url.searchParams.set("action", action);

  return url.toString();
}

async function fetchXtreamJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Xandeflix-Admin-Xtream-Import/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Xtream API returned HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildXtreamStreamUrl({
  credentials,
  kind,
  streamId,
  extension,
}: {
  credentials: XtreamCredentials;
  kind: "live" | "movie";
  streamId: string;
  extension: string;
}) {
  const username = encodeURIComponent(credentials.username);
  const password = encodeURIComponent(credentials.password);
  const safeStreamId = encodeURIComponent(streamId);
  const safeExtension = sanitizeXtreamExtension(
    extension,
    kind === "live" ? "ts" : "mp4",
  );

  return `${credentials.origin}/${kind}/${username}/${password}/${safeStreamId}.${safeExtension}`;
}

function createXtreamParsedChannel({
  name,
  streamUrl,
  logoUrl,
  groupTitle,
  tvgId,
  sortOrder,
  contentKind,
}: {
  name: string;
  streamUrl: string;
  logoUrl?: string | null;
  groupTitle?: string | null;
  tvgId?: string | null;
  sortOrder: number;
  contentKind: ChannelContentKind;
}): ParsedChannel {
  return {
    name,
    stream_url: streamUrl,
    logo_url: logoUrl ?? null,
    group_title: groupTitle ?? null,
    tvg_id: tvgId ?? null,
    sort_order: sortOrder,
    content_kind: contentKind,
  };
}

async function importAndWriteXtreamSource({
  supabaseAdmin,
  credentials,
  licenseId,
  sourceId,
  limit,
  nowIso,
  stats,
}: {
  supabaseAdmin: SupabaseClient;
  credentials: XtreamCredentials;
  licenseId: string;
  sourceId: string;
  limit: number;
  nowIso: string;
  stats: StreamImportStats;
}) {
  type XtreamLiveStream = Record<string, unknown>;
  type XtreamVodStream = Record<string, unknown>;

  const liveStreams = await fetchXtreamJson<XtreamLiveStream[]>(
    buildXtreamApiUrl({
      credentials,
      action: "get_live_streams",
    }),
  );

  const vodStreams = await fetchXtreamJson<XtreamVodStream[]>(
    buildXtreamApiUrl({
      credentials,
      action: "get_vod_streams",
    }),
  );

  const batch: ParsedChannel[] = [];

  async function flushBatch() {
    await flushChannelBatch({
      supabaseAdmin,
      batch,
      licenseId,
      sourceId,
      nowIso,
      stats,
    });
  }

  async function acceptChannel(channel: ParsedChannel) {
    stats.totalParsed += 1;

    if (stats.totalAccepted >= limit) {
      stats.wasLimited = true;
      return false;
    }

    stats.totalAccepted += 1;

    if (stats.sampleChannels.length < MAX_SAMPLES) {
      stats.sampleChannels.push({
        name: channel.name,
        groupTitle: channel.group_title,
      });
    }

    batch.push(channel);

    if (batch.length >= WRITE_BATCH_SIZE) {
      await flushBatch();
    }

    return true;
  }

  for (const item of Array.isArray(liveStreams) ? liveStreams : []) {
    const streamId = getXtreamNumericId(item.stream_id);
    const name = sanitizeChannelName(
      getXtreamString(item.name) || getXtreamString(item.title),
      stats.totalParsed + 1,
    );

    if (!streamId) {
      stats.totalFailed += 1;
      continue;
    }

    const shouldContinue = await acceptChannel(
      createXtreamParsedChannel({
        name,
        streamUrl: buildXtreamStreamUrl({
          credentials,
          kind: "live",
          streamId,
          extension: "ts",
        }),
        logoUrl: getXtreamString(item.stream_icon) || null,
        groupTitle: getXtreamString(item.category_name) || "Xtream Live",
        tvgId: getXtreamString(item.epg_channel_id) || null,
        sortOrder: stats.sortOrder,
        contentKind: "live",
      }),
    );

    stats.sortOrder += 1;

    if (!shouldContinue) {
      break;
    }
  }

  if (!stats.wasLimited) {
    for (const item of Array.isArray(vodStreams) ? vodStreams : []) {
      const streamId = getXtreamNumericId(item.stream_id);
      const name = sanitizeChannelName(
        getXtreamString(item.name) || getXtreamString(item.title),
        stats.totalParsed + 1,
      );

      if (!streamId) {
        stats.totalFailed += 1;
        continue;
      }

      const shouldContinue = await acceptChannel(
        createXtreamParsedChannel({
          name,
          streamUrl: buildXtreamStreamUrl({
            credentials,
            kind: "movie",
            streamId,
            extension: sanitizeXtreamExtension(item.container_extension, "mp4"),
          }),
          logoUrl:
            getXtreamString(item.stream_icon) ||
            getXtreamString(item.cover) ||
            getXtreamString(item.cover_big) ||
            null,
          groupTitle: getXtreamString(item.category_name) || "Xtream VOD",
          tvgId: null,
          sortOrder: stats.sortOrder,
          contentKind: "movie",
        }),
      );

      stats.sortOrder += 1;

      if (!shouldContinue) {
        break;
      }
    }
  }

  await flushBatch();

  stats.looksLikeM3u = true;
  stats.reachedEnd = !stats.wasLimited;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "SERVER_ERROR" }, 500);
    }

    const bearerToken = getBearerToken(request);

    if (!bearerToken) {
      return jsonResponse({ ok: false, error: "UNAUTHORIZED" }, 401);
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
      return jsonResponse({ ok: false, error: "UNAUTHORIZED" }, 401);
    }

    const { data: actorProfile, error: actorProfileError } =
      await supabaseAuthClient
        .from("admin_profiles")
        .select("id, email, role, is_active")
        .eq("id", actor.id)
        .eq("is_active", true)
        .maybeSingle();

    if (actorProfileError) {
      return jsonResponse(
        {
          ok: false,
          error: "SERVER_ERROR",
          details: actorProfileError.message,
        },
        500,
      );
    }

    if (
      !actorProfile ||
      (actorProfile.role !== "admin" && actorProfile.role !== "super_admin")
    ) {
      return jsonResponse({ ok: false, error: "FORBIDDEN" }, 403);
    }

    let payload: ImportLicenseIptvSourceChannelsRequest;

    try {
      payload =
        (await request.json()) as ImportLicenseIptvSourceChannelsRequest;
    } catch {
      return jsonResponse({ ok: false, error: "INVALID_PAYLOAD" }, 400);
    }

    const sourceId = normalizeText(payload.sourceId);
    const limitResult = resolveImportLimit(payload.limit);

    if (!sourceId || !limitResult.ok) {
      return jsonResponse({ ok: false, error: "INVALID_PAYLOAD" }, 400);
    }

    const importLimit = limitResult.limit;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: source, error: sourceError } = await supabaseAdmin
      .from("license_iptv_sources")
      .select("id, license_id, name, source_url, type, is_active, created_by")
      .eq("id", sourceId)
      .maybeSingle();

    if (sourceError) {
      return jsonResponse(
        {
          ok: false,
          error: "SERVER_ERROR",
          details: sourceError.message,
        },
        500,
      );
    }

    if (!source) {
      return jsonResponse(
        { ok: false, error: "LICENSE_IPTV_SOURCE_NOT_FOUND" },
        404,
      );
    }

    const typedSource = source as LicenseIptvSourceRecord;

    const { data: license, error: licenseError } = await supabaseAdmin
      .from("licenses")
      .select("id, license_code, admin_owner_id")
      .eq("id", typedSource.license_id)
      .maybeSingle();

    if (licenseError) {
      return jsonResponse(
        {
          ok: false,
          error: "SERVER_ERROR",
          details: licenseError.message,
        },
        500,
      );
    }

    if (!license) {
      return jsonResponse({ ok: false, error: "LICENSE_NOT_FOUND" }, 404);
    }

    const typedLicense = license as LicenseRecord;

    if (
      !canManageLicense({
        actorId: actor.id,
        actorRole: actorProfile.role as AdminRole,
        ownerId: typedLicense.admin_owner_id,
      })
    ) {
      return jsonResponse({ ok: false, error: "FORBIDDEN" }, 403);
    }

    if (typedSource.type === "xtream") {
      const nowIso = new Date().toISOString();
      const xtreamStats = createStreamImportStats();
      const credentials = resolveXtreamCredentials(typedSource.source_url);

      if (!credentials) {
        const result = createImportResult({
          fetched: false,
          parsed: false,
          limit: importLimit,
          message:
            "Fonte Xtream sem credenciais username/password validas na URL.",
        });

        await insertImportAudit({
          supabaseAdmin,
          actorId: actor.id,
          license: typedLicense,
          source: typedSource,
          result,
          success: false,
          error: "XTREAM_CREDENTIALS_NOT_FOUND",
        });

        return jsonResponse(
          { ok: false, error: "XTREAM_CREDENTIALS_NOT_FOUND", result },
          400,
        );
      }

      try {
        await importAndWriteXtreamSource({
          supabaseAdmin,
          credentials,
          licenseId: typedLicense.id,
          sourceId: typedSource.id,
          limit: importLimit,
          nowIso,
          stats: xtreamStats,
        });
      } catch (error) {
        const result = createImportResult({
          fetched: true,
          parsed: false,
          totalParsed: xtreamStats.totalParsed,
          totalImported: xtreamStats.totalWritten,
          totalUpdated: 0,
          totalReactivated: 0,
          totalSkipped: xtreamStats.totalSkipped,
          totalFailed:
            xtreamStats.totalFailed +
            xtreamStats.totalAccepted -
            xtreamStats.totalWritten,
          wasLimited: xtreamStats.wasLimited || limitResult.wasClamped,
          limit: importLimit,
          sampleChannels: xtreamStats.sampleChannels,
          message: "Nao foi possivel importar canais Xtream.",
        });

        await insertImportAudit({
          supabaseAdmin,
          actorId: actor.id,
          license: typedLicense,
          source: typedSource,
          result,
          success: false,
          error: "XTREAM_IMPORT_FAILED",
        });

        return jsonResponse(
          {
            ok: false,
            error: "XTREAM_IMPORT_FAILED",
            details: error instanceof Error ? error.message : String(error),
            result,
          },
          502,
        );
      }

      const wasLimited = xtreamStats.wasLimited || limitResult.wasClamped;

      if (xtreamStats.totalAccepted === 0) {
        const result = createImportResult({
          fetched: true,
          parsed: false,
          totalParsed: xtreamStats.totalParsed,
          totalSkipped: xtreamStats.totalSkipped,
          totalFailed: xtreamStats.totalFailed,
          wasLimited,
          limit: importLimit,
          sampleChannels: xtreamStats.sampleChannels,
          message:
            "A API Xtream respondeu, mas nenhum canal Live/VOD foi importado.",
        });

        await insertImportAudit({
          supabaseAdmin,
          actorId: actor.id,
          license: typedLicense,
          source: typedSource,
          result,
          success: false,
          error: "XTREAM_IMPORT_EMPTY",
        });

        return jsonResponse(
          { ok: false, error: "XTREAM_IMPORT_EMPTY", result },
          400,
        );
      }

      let totalDeactivatedMissing = 0;

      if (!wasLimited && xtreamStats.reachedEnd) {
        totalDeactivatedMissing = await countRowsMissingCurrentImport({
          supabaseAdmin,
          sourceId: typedSource.id,
          nowIso,
        });

        await deactivateRowsMissingCurrentImport({
          supabaseAdmin,
          sourceId: typedSource.id,
          nowIso,
        });
      }

      const result = createImportResult({
        fetched: true,
        parsed: true,
        totalParsed: xtreamStats.totalParsed,
        totalImported: xtreamStats.totalWritten,
        totalUpdated: 0,
        totalReactivated: 0,
        totalSkipped: xtreamStats.totalSkipped,
        totalFailed:
          xtreamStats.totalFailed +
          xtreamStats.totalAccepted -
          xtreamStats.totalWritten,
        totalDeactivatedMissing,
        wasLimited,
        limit: importLimit,
        sampleChannels: xtreamStats.sampleChannels,
        message: "Importacao Xtream concluida com Live TV e VOD.",
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
    }
    if (typedSource.type !== "m3u") {
      const result = createImportResult({
        limit: importLimit,
        message: "Tipo de fonte ainda nao suportado para importacao.",
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: "IPTV_SOURCE_TYPE_NOT_SUPPORTED",
      });

      return jsonResponse(
        { ok: false, error: "IPTV_SOURCE_TYPE_NOT_SUPPORTED", result },
        400,
      );
    }

    const fetchResult = await fetchSourcePlaylist(typedSource.source_url);

    if (!fetchResult.ok) {
      const result = createImportResult({
        fetched: false,
        limit: importLimit,
        message: "Nao foi possivel acessar a fonte IPTV.",
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

    const nowIso = new Date().toISOString();
    const streamStats = createStreamImportStats();

    try {
      await parseAndWriteM3uStream({
        response: fetchResult.response,
        supabaseAdmin,
        licenseId: typedLicense.id,
        sourceId: typedSource.id,
        limit: importLimit,
        nowIso,
        stats: streamStats,
      });
    } catch (error) {
      fetchResult.cleanup();

      const result = createImportResult({
        fetched: true,
        parsed: true,
        totalParsed: streamStats.totalParsed,
        totalImported: streamStats.totalWritten,
        totalUpdated: 0,
        totalReactivated: 0,
        totalSkipped: streamStats.totalSkipped,
        totalFailed:
          streamStats.totalFailed +
          streamStats.totalAccepted -
          streamStats.totalWritten,
        wasLimited: streamStats.wasLimited || limitResult.wasClamped,
        limit: importLimit,
        sampleChannels: streamStats.sampleChannels,
        message: "Nao foi possivel gravar os canais no cache.",
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: "CHANNELS_CACHE_IMPORT_FAILED",
      });

      return jsonResponse(
        {
          ok: false,
          error: "CHANNELS_CACHE_IMPORT_FAILED",
          details: error instanceof Error ? error.message : String(error),
          result,
        },
        500,
      );
    } finally {
      fetchResult.cleanup();
    }

    const wasLimited = streamStats.wasLimited || limitResult.wasClamped;

    if (!streamStats.looksLikeM3u || streamStats.totalAccepted === 0) {
      const result = createImportResult({
        fetched: true,
        parsed: false,
        totalParsed: streamStats.totalParsed,
        totalSkipped: streamStats.totalSkipped,
        totalFailed: streamStats.totalFailed,
        wasLimited,
        limit: importLimit,
        sampleChannels: streamStats.sampleChannels,
        message: "Nao foi possivel interpretar a playlist M3U.",
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: "IPTV_SOURCE_PARSE_FAILED",
      });

      return jsonResponse(
        { ok: false, error: "IPTV_SOURCE_PARSE_FAILED", result },
        400,
      );
    }

    let totalDeactivatedMissing = 0;

    if (!wasLimited && streamStats.reachedEnd) {
      try {
        totalDeactivatedMissing = await countRowsMissingCurrentImport({
          supabaseAdmin,
          sourceId: typedSource.id,
          nowIso,
        });
        await deactivateRowsMissingCurrentImport({
          supabaseAdmin,
          sourceId: typedSource.id,
          nowIso,
        });
      } catch (error) {
        const result = createImportResult({
          fetched: true,
          parsed: true,
          totalParsed: streamStats.totalParsed,
          totalImported: streamStats.totalWritten,
          totalUpdated: 0,
          totalReactivated: 0,
          totalSkipped: streamStats.totalSkipped,
          totalFailed: streamStats.totalFailed,
          totalDeactivatedMissing: 0,
          wasLimited,
          limit: importLimit,
          sampleChannels: streamStats.sampleChannels,
          message: "Nao foi possivel inativar canais ausentes.",
        });

        await insertImportAudit({
          supabaseAdmin,
          actorId: actor.id,
          license: typedLicense,
          source: typedSource,
          result,
          success: false,
          error: "CHANNELS_CACHE_IMPORT_FAILED",
        });

        return jsonResponse(
          {
            ok: false,
            error: "CHANNELS_CACHE_IMPORT_FAILED",
            details: error instanceof Error ? error.message : String(error),
            result,
          },
          500,
        );
      }
    }

    if (!streamStats.reachedEnd && !wasLimited) {
      const result = createImportResult({
        fetched: true,
        parsed: true,
        totalParsed: streamStats.totalParsed,
        totalImported: streamStats.totalWritten,
        totalUpdated: 0,
        totalReactivated: 0,
        totalSkipped: streamStats.totalSkipped,
        totalFailed: streamStats.totalFailed,
        wasLimited,
        limit: importLimit,
        sampleChannels: streamStats.sampleChannels,
        message:
          "Importacao parcial detectada. Canais ausentes nao foram inativados por seguranca.",
      });

      await insertImportAudit({
        supabaseAdmin,
        actorId: actor.id,
        license: typedLicense,
        source: typedSource,
        result,
        success: false,
        error: "IPTV_SOURCE_PARTIAL_IMPORT",
      });

      return jsonResponse(
        {
          ok: false,
          error: "IPTV_SOURCE_PARTIAL_IMPORT",
          result,
        },
        502,
      );
    }

    const result = createImportResult({
      fetched: true,
      parsed: true,
      totalParsed: streamStats.totalParsed,
      totalImported: streamStats.totalWritten,
      totalUpdated: 0,
      totalReactivated: 0,
      totalSkipped: streamStats.totalSkipped,
      totalFailed: streamStats.totalFailed,
      totalDeactivatedMissing,
      wasLimited,
      limit: importLimit,
      sampleChannels: streamStats.sampleChannels,
      message: wasLimited
        ? "Importacao concluida com limite operacional. Canais ausentes nao foram inativados por seguranca."
        : "Importacao concluida. Canais ausentes foram inativados.",
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
        error: "SERVER_ERROR",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
