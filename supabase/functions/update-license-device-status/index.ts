import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';

type UpdateLicenseDeviceStatusRequest = {
  deviceId?: string;
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

    let payload: UpdateLicenseDeviceStatusRequest;

    try {
      payload = (await request.json()) as UpdateLicenseDeviceStatusRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const deviceId = normalizeText(payload.deviceId);
    const nextIsActive = payload.isActive;

    if (!deviceId || typeof nextIsActive !== 'boolean') {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingDevice, error: existingDeviceError } =
      await supabaseAdmin
        .from('license_devices')
        .select('*')
        .eq('id', deviceId)
        .maybeSingle();

    if (existingDeviceError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: existingDeviceError.message,
        },
        500,
      );
    }

    if (!existingDevice) {
      return jsonResponse({ ok: false, error: 'LICENSE_DEVICE_NOT_FOUND' }, 404);
    }

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, admin_owner_id')
      .eq('id', existingDevice.license_id)
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

    if (existingDevice.is_active === nextIsActive) {
      return jsonResponse({
        ok: true,
        device: existingDevice,
      });
    }

    const { data: updatedDevice, error: updateDeviceError } =
      await supabaseAdmin
        .from('license_devices')
        .update({
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deviceId)
        .select('*')
        .single();

    if (updateDeviceError) {
      return jsonResponse(
        {
          ok: false,
          error: 'LICENSE_DEVICE_STATUS_UPDATE_FAILED',
          details: updateDeviceError.message,
        },
        500,
      );
    }

    const action = nextIsActive ? 'activate' : 'deactivate';

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: nextIsActive
        ? 'license_device_activated'
        : 'license_device_deactivated',
      entity: 'license_devices',
      entity_id: updatedDevice.id,
      metadata: {
        licenseId: license.id,
        licenseCode: license.license_code,
        deviceId: updatedDevice.id,
        deviceIdentifier: updatedDevice.device_identifier,
        previousIsActive: existingDevice.is_active,
        nextIsActive: updatedDevice.is_active,
        action,
      },
    });

    return jsonResponse({
      ok: true,
      device: updatedDevice,
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
