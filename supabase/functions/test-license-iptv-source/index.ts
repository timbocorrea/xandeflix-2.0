import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';

type TestLicenseIptvSourceRequest = {
  sourceId?: string;
};

type PlaylistSampleChannel = {
  name: string;
  groupTitle: string | null;
};

type SourceDiagnostic = {
  success: boolean;
  responded: boolean;
  httpStatus: number | null;
  httpStatusText: string | null;
  contentType: string | null;
  contentLength: number | null;
  bytesRead: number;
  wasTruncated: boolean;
  looksLikeM3u: boolean;
  startsWithExtM3u: boolean;
  extinfLines: number;
  playableUrlLines: number;
  entryCount: number;
  sampleGroups: string[];
  sampleChannels: PlaylistSampleChannel[];
  firstNonEmptyLine: string | null;
  errorMessage: string | null;
  testedAt: string;
};

const FETCH_TIMEOUT_MS = 12000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_SAMPLES = 8;

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

function createFailedDiagnostic(errorMessage: string): SourceDiagnostic {
  return {
    success: false,
    responded: false,
    httpStatus: null,
    httpStatusText: null,
    contentType: null,
    contentLength: null,
    bytesRead: 0,
    wasTruncated: false,
    looksLikeM3u: false,
    startsWithExtM3u: false,
    extinfLines: 0,
    playableUrlLines: 0,
    entryCount: 0,
    sampleGroups: [],
    sampleChannels: [],
    firstNonEmptyLine: null,
    errorMessage,
    testedAt: new Date().toISOString(),
  };
}

function parseContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isPlayableUrlLine(line: string) {
  if (!line || line.startsWith('#')) {
    return false;
  }

  try {
    const parsedUrl = new URL(line);

    return [
      'http:',
      'https:',
      'rtmp:',
      'rtsp:',
      'udp:',
    ].includes(parsedUrl.protocol);
  } catch {
    return /\.(m3u8?|ts)(\?|$)/i.test(line);
  }
}

function parseExtinfLine(line: string): PlaylistSampleChannel {
  const groupMatch =
    line.match(/group-title="([^"]*)"/i) ?? line.match(/group-title='([^']*)'/i);
  const commaIndex = line.lastIndexOf(',');
  const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : '';

  return {
    name: name || 'Canal sem nome',
    groupTitle: groupMatch?.[1]?.trim() || null,
  };
}

function addUniqueSample(samples: string[], value: string | null) {
  if (!value || samples.length >= MAX_SAMPLES || samples.includes(value)) {
    return;
  }

  samples.push(value);
}

function analyzeM3uResponse({
  bodyText,
  bytesRead,
  wasTruncated,
  response,
}: {
  bodyText: string;
  bytesRead: number;
  wasTruncated: boolean;
  response: Response;
}): SourceDiagnostic {
  const lines = bodyText.split(/\r?\n/).map((line) => line.trim());
  const firstNonEmptyLine = lines.find(Boolean) ?? null;
  const startsWithExtM3u = firstNonEmptyLine?.startsWith('#EXTM3U') ?? false;
  const sampleGroups: string[] = [];
  const sampleChannels: PlaylistSampleChannel[] = [];

  let extinfLines = 0;
  let playableUrlLines = 0;
  let pendingChannel: PlaylistSampleChannel | null = null;

  for (const line of lines) {
    if (!line) {
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      extinfLines += 1;
      pendingChannel = parseExtinfLine(line);
      addUniqueSample(sampleGroups, pendingChannel.groupTitle);
      continue;
    }

    if (isPlayableUrlLine(line)) {
      playableUrlLines += 1;

      if (pendingChannel && sampleChannels.length < MAX_SAMPLES) {
        sampleChannels.push(pendingChannel);
      }

      pendingChannel = null;
    }
  }

  const contentType = response.headers.get('content-type');
  const contentTypeLooksLikeM3u = /mpegurl|m3u|text\/plain/i.test(contentType ?? '');
  const looksLikeM3u =
    startsWithExtM3u ||
    extinfLines > 0 ||
    (contentTypeLooksLikeM3u && playableUrlLines > 0);
  const entryCount = Math.max(extinfLines, playableUrlLines);
  const success = response.ok && looksLikeM3u;

  let errorMessage: string | null = null;

  if (!response.ok) {
    errorMessage = `A fonte respondeu com HTTP ${response.status}.`;
  } else if (!looksLikeM3u) {
    errorMessage = 'A URL respondeu, mas não parece uma playlist M3U válida.';
  }

  return {
    success,
    responded: true,
    httpStatus: response.status,
    httpStatusText: response.statusText || null,
    contentType,
    contentLength: parseContentLength(response.headers.get('content-length')),
    bytesRead,
    wasTruncated,
    looksLikeM3u,
    startsWithExtM3u,
    extinfLines,
    playableUrlLines,
    entryCount,
    sampleGroups,
    sampleChannels,
    firstNonEmptyLine,
    errorMessage,
    testedAt: new Date().toISOString(),
  };
}

