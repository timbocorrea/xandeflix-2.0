import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AppInstallationStatus =
  | 'activated'
  | 'inactive'
  | 'pending_uninstall'
  | 'manually_marked_uninstalled'
  | 'blocked';

type UpdateAppInstallationStatusRequest = {
  installationId?: string;
  status?: AppInstallationStatus;
};

const allowedStatuses = new Set<AppInstallationStatus>([
  'activated',
  'inactive',
  'pending_uninstall',
  'manually_marked_uninstalled',
  'blocked',
]);

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

    const { data: actorProfile, error: actorProfileError } = await supabaseAuthClient
      .from('admin_profiles')
      .select('id, email, role, is_active')
      .eq('id', actor.id)
      .eq('is_active', true)
      .maybeSingle();

    if (actorProfileError) {
      return jsonResponse({
        ok: false,
        error: 'SERVER_ERROR',
        details: actorProfileError.message,
      }, 500);
    }

    if (!actorProfile || actorProfile.role !== 'super_admin') {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    let payload: UpdateAppInstallationStatusRequest;

    try {
      payload = (await request.json()) as UpdateAppInstallationStatusRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const installationId = normalizeText(payload.installationId);
    const status = payload.status;

    if (!installationId || !status || !allowedStatuses.has(status)) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const now = new Date().toISOString();
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingInstallation, error: existingInstallationError } = await supabaseAdmin
      .from('app_installations')
      .select('id, device_identifier, installation_status')
      .eq('id', installationId)
      .maybeSingle();

    if (existingInstallationError) {
      return jsonResponse({
        ok: false,
        error: 'APP_INSTALLATION_LOOKUP_FAILED',
        details: existingInstallationError.message,
      }, 500);
    }

    if (!existingInstallation) {
      return jsonResponse({ ok: false, error: 'APP_INSTALLATION_NOT_FOUND' }, 404);
    }

    const statusTimestamps =
      status === 'pending_uninstall'
        ? { pending_uninstall_at: now }
        : status === 'manually_marked_uninstalled'
          ? { manually_marked_uninstalled_at: now }
          : {};

    const { data: installation, error: updateError } = await supabaseAdmin
      .from('app_installations')
      .update({
        installation_status: status,
        updated_at: now,
        ...statusTimestamps,
      })
      .eq('id', installationId)
      .select(
        'id, device_identifier, installation_status, platform, manufacturer, model, app_version, first_seen_at, last_seen_at, activated_at, pending_uninstall_at, manually_marked_uninstalled_at, linked_license_id, linked_license_device_id, created_at, updated_at',
      )
      .single();

    if (updateError) {
      return jsonResponse({
        ok: false,
        error: 'APP_INSTALLATION_STATUS_UPDATE_FAILED',
        details: updateError.message,
      }, 500);
    }

    await supabaseAdmin
      .from('audit_logs')
      .insert({
        actor_id: actor.id,
        action: 'app_installation_status_updated',
        entity: 'app_installations',
        entity_id: installation.id,
        metadata: {
          deviceIdentifier: installation.device_identifier,
          previousStatus: existingInstallation.installation_status,
          nextStatus: status,
        },
      });

    return jsonResponse({
      ok: true,
      installation,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'SERVER_ERROR',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
