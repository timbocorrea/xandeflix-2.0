import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';
type LicenseIptvSourceType = 'm3u' | 'xtream' | 'manual';

type CreateLicenseIptvSourceRequest = {
  license_id?: string;
  name?: string;
  source_url?: string;
  type?: LicenseIptvSourceType;
  is_active?: boolean;
  created_by?: 'admin' | 'user';
};

const allowedSourceTypes = new Set<LicenseIptvSourceType>([
  'm3u',
  'xtream',
  'manual',
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

function isAllowedSourceType(value: unknown): value is LicenseIptvSourceType {
  return typeof value === 'string' && allowedSourceTypes.has(value as LicenseIptvSourceType);
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

    let payload: CreateLicenseIptvSourceRequest;

    try {
      payload = (await request.json()) as CreateLicenseIptvSourceRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const licenseId = normalizeText(payload.license_id);
    const name = normalizeText(payload.name);
    const sourceUrl = normalizeText(payload.source_url);
    const hasType = Object.prototype.hasOwnProperty.call(payload, 'type');
    const hasIsActive = Object.prototype.hasOwnProperty.call(payload, 'is_active');
    const type = hasType ? payload.type : 'm3u';
    const isActive = hasIsActive ? payload.is_active : true;
    const createdBy = 'admin';

    if (
      !licenseId ||
      !name ||
      !sourceUrl ||
      !isAllowedSourceType(type) ||
      typeof isActive !== 'boolean'
    ) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('*')
      .eq('id', licenseId)
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
        ownerId: typeof license.admin_owner_id === 'string' ? license.admin_owner_id : null,
      })
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    const { data: source, error: sourceError } = await supabaseAdmin
      .from('license_iptv_sources')
      .insert({
        license_id: licenseId,
        name,
        source_url: sourceUrl,
        type,
        is_active: isActive,
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (sourceError) {
      return jsonResponse(
        {
          ok: false,
          error: 'LICENSE_IPTV_SOURCE_CREATE_FAILED',
          details: sourceError.message,
        },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: 'license_iptv_source_created',
      entity: 'license_iptv_sources',
      entity_id: source.id,
      metadata: {
        licenseId: license.id,
        sourceId: source.id,
        sourceType: source.type,
        isActive: source.is_active,
        createdBy: source.created_by,
      },
    });

    return jsonResponse(
      {
        ok: true,
        source,
      },
      201,
    );
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
