import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function serializeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;

    return JSON.stringify({
      code: record.code,
      message: record.message,
      details: record.details,
      hint: record.hint,
      name: record.name,
    });
  }

  return String(error);
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR' }, 500);
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
      .select('id, license_code, status')
      .eq('id', licenseId)
      .maybeSingle();

    if (licenseError) {
      return jsonResponse(
        { ok: false, error: 'SERVER_ERROR', details: licenseError.message },
        500,
      );
    }

    if (!license) {
      return jsonResponse({ ok: false, error: 'LICENSE_NOT_FOUND' }, 404);
    }

    const now = new Date().toISOString();

    const { data: existingDevice, error: existingDeviceError } = await supabaseAdmin
      .from('license_devices')
      .select('*')
      .eq('license_id', licenseId)
      .eq('device_identifier', deviceIdentifier)
      .maybeSingle();

    if (existingDeviceError) {
      return jsonResponse(
        { ok: false, error: 'SERVER_ERROR', details: existingDeviceError.message },
        500,
      );
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
        return jsonResponse(
          { ok: false, error: 'SERVER_ERROR', details: updateDeviceError.message },
          500,
        );
      }

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
      return jsonResponse(
        { ok: false, error: 'SERVER_ERROR', details: createDeviceError.message },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'license_device_created',
      entity: 'license_devices',
      entity_id: createdDevice.id,
      metadata: {
        licenseId,
        licenseCode: license.license_code,
        deviceIdentifier,
      },
    });

    return jsonResponse({
      ok: true,
      device: createdDevice,
      alreadyExisted: false,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: 'CREATE_LICENSE_DEVICE_FAILED',
        details: serializeErrorDetails(error),
      },
      500,
    );
  }
});
