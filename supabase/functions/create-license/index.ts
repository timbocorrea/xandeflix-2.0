import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type LicensePlanType = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

type CreateLicenseRequest = {
  license_code?: string;
  label?: string | null;
  plan_type?: LicensePlanType;
  expires_at?: string | null;
  max_devices?: number;
  max_concurrent_streams?: number;
  allow_user_manage_sources?: boolean;
  notes?: string | null;
};

const allowedPlanTypes = new Set<LicensePlanType>([
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
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

function normalizeLicenseCode(value?: string | null) {
  const normalized = normalizeText(value);

  return normalized ? normalized.toUpperCase() : null;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const [scheme, token] = authorization.trim().split(/\s+/);

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function isAllowedPlanType(value: unknown): value is LicensePlanType {
  return typeof value === 'string' && allowedPlanTypes.has(value as LicensePlanType);
}

function getPositiveInteger(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1) {
    return null;
  }

  return Number(value);
}

function normalizeOptionalTimestamp(value?: string | null) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  if (Number.isNaN(Date.parse(normalized))) {
    return null;
  }

  return normalized;
}

function isUniqueLicenseCodeError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';

  return (
    error.code === '23505' ||
    (message.includes('duplicate') && message.includes('license_code'))
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

    let payload: CreateLicenseRequest;

    try {
      payload = (await request.json()) as CreateLicenseRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const licenseCode = normalizeLicenseCode(payload.license_code);
    const label = normalizeText(payload.label);
    const expiresAt = normalizeOptionalTimestamp(payload.expires_at);
    const maxDevices = getPositiveInteger(payload.max_devices);
    const maxConcurrentStreams = getPositiveInteger(
      payload.max_concurrent_streams,
    );
    const notes = normalizeText(payload.notes);

    if (
      !licenseCode ||
      !isAllowedPlanType(payload.plan_type) ||
      maxDevices === null ||
      maxConcurrentStreams === null ||
      typeof payload.allow_user_manage_sources !== 'boolean' ||
      (normalizeText(payload.expires_at) !== null && expiresAt === null)
    ) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: createdLicense, error: createLicenseError } =
      await supabaseAdmin
        .from('licenses')
        .insert({
          admin_owner_id: actor.id,
          license_code: licenseCode,
          label,
          status: 'active',
          plan_type: payload.plan_type,
          expires_at: expiresAt,
          max_devices: maxDevices,
          max_concurrent_streams: maxConcurrentStreams,
          allow_user_manage_sources: payload.allow_user_manage_sources,
          notes,
        })
        .select('*')
        .single();

    if (createLicenseError) {
      if (isUniqueLicenseCodeError(createLicenseError)) {
        return jsonResponse(
          {
            ok: false,
            error: 'LICENSE_CODE_ALREADY_EXISTS',
            details: createLicenseError.message,
          },
          409,
        );
      }

      return jsonResponse(
        {
          ok: false,
          error: 'LICENSE_CREATE_FAILED',
          details: createLicenseError.message,
        },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: 'license_created',
      entity: 'licenses',
      entity_id: createdLicense.id,
      metadata: {
        licenseId: createdLicense.id,
        licenseCode: createdLicense.license_code,
        status: createdLicense.status,
        planType: createdLicense.plan_type,
        expiresAt: createdLicense.expires_at,
        maxDevices: createdLicense.max_devices,
        maxConcurrentStreams: createdLicense.max_concurrent_streams,
        allowUserManageSources: createdLicense.allow_user_manage_sources,
      },
    });

    return jsonResponse(
      {
        ok: true,
        license: createdLicense,
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
