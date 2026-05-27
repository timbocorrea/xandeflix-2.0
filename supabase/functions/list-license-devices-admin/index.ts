import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type LicenseDeviceRow = {
  id: string;
  license_id: string;
  device_identifier: string;
  device_name: string | null;
  platform: string | null;
  is_active: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
};

type LicenseRow = {
  id: string;
  license_code: string | null;
  client_id: string | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  billing_cycle?: string | null;
  plan_interval?: string | null;
  plan_name?: string | null;
  subscription_interval?: string | null;
};

type ClientRow = {
  id: string;
  name: string | null;
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

function serializeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function daysSince(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) {
    return false;
  }

  const timestamp = new Date(expiresAt).getTime();

  return !Number.isNaN(timestamp) && timestamp < Date.now();
}

function normalizePlanInterval(license: LicenseRow | null) {
  if (!license) {
    return 'unknown';
  }

  const raw = [
    license.billing_cycle,
    license.plan_interval,
    license.plan_name,
    license.subscription_interval,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/mensal|month|monthly/.test(raw)) {
    return 'monthly';
  }

  if (/trimestral|quarter|quarterly|3\s*mes/.test(raw)) {
    return 'quarterly';
  }

  if (/semestral|semi|6\s*mes/.test(raw)) {
    return 'semiannual';
  }

  if (/anual|annual|year|yearly|12\s*mes/.test(raw)) {
    return 'annual';
  }

  return 'unknown';
}

function classifyDevice(device: LicenseDeviceRow, license: LicenseRow | null) {
  const lastSeenDays = daysSince(device.last_seen_at);
  const licenseExpired = isExpired(license?.expires_at ?? null);
  const planInterval = normalizePlanInterval(license);

  if (planInterval === 'monthly' && licenseExpired) {
    return {
      status: 'expired',
      label: 'Vencido',
      removable: true,
    };
  }

  const isLongTermPlan =
    planInterval === 'quarterly' ||
    planInterval === 'semiannual' ||
    planInterval === 'annual' ||
    planInterval === 'unknown';

  if (isLongTermPlan && !licenseExpired && (lastSeenDays === null || lastSeenDays > 30)) {
    return {
      status: 'idle',
      label: 'Ocioso/Inativo',
      removable: true,
    };
  }

  if (!device.is_active) {
    return {
      status: 'inactive',
      label: 'Inativo',
      removable: true,
    };
  }

  return {
    status: 'active',
    label: 'Ativo recente',
    removable: false,
  };
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

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: devicesData, error: devicesError } = await supabaseAdmin
      .from('license_devices')
      .select('*')
      .order('created_at', { ascending: false });

    if (devicesError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: devicesError.message }, 500);
    }

    const devices = (devicesData ?? []) as LicenseDeviceRow[];
    const licenseIds = Array.from(new Set(devices.map((device) => device.license_id)));

    const { data: licensesData, error: licensesError } = licenseIds.length
      ? await supabaseAdmin.from('licenses').select('*').in('id', licenseIds)
      : { data: [], error: null };

    if (licensesError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: licensesError.message }, 500);
    }

    const licenses = (licensesData ?? []) as LicenseRow[];
    const clientIds = Array.from(
      new Set(
        licenses
          .map((license) => license.client_id)
          .filter((clientId): clientId is string => Boolean(clientId)),
      ),
    );

    const { data: clientsData, error: clientsError } = clientIds.length
      ? await supabaseAdmin.from('clients').select('id, name').in('id', clientIds)
      : { data: [], error: null };

    if (clientsError) {
      return jsonResponse({ ok: false, error: 'SERVER_ERROR', details: clientsError.message }, 500);
    }

    const licensesById = new Map(licenses.map((license) => [license.id, license]));
    const clientsById = new Map(((clientsData ?? []) as ClientRow[]).map((client) => [client.id, client]));

    const result = devices.map((device) => {
      const license = licensesById.get(device.license_id) ?? null;
      const client = license?.client_id ? clientsById.get(license.client_id) ?? null : null;
      const classification = classifyDevice(device, license);

      return {
        id: device.id,
        license_id: device.license_id,
        license_code: license?.license_code ?? null,
        client_id: license?.client_id ?? null,
        client_name: client?.name ?? null,
        device_identifier: device.device_identifier,
        device_name: device.device_name,
        platform: device.platform,
        is_active: device.is_active,
        first_seen_at: device.first_seen_at,
        last_seen_at: device.last_seen_at,
        created_at: device.created_at,
        license_status: license?.status ?? null,
        license_expires_at: license?.expires_at ?? null,
        plan_interval: normalizePlanInterval(license),
        last_seen_days: daysSince(device.last_seen_at),
        operational_status: classification.status,
        operational_label: classification.label,
        removable: classification.removable,
      };
    });

    return jsonResponse({ ok: true, devices: result });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: 'LIST_LICENSE_DEVICES_ADMIN_FAILED', details: serializeError(error) },
      500,
    );
  }
});
