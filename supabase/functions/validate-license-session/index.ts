import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ValidateLicenseSessionRequest = {
  licenseCode?: string;
  deviceIdentifier?: string;
};

type LicenseRecord = {
  id: string;
  status: string;
  expires_at: string | null;
};

type LicenseDeviceRecord = {
  id: string;
};

type ValidationError =
  | 'INVALID_LICENSE'
  | 'LICENSE_BLOCKED'
  | 'LICENSE_EXPIRED'
  | 'DEVICE_NOT_ACTIVATED'
  | 'INVALID_REQUEST'
  | 'SERVER_ERROR';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

const corsBaseHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

function readAllowedOrigins() {
  const allowedOrigins = new Set(DEFAULT_ALLOWED_ORIGINS);
  const envValues = [
    Deno.env.get('APP_ALLOWED_ORIGINS'),
    Deno.env.get('ALLOWED_ORIGINS'),
  ];

  for (const envValue of envValues) {
    for (const origin of envValue?.split(',') ?? []) {
      const normalizedOrigin = origin.trim();

      if (normalizedOrigin && normalizedOrigin !== '*') {
        allowedOrigins.add(normalizedOrigin);
      }
    }
  }

  return allowedOrigins;
}

function resolveCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = { ...corsBaseHeaders };

  if (origin && readAllowedOrigins().has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...resolveCorsHeaders(request),
      'Content-Type': 'application/json',
    },
  });
}

function validationError(
  request: Request,
  error: ValidationError,
  status = 400,
) {
  return jsonResponse(
    request,
    {
      ok: false,
      valid: false,
      error,
    },
    status,
  );
}

function normalizeLicenseCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase();

  return normalized ? normalized : null;
}

function normalizeDeviceIdentifier(value?: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;

  const expiresAtTime = new Date(expiresAt).getTime();

  if (!Number.isFinite(expiresAtTime)) {
    return true;
  }

  return expiresAtTime < Date.now();
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;

    return typeof code === 'string' ? code : 'unknown';
  }

  return 'unknown';
}

function logSanitizedError(event: string, error?: unknown) {
  console.error('[validate-license-session]', {
    event,
    code: error ? getErrorCode(error) : undefined,
  });
}

function isBlockedLicenseStatus(status: string) {
  return [
    'blocked',
    'canceled',
    'cancelled',
    'revoked',
    'inactive',
    'expired',
  ].includes(status.trim().toLowerCase());
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: resolveCorsHeaders(request) });
  }

  if (request.method !== 'POST') {
    return validationError(request, 'INVALID_REQUEST', 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      logSanitizedError('missing-env');
      return validationError(request, 'SERVER_ERROR', 500);
    }

    let payload: ValidateLicenseSessionRequest;

    try {
      payload = (await request.json()) as ValidateLicenseSessionRequest;
    } catch {
      return validationError(request, 'INVALID_REQUEST', 400);
    }

    const licenseCode = normalizeLicenseCode(payload.licenseCode);
    const deviceIdentifier = normalizeDeviceIdentifier(payload.deviceIdentifier);

    if (!licenseCode || !deviceIdentifier) {
      return validationError(request, 'INVALID_REQUEST', 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, status, expires_at')
      .eq('license_code', licenseCode)
      .maybeSingle();

    if (licenseError) {
      logSanitizedError('license-query-failed', licenseError);
      return validationError(request, 'SERVER_ERROR', 500);
    }

    if (!license) {
      return validationError(request, 'INVALID_LICENSE', 404);
    }

    const licenseRecord = license as LicenseRecord;
    const normalizedStatus = licenseRecord.status.trim().toLowerCase();

    if (normalizedStatus !== 'active' || isBlockedLicenseStatus(normalizedStatus)) {
      return validationError(
        request,
        normalizedStatus === 'expired' ? 'LICENSE_EXPIRED' : 'LICENSE_BLOCKED',
        403,
      );
    }

    if (isExpired(licenseRecord.expires_at)) {
      return validationError(request, 'LICENSE_EXPIRED', 403);
    }

    const { data: device, error: deviceError } = await supabaseAdmin
      .from('license_devices')
      .select('id')
      .eq('license_id', licenseRecord.id)
      .eq('device_identifier', deviceIdentifier)
      .eq('is_active', true)
      .maybeSingle();

    if (deviceError) {
      logSanitizedError('device-query-failed', deviceError);
      return validationError(request, 'SERVER_ERROR', 500);
    }

    if (!device) {
      return validationError(request, 'DEVICE_NOT_ACTIVATED', 403);
    }

    const deviceRecord = device as LicenseDeviceRecord;

    return jsonResponse(request, {
      ok: true,
      valid: true,
      license: {
        id: licenseRecord.id,
        status: licenseRecord.status,
        expiresAt: licenseRecord.expires_at,
      },
      device: {
        id: deviceRecord.id,
      },
    });
  } catch (error) {
    logSanitizedError('unexpected-error', error);
    return validationError(request, 'SERVER_ERROR', 500);
  }
});
