import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type StartPlaybackSessionRequest = {
  licenseCode?: string;
  deviceIdentifier?: string;
  iptvSourceId?: string;
  channelName?: string;
  streamUrl?: string;
};

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

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function normalizeLicenseCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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

    let payload: StartPlaybackSessionRequest;

    try {
      payload = (await request.json()) as StartPlaybackSessionRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const licenseCode = normalizeLicenseCode(payload.licenseCode);
    const deviceIdentifier = normalizeText(payload.deviceIdentifier);
    const iptvSourceId = normalizeText(payload.iptvSourceId);
    const channelName = normalizeText(payload.channelName);
    const streamUrl = normalizeText(payload.streamUrl);

    if (!licenseCode || !deviceIdentifier) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, status, expires_at, max_concurrent_streams')
      .eq('license_code', licenseCode)
      .maybeSingle();

    if (licenseError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: licenseError.message }, 500);
    }

    if (!license) {
      return jsonResponse({ ok: false, error: 'LICENSE_NOT_FOUND' }, 404);
    }

    if (license.status === 'blocked') {
      return jsonResponse({ ok: false, error: 'LICENSE_BLOCKED' }, 403);
    }

    if (license.status !== 'active') {
      return jsonResponse({ ok: false, error: 'LICENSE_INACTIVE' }, 403);
    }

    if (isExpired(license.expires_at)) {
      return jsonResponse({ ok: false, error: 'LICENSE_EXPIRED' }, 403);
    }

    const { data: device, error: deviceError } = await supabaseAdmin
      .from('license_devices')
      .select('id, device_identifier, is_active')
      .eq('license_id', license.id)
      .eq('device_identifier', deviceIdentifier)
      .maybeSingle();

    if (deviceError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: deviceError.message }, 500);
    }

    if (!device) {
      return jsonResponse({ ok: false, error: 'DEVICE_NOT_ACTIVATED' }, 403);
    }

    if (!device.is_active) {
      return jsonResponse({ ok: false, error: 'DEVICE_INACTIVE' }, 403);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + 3 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from('playback_sessions')
      .update({
        status: 'expired',
        ended_at: nowIso,
        updated_at: nowIso,
      })
      .eq('license_id', license.id)
      .eq('status', 'active')
      .lt('expires_at', nowIso);

    const { count: activeSessionsCount, error: countError } = await supabaseAdmin
      .from('playback_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('license_id', license.id)
      .eq('status', 'active')
      .gt('expires_at', nowIso);

    if (countError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: countError.message }, 500);
    }

    if ((activeSessionsCount ?? 0) >= license.max_concurrent_streams) {
      return jsonResponse({
        ok: false,
        error: 'CONCURRENT_STREAM_LIMIT_REACHED',
        maxConcurrentStreams: license.max_concurrent_streams,
        activeSessions: activeSessionsCount ?? 0,
      }, 403);
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('playback_sessions')
      .insert({
        license_id: license.id,
        license_device_id: device.id,
        iptv_source_id: iptvSourceId,
        device_identifier: deviceIdentifier,
        channel_name: channelName,
        stream_url: streamUrl,
        status: 'active',
        started_at: nowIso,
        last_heartbeat_at: nowIso,
        expires_at: expiresAt,
      })
      .select('id, license_id, license_device_id, device_identifier, channel_name, status, started_at, last_heartbeat_at, expires_at')
      .single();

    if (sessionError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: sessionError.message }, 500);
    }

    return jsonResponse({
      ok: true,
      session: {
        id: session.id,
        licenseId: session.license_id,
        licenseDeviceId: session.license_device_id,
        deviceIdentifier: session.device_identifier,
        channelName: session.channel_name,
        status: session.status,
        startedAt: session.started_at,
        lastHeartbeatAt: session.last_heartbeat_at,
        expiresAt: session.expires_at,
      },
      limits: {
        maxConcurrentStreams: license.max_concurrent_streams,
        activeSessionsBeforeStart: activeSessionsCount ?? 0,
      },
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'SERVER_ERROR',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
