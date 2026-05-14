import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';

type UpdateClientDetailsRequest = {
  clientId?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  expires_at?: string | null;
  notes?: string | null;
};

type ClientDetailsField = 'name' | 'email' | 'phone' | 'expires_at' | 'notes';

type ClientDetails = Record<ClientDetailsField, string | null>;

const editableFields: ClientDetailsField[] = [
  'name',
  'email',
  'phone',
  'expires_at',
  'notes',
];

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

function normalizeRequiredText(value?: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeOptionalText(value?: string | null) {
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

function canUpdateClient({
  actorId,
  actorRole,
  ownerId,
}: {
  actorId: string;
  actorRole: AdminRole;
  ownerId?: string | null;
}) {
  return actorRole === 'super_admin' || ownerId === actorId;
}

function getComparableValue(field: ClientDetailsField, value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (field === 'expires_at') {
    return String(value).slice(0, 10);
  }

  return String(value);
}

function getChangedFields(previousValues: ClientDetails, nextValues: ClientDetails) {
  return editableFields.filter(
    (field) =>
      getComparableValue(field, previousValues[field]) !==
      getComparableValue(field, nextValues[field]),
  );
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

    if (
      !actorProfile ||
      (actorProfile.role !== 'admin' && actorProfile.role !== 'super_admin')
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    let payload: UpdateClientDetailsRequest;

    try {
      payload = (await request.json()) as UpdateClientDetailsRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const clientId = normalizeRequiredText(payload.clientId);
    const nextValues: ClientDetails = {
      name: normalizeRequiredText(payload.name),
      email: normalizeOptionalText(payload.email),
      phone: normalizeOptionalText(payload.phone),
      expires_at: normalizeOptionalText(payload.expires_at),
      notes: normalizeOptionalText(payload.notes),
    };

    if (!clientId || !nextValues.name) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
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

    if (
      !canUpdateClient({
        actorId: actor.id,
        actorRole: actorProfile.role,
        ownerId: existingClient.admin_owner_id,
      })
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    const previousValues: ClientDetails = {
      name: existingClient.name,
      email: existingClient.email,
      phone: existingClient.phone,
      expires_at: existingClient.expires_at,
      notes: existingClient.notes,
    };
    const changedFields = getChangedFields(previousValues, nextValues);

    if (changedFields.length === 0) {
      return jsonResponse({
        ok: true,
        client: existingClient,
      });
    }

    const now = new Date().toISOString();

    const { data: updatedClient, error: updateClientError } = await supabaseAdmin
      .from('clients')
      .update({
        ...nextValues,
        updated_at: now,
      })
      .eq('id', clientId)
      .select('*')
      .single();

    if (updateClientError) {
      return jsonResponse(
        {
          ok: false,
          error: 'CLIENT_DETAILS_UPDATE_FAILED',
          details: updateClientError.message,
        },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: 'client_updated',
      entity: 'clients',
      entity_id: updatedClient.id,
      metadata: {
        clientId: updatedClient.id,
        changedFields,
        previousValues: Object.fromEntries(
          changedFields.map((field) => [field, previousValues[field]]),
        ),
        nextValues: Object.fromEntries(
          changedFields.map((field) => [field, nextValues[field]]),
        ),
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
