import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type UpdateAdminUserStatusRequest = {
  adminUserId?: string;
  isActive?: boolean;
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
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: actorProfileError.message,
        },
        500,
      );
    }

    if (!actorProfile || actorProfile.role !== 'super_admin') {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    let payload: UpdateAdminUserStatusRequest;

    try {
      payload = (await request.json()) as UpdateAdminUserStatusRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const adminUserId = normalizeText(payload.adminUserId);

    if (!adminUserId || typeof payload.isActive !== 'boolean') {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    if (adminUserId === actor.id && payload.isActive === false) {
      return jsonResponse({ ok: false, error: 'CANNOT_DISABLE_SELF' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('admin_profiles')
      .select('id, email, role, is_active')
      .eq('id', adminUserId)
      .maybeSingle();

    if (targetProfileError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: targetProfileError.message,
        },
        500,
      );
    }

    if (!targetProfile) {
      return jsonResponse({ ok: false, error: 'ADMIN_USER_NOT_FOUND' }, 404);
    }

    const now = new Date().toISOString();

    const { data: updatedProfile, error: updateProfileError } = await supabaseAdmin
      .from('admin_profiles')
      .update({
        is_active: payload.isActive,
        updated_at: now,
      })
      .eq('id', adminUserId)
      .select('id, email, role, is_active, created_at, updated_at')
      .single();

    if (updateProfileError) {
      return jsonResponse(
        {
          ok: false,
          error: 'ADMIN_PROFILE_UPDATE_FAILED',
          details: updateProfileError.message,
        },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: payload.isActive ? 'admin_user_activated' : 'admin_user_deactivated',
      entity: 'admin_profiles',
      entity_id: updatedProfile.id,
      metadata: {
        email: updatedProfile.email,
        role: updatedProfile.role,
        previous_is_active: targetProfile.is_active,
        new_is_active: updatedProfile.is_active,
      },
    });

    return jsonResponse({
      ok: true,
      adminUser: updatedProfile,
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