async function readResponseBody(response: Response) {
  if (!response.body) {
    const bodyText = await response.text();
    const encoded = new TextEncoder().encode(bodyText);
    const bytesRead = Math.min(encoded.byteLength, MAX_RESPONSE_BYTES);

    return {
      bodyText: bodyText.slice(0, MAX_RESPONSE_BYTES),
      bytesRead,
      wasTruncated: encoded.byteLength > MAX_RESPONSE_BYTES,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;
  let wasTruncated = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done || !value) {
      break;
    }

    const remainingBytes = MAX_RESPONSE_BYTES - bytesRead;

    if (remainingBytes <= 0) {
      wasTruncated = true;
      await reader.cancel();
      break;
    }

    if (value.byteLength > remainingBytes) {
      const slicedValue = value.slice(0, remainingBytes);
      chunks.push(decoder.decode(slicedValue, { stream: true }));
      bytesRead += slicedValue.byteLength;
      wasTruncated = true;
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
    wasTruncated,
  };
}

async function testSourceUrl(sourceUrl: string): Promise<SourceDiagnostic> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return createFailedDiagnostic('URL da fonte IPTV inválida.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return createFailedDiagnostic('A fonte IPTV precisa usar HTTP ou HTTPS.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      headers: {
        Accept:
          'application/vnd.apple.mpegurl, application/x-mpegurl, audio/x-mpegurl, text/plain, */*',
        'User-Agent': 'Xandeflix-Admin-IPTV-Diagnostics/1.0',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    const bodyResult = await readResponseBody(response);

    return analyzeM3uResponse({
      ...bodyResult,
      response,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return createFailedDiagnostic('Tempo limite excedido ao testar a fonte IPTV.');
    }

    return createFailedDiagnostic(
      error instanceof Error
        ? `Falha ao acessar a fonte IPTV: ${error.message}`
        : 'Falha ao acessar a fonte IPTV.',
    );
  } finally {
    clearTimeout(timeoutId);
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

    let payload: TestLicenseIptvSourceRequest;

    try {
      payload = (await request.json()) as TestLicenseIptvSourceRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const sourceId = normalizeText(payload.sourceId);

    if (!sourceId) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

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

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, admin_owner_id')
      .eq('id', source.license_id)
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

    if (
      !canManageLicense({
        actorId: actor.id,
        actorRole: actorProfile.role as AdminRole,
        ownerId: license.admin_owner_id,
      })
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    const diagnostic = await testSourceUrl(source.source_url);

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: 'license_iptv_source_tested',
      entity: 'license_iptv_sources',
      entity_id: source.id,
      metadata: {
        licenseId: license.id,
        licenseCode: license.license_code,
        sourceId: source.id,
        sourceName: source.name,
        sourceType: source.type,
        sourceIsActive: source.is_active,
        success: diagnostic.success,
        responded: diagnostic.responded,
        httpStatus: diagnostic.httpStatus,
        contentType: diagnostic.contentType,
        contentLength: diagnostic.contentLength,
        bytesRead: diagnostic.bytesRead,
        wasTruncated: diagnostic.wasTruncated,
        looksLikeM3u: diagnostic.looksLikeM3u,
        entryCount: diagnostic.entryCount,
        errorMessage: diagnostic.errorMessage,
        action: 'test',
      },
    });

    return jsonResponse({
      ok: true,
      diagnostic,
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
