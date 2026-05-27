import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ActivateLicenseRequest = {
  licenseCode?: string;
  deviceIdentifier?: string;
  deviceName?: string;
  platform?: string;
  manufacturer?: string;
  model?: string;
  appVersion?: string;
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

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function serializeLicense(license: {
  id: string;
  license_code: string;
  status: string;
  expires_at: string | null;
  max_devices: number;
  max_concurrent_streams: number;
  allow_user_manage_sources: boolean;
}) {
  return {
    id: license.id,
    licenseCode: license.license_code,
    status: license.status,
    expiresAt: license.expires_at,
    maxDevices: license.max_devices,
    maxConcurrentStreams: license.max_concurrent_streams,
    allowUserManageSources: license.allow_user_manage_sources,
  };
}

function serializeDevice(device: {
  id: string;
  device_identifier: string;
  is_active: boolean;
}) {
  return {
    id: device.id,
    deviceIdentifier: device.device_identifier,
    isActive: device.is_active,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'INVALID_METHOD' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR' }, 500);
    }

    let payload: ActivateLicenseRequest;

    try {
      payload = (await request.json()) as ActivateLicenseRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const licenseCode = payload.licenseCode?.trim().toUpperCase();
    const deviceIdentifier = payload.deviceIdentifier?.trim();

    if (!licenseCode || !deviceIdentifier) {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, status, expires_at, max_devices, max_concurrent_streams, allow_user_manage_sources')
      .eq('license_code', licenseCode)
      .maybeSingle();

    if (licenseError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: licenseError.message }, 500);
    }

    if (!license) {
      return jsonResponse({ ok: false, error: 'LICENSE_NOT_FOUND' }, 404);
    }

    if (license.status === 'blocked') {
      return jsonResponse({ ok: false, error: 'LICENSE_BLOCKED' }, 403);
    }

    if (license.status !== 'active') {
      return jsonResponse({ ok: false, error: 'LICENSE_INACTIVE' }, 403);
    }

    if (isExpired(license.expires_at)) {
      return jsonResponse({ ok: false, error: 'LICENSE_EXPIRED' }, 403);
    }

    const now = new Date().toISOString();

    const { data: existingDevice, error: existingDeviceError } = await supabaseAdmin
      .from('license_devices')
      .select('id, device_identifier, is_active')
      .eq('license_id', license.id)
      .eq('device_identifier', deviceIdentifier)
      .maybeSingle();

    if (existingDeviceError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: existingDeviceError.message }, 500);
    }

    if (existingDevice) {
      const { data: updatedDevice, error: updateDeviceError } = await supabaseAdmin
        .from('license_devices')
        .update({
          device_name: normalizeText(payload.deviceName),
          platform: normalizeText(payload.platform),
          manufacturer: normalizeText(payload.manufacturer),
          model: normalizeText(payload.model),
          app_version: normalizeText(payload.appVersion),
          is_active: true,
          last_seen_at: now,
        })
        .eq('id', existingDevice.id)
        .select('id, device_identifier, is_active')
        .single();

      if (updateDeviceError) {
        return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: updateDeviceError.message }, 500);
      }

      return jsonResponse({
        ok: true,
        license: serializeLicense(license),
        device: serializeDevice(updatedDevice),
      });
    }

    /**
     * Regra de negócio:
     * A licença sozinha não autoriza um novo aparelho.
     * O dispositivo deve estar previamente vinculado à licença pelo Admin.
     */
    return jsonResponse(
      {
        ok: false,
        error: 'DEVICE_NOT_PREAUTHORIZED',
        details:
          'Este dispositivo não está pré-vinculado a esta licença. Solicite autorização no painel administrativo.',
      },
      403,
    );
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'SERVER_ERROR',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
