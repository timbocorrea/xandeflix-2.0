import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';
type LicenseIptvSourceType = 'm3u' | 'xtream' | 'manual';

type UpdateLicenseIptvSourceRequest = {
  sourceId?: string;
  name?: string;
  source_url?: string;
  type?: LicenseIptvSourceType;
  is_active?: boolean;
};

type LicenseIptvSourceField = 'name' | 'source_url' | 'type' | 'is_active';
type LicenseIptvSourceValues = Record<LicenseIptvSourceField, string | boolean>;

const allowedSourceTypes = new Set<LicenseIptvSourceType>([
  'm3u',
  'xtream',
  'manual',
]);

const editableFields: LicenseIptvSourceField[] = [
  'name',
  'source_url',
  'type',
  'is_active',
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

function getChangedFields(
  previousValues: LicenseIptvSourceValues,
  nextValues: LicenseIptvSourceValues,
) {
  return editableFields.filter((field) => previousValues[field] !== nextValues[field]);
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

    let payload: UpdateLicenseIptvSourceRequest;

    try {
      payload = (await request.json()) as UpdateLicenseIptvSourceRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const sourceId = normalizeText(payload.sourceId);

    if (!sourceId) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const hasName = Object.prototype.hasOwnProperty.call(payload, 'name');
    const hasSourceUrl = Object.prototype.hasOwnProperty.call(payload, 'source_url');
    const hasType = Object.prototype.hasOwnProperty.call(payload, 'type');
    const hasIsActive = Object.prototype.hasOwnProperty.call(payload, 'is_active');

    const name = hasName ? normalizeText(payload.name) : null;
    const sourceUrl = hasSourceUrl ? normalizeText(payload.source_url) : null;

    if (
      (hasName && !name) ||
      (hasSourceUrl && !sourceUrl) ||
      (hasType && !isAllowedSourceType(payload.type)) ||
      (hasIsActive && typeof payload.is_active !== 'boolean')
    ) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingSource, error: existingSourceError } =
      await supabaseAdmin
        .from('license_iptv_sources')
        .select('*')
        .eq('id', sourceId)
        .maybeSingle();

    if (existingSourceError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: existingSourceError.message,
        },
        500,
      );
    }

    if (!existingSource) {
      return jsonResponse(
        { ok: false, error: 'LICENSE_IPTV_SOURCE_NOT_FOUND' },
        404,
      );
    }

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, admin_owner_id')
      .eq('id', existingSource.license_id)
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

    const previousValues: LicenseIptvSourceValues = {
      name: existingSource.name,
      source_url: existingSource.source_url,
      type: existingSource.type,
      is_active: existingSource.is_active,
    };

    const nextValues: LicenseIptvSourceValues = {
      name: hasName ? name as string : existingSource.name,
      source_url: hasSourceUrl ? sourceUrl as string : existingSource.source_url,
      type: hasType ? payload.type as LicenseIptvSourceType : existingSource.type,
      is_active: hasIsActive ? payload.is_active as boolean : existingSource.is_active,
    };

    const changedFields = getChangedFields(previousValues, nextValues);

    if (changedFields.length === 0) {
      return jsonResponse({
        ok: true,
        source: existingSource,
      });
    }

    const { data: updatedSource, error: updateSourceError } =
      await supabaseAdmin
        .from('license_iptv_sources')
        .update({
          ...nextValues,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sourceId)
        .select('*')
        .single();

    if (updateSourceError) {
      return jsonResponse(
        {
          ok: false,
          error: 'LICENSE_IPTV_SOURCE_UPDATE_FAILED',
          details: updateSourceError.message,
        },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: 'license_iptv_source_updated',
      entity: 'license_iptv_sources',
      entity_id: updatedSource.id,
      metadata: {
        licenseId: license.id,
        sourceId: updatedSource.id,
        sourceType: updatedSource.type,
        isActive: updatedSource.is_active,
        nameChanged: changedFields.includes('name'),
        sourceUrlChanged: changedFields.includes('source_url'),
        sourceTypeChanged: changedFields.includes('type'),
        statusChanged: changedFields.includes('is_active'),
      },
    });

    return jsonResponse({
      ok: true,
      source: updatedSource,
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
