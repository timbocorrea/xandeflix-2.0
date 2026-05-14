import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type RegisterAppInstallationRequest = {
  deviceIdentifier?: string;
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

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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

    let payload: RegisterAppInstallationRequest;

    try {
      payload = (await request.json()) as RegisterAppInstallationRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const deviceIdentifier = normalizeText(payload.deviceIdentifier);

    if (!deviceIdentifier) {
      return jsonResponse({ ok: false, error: 'DEVICE_IDENTIFIER_REQUIRED' }, 400);
    }

    const now = new Date().toISOString();

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingInstallation, error: existingInstallationError } = await supabaseAdmin
      .from('app_installations')
      .select('id, installation_status, linked_license_id, linked_license_device_id')
      .eq('device_identifier', deviceIdentifier)
      .maybeSingle();

    if (existingInstallationError) {
      return jsonResponse({
        ok: false,
        error: 'APP_INSTALLATION_LOOKUP_FAILED',
        details: existingInstallationError.message,
      }, 500);
    }

    const preservedStatuses = [
      'activated',
      'blocked',
      'pending_uninstall',
      'manually_marked_uninstalled',
    ];

    const installationStatus =
      existingInstallation && preservedStatuses.includes(existingInstallation.installation_status)
        ? existingInstallation.installation_status
        : 'awaiting_activation';

    const installationPayload = {
      device_identifier: deviceIdentifier,
      platform: normalizeText(payload.platform),
      manufacturer: normalizeText(payload.manufacturer),
      model: normalizeText(payload.model),
      app_version: normalizeText(payload.appVersion),
      last_seen_at: now,
      installation_status: installationStatus,
      linked_license_id: existingInstallation?.linked_license_id ?? null,
      linked_license_device_id: existingInstallation?.linked_license_device_id ?? null,
      updated_at: now,
    };

    const { data: installation, error: upsertError } = await supabaseAdmin
      .from('app_installations')
      .upsert(installationPayload, {
        onConflict: 'device_identifier',
      })
      .select(
        'id, device_identifier, installation_status, platform, manufacturer, model, app_version, first_seen_at, last_seen_at, linked_license_id, linked_license_device_id, created_at, updated_at',
      )
      .single();

    if (upsertError) {
      return jsonResponse({
        ok: false,
        error: 'APP_INSTALLATION_REGISTER_FAILED',
        details: upsertError.message,
      }, 500);
    }

    return jsonResponse({
      ok: true,
      installation,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'SERVER_ERROR',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
