import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';

type LicenseStatus = 'active' | 'inactive' | 'expired' | 'blocked' | 'canceled';

type LicenseStatusAction = Extract<LicenseStatus, 'active' | 'expired' | 'canceled'>;

type UpdateLicenseStatusRequest = {
  licenseId?: string;
  status?: LicenseStatus;
};

const allowedStatuses = new Set<LicenseStatus>([
  'active',
  'inactive',
  'expired',
  'blocked',
  'canceled',
]);

const allowedStatusActions = new Set<LicenseStatusAction>([
  'active',
  'expired',
  'canceled',
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

function canUpdateLicense({
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

function getAuditAction(status: LicenseStatusAction) {
  const actions: Record<LicenseStatusAction, string> = {
    active: 'license_reactivated',
    expired: 'license_expired',
    canceled: 'license_cancelled',
  };

  return actions[status];
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

    let payload: UpdateLicenseStatusRequest;

    try {
      payload = (await request.json()) as UpdateLicenseStatusRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const licenseId = normalizeText(payload.licenseId);
    const status = payload.status;

    if (!licenseId || !status || !allowedStatuses.has(status)) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    if (!allowedStatusActions.has(status as LicenseStatusAction)) {
      return jsonResponse({ ok: false, error: 'INVALID_LICENSE_STATUS_ACTION' }, 400);
    }

    const nextStatus = status as LicenseStatusAction;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingLicense, error: existingLicenseError } = await supabaseAdmin
      .from('licenses')
      .select('*')
      .eq('id', licenseId)
      .maybeSingle();

    if (existingLicenseError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: existingLicenseError.message,
        },
        500,
      );
    }

    if (!existingLicense) {
      return jsonResponse({ ok: false, error: 'LICENSE_NOT_FOUND' }, 404);
    }

    if (
      !canUpdateLicense({
        actorId: actor.id,
        actorRole: actorProfile.role,
        ownerId: existingLicense.admin_owner_id,
      })
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    if (existingLicense.status === nextStatus) {
      return jsonResponse({
        ok: true,
        license: existingLicense,
      });
    }

    const now = new Date().toISOString();

    const { data: updatedLicense, error: updateLicenseError } = await supabaseAdmin
      .from('licenses')
      .update({
        status: nextStatus,
        updated_at: now,
      })
      .eq('id', licenseId)
      .select('*')
      .single();

    if (updateLicenseError) {
      return jsonResponse(
        {
          ok: false,
          error: 'LICENSE_STATUS_UPDATE_FAILED',
          details: updateLicenseError.message,
        },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: getAuditAction(nextStatus),
      entity: 'licenses',
      entity_id: updatedLicense.id,
      metadata: {
        licenseId: updatedLicense.id,
        licenseCode: updatedLicense.license_code,
        previousStatus: existingLicense.status,
        nextStatus: updatedLicense.status,
      },
    });

    return jsonResponse({
      ok: true,
      license: updatedLicense,
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
