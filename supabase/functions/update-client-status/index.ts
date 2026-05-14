import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ClientStatus = 'active' | 'inactive' | 'expired' | 'blocked';

type UpdateClientStatusRequest = {
  clientId?: string;
  status?: ClientStatus;
};

const allowedStatuses = new Set<ClientStatus>([
  'active',
  'inactive',
  'expired',
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

function getAuditAction(status: ClientStatus) {
  return status === 'blocked' ? 'client_suspended' : 'client_reactivated';
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

    let payload: UpdateClientStatusRequest;

    try {
      payload = (await request.json()) as UpdateClientStatusRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const clientId = normalizeText(payload.clientId);
    const status = payload.status;

    if (!clientId || !status || !allowedStatuses.has(status)) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    if (status !== 'active' && status !== 'blocked') {
      return jsonResponse({ ok: false, error: 'INVALID_CLIENT_STATUS_ACTION' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingClient, error: existingClientError } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();

    if (existingClientError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: existingClientError.message,
        },
        500,
      );
    }

    if (!existingClient) {
      return jsonResponse({ ok: false, error: 'CLIENT_NOT_FOUND' }, 404);
    }

    if (existingClient.status === status) {
      return jsonResponse({
        ok: true,
        client: existingClient,
      });
    }

    const now = new Date().toISOString();

    const { data: updatedClient, error: updateClientError } = await supabaseAdmin
      .from('clients')
      .update({
        status,
        updated_at: now,
      })
      .eq('id', clientId)
      .select('*')
      .single();

    if (updateClientError) {
      return jsonResponse(
        {
          ok: false,
          error: 'CLIENT_STATUS_UPDATE_FAILED',
          details: updateClientError.message,
        },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: getAuditAction(status),
      entity: 'clients',
      entity_id: updatedClient.id,
      metadata: {
        clientId: updatedClient.id,
        previousStatus: existingClient.status,
        nextStatus: updatedClient.status,
      },
    });

    return jsonResponse({
      ok: true,
      client: updatedClient,
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
