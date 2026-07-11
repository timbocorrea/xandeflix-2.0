import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';

type CreateLicenseDeviceRequest = {
  licenseId?: string;
  deviceIdentifier?: string;
  deviceName?: string | null;
  platform?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  appVersion?: string | null;
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

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;

    return typeof code === 'string' ? code : 'unknown';
  }

  return 'unknown';
}

function logSanitizedError(event: string, error?: unknown) {
  console.error('[create-license-device]', {
    event,
    code: error ? getErrorCode(error) : undefined,
  });
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
      logSanitizedError('missing-env');
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
      logSanitizedError('actor-profile-query-failed', actorProfileError);
      return jsonResponse({ ok: false, error: 'SERVER_ERROR' }, 500);
    }

    if (
      !actorProfile ||
      (actorProfile.role !== 'admin' && actorProfile.role !== 'super_admin')
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    let payload: CreateLicenseDeviceRequest;

    try {
      payload = (await request.json()) as CreateLicenseDeviceRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const licenseId = normalizeText(payload.licenseId);
    const deviceIdentifier = normalizeText(payload.deviceIdentifier);

    if (!licenseId || !deviceIdentifier) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, status, admin_owner_id')
      .eq('id', licenseId)
      .maybeSingle();

    if (licenseError) {
      logSanitizedError('license-query-failed', licenseError);
      return jsonResponse({ ok: false, error: 'SERVER_ERROR' }, 500);
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

    const now = new Date().toISOString();

    const { data: existingDevice, error: existingDeviceError } = await supabaseAdmin
      .from('license_devices')
      .select('*')
      .eq('license_id', licenseId)
      .eq('device_identifier', deviceIdentifier)
      .maybeSingle();

    if (existingDeviceError) {
      logSanitizedError('existing-device-query-failed', existingDeviceError);
      return jsonResponse({ ok: false, error: 'SERVER_ERROR' }, 500);
    }

    if (existingDevice) {
      const { data: updatedDevice, error: updateDeviceError } = await supabaseAdmin
        .from('license_devices')
        .update({
          device_name: normalizeText(payload.deviceName) ?? existingDevice.device_name,
          platform: normalizeText(payload.platform) ?? existingDevice.platform,
          manufacturer:
            normalizeText(payload.manufacturer) ?? existingDevice.manufacturer,
          model: normalizeText(payload.model) ?? existingDevice.model,
          app_version: normalizeText(payload.appVersion) ?? existingDevice.app_version,
          is_active: payload.isActive ?? existingDevice.is_active,
          updated_at: now,
        })
        .eq('id', existingDevice.id)
        .select('*')
        .single();

      if (updateDeviceError) {
        logSanitizedError('device-update-failed', updateDeviceError);
        return jsonResponse(
          { ok: false, error: 'LICENSE_DEVICE_UPDATE_FAILED' },
          500,
        );
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: actor.id,
        action: 'license_device_updated',
        entity: 'license_devices',
        entity_id: updatedDevice.id,
        metadata: {
          licenseId,
          licenseCode: license.license_code,
          deviceId: updatedDevice.id,
          deviceIdentifier,
          alreadyExisted: true,
        },
      });

      return jsonResponse({
        ok: true,
        device: updatedDevice,
        alreadyExisted: true,
      });
    }

    const { data: createdDevice, error: createDeviceError } = await supabaseAdmin
      .from('license_devices')
      .insert({
        license_id: licenseId,
        device_identifier: deviceIdentifier,
        device_name: normalizeText(payload.deviceName),
        platform: normalizeText(payload.platform),
        manufacturer: normalizeText(payload.manufacturer),
        model: normalizeText(payload.model),
        app_version: normalizeText(payload.appVersion),
        is_active: payload.isActive ?? true,
        first_seen_at: now,
        last_seen_at: null,
      })
      .select('*')
      .single();

    if (createDeviceError) {
      logSanitizedError('device-create-failed', createDeviceError);
      return jsonResponse(
        { ok: false, error: 'LICENSE_DEVICE_CREATE_FAILED' },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: 'license_device_created',
      entity: 'license_devices',
      entity_id: createdDevice.id,
      metadata: {
        licenseId,
        licenseCode: license.license_code,
        deviceId: createdDevice.id,
        deviceIdentifier,
        alreadyExisted: false,
      },
    });

    return jsonResponse({
      ok: true,
      device: createdDevice,
      alreadyExisted: false,
    });
  } catch (error) {
    logSanitizedError('unexpected-error', error);

    return jsonResponse(
      {
        ok: false,
        error: 'CREATE_LICENSE_DEVICE_FAILED',
      },
      500,
    );
  }
});
