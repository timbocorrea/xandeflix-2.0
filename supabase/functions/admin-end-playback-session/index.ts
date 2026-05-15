import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';

type AdminEndPlaybackSessionRequest = {
  sessionId?: string;
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

    let payload: AdminEndPlaybackSessionRequest;

    try {
      payload = (await request.json()) as AdminEndPlaybackSessionRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const sessionId = normalizeText(payload.sessionId);

    if (!sessionId) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingSession, error: existingSessionError } =
      await supabaseAdmin
        .from('playback_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

    if (existingSessionError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: existingSessionError.message,
        },
        500,
      );
    }

    if (!existingSession) {
      return jsonResponse({ ok: false, error: 'PLAYBACK_SESSION_NOT_FOUND' }, 404);
    }

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, admin_owner_id')
      .eq('id', existingSession.license_id)
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

    if (existingSession.status !== 'active') {
      return jsonResponse(
        { ok: false, error: 'PLAYBACK_SESSION_NOT_ACTIVE' },
        409,
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updatedSession, error: updateSessionError } =
      await supabaseAdmin
        .from('playback_sessions')
        .update({
          status: 'ended',
          ended_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', sessionId)
        .eq('status', 'active')
        .select('*')
        .maybeSingle();

    if (updateSessionError) {
      return jsonResponse(
        {
          ok: false,
          error: 'PLAYBACK_SESSION_END_FAILED',
          details: updateSessionError.message,
        },
        500,
      );
    }

    if (!updatedSession) {
      return jsonResponse(
        { ok: false, error: 'PLAYBACK_SESSION_NOT_ACTIVE' },
        409,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: 'playback_session_manually_ended',
      entity: 'playback_sessions',
      entity_id: updatedSession.id,
      metadata: {
        sessionId: updatedSession.id,
        licenseId: license.id,
        licenseCode: license.license_code,
        licenseDeviceId: updatedSession.license_device_id,
        deviceIdentifier: updatedSession.device_identifier,
        channelName: updatedSession.channel_name,
        previousStatus: existingSession.status,
        nextStatus: updatedSession.status,
        startedAt: updatedSession.started_at,
        lastHeartbeatAt: updatedSession.last_heartbeat_at,
        endedAt: updatedSession.ended_at,
        action: 'manual_end',
      },
    });

    return jsonResponse({
      ok: true,
      session: updatedSession,
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
