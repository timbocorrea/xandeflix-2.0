import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type HeartbeatPlaybackSessionRequest = {
  sessionId?: string;
  licenseCode?: string;
  deviceIdentifier?: string;
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

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeLicenseCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase();
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

    let payload: HeartbeatPlaybackSessionRequest;

    try {
      payload = (await request.json()) as HeartbeatPlaybackSessionRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const sessionId = normalizeText(payload.sessionId);
    const licenseCode = normalizeLicenseCode(payload.licenseCode);
    const deviceIdentifier = normalizeText(payload.deviceIdentifier);

    if (!sessionId || !licenseCode || !deviceIdentifier) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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

    if (license.status !== 'active') {
      return jsonResponse({ ok: false, error: 'LICENSE_INACTIVE' }, 403);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + 3 * 60 * 1000).toISOString();

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('playback_sessions')
      .update({
        last_heartbeat_at: nowIso,
        expires_at: expiresAt,
        updated_at: nowIso,
      })
      .eq('id', sessionId)
      .eq('license_id', license.id)
      .eq('device_identifier', deviceIdentifier)
      .eq('status', 'active')
      .select('id, device_identifier, status, last_heartbeat_at, expires_at')
      .maybeSingle();

    if (sessionError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: sessionError.message }, 500);
    }

    if (!session) {
      return jsonResponse({ ok: false, error: 'SESSION_NOT_FOUND_OR_INACTIVE' }, 404);
    }

    return jsonResponse({
      ok: true,
      session: {
        id: session.id,
        deviceIdentifier: session.device_identifier,
        status: session.status,
        lastHeartbeatAt: session.last_heartbeat_at,
        expiresAt: session.expires_at,
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
