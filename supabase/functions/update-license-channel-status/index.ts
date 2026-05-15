import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminRole = 'admin' | 'super_admin';

type UpdateLicenseChannelStatusRequest = {
  channelId?: unknown;
  isActive?: unknown;
};

type LicenseChannelCacheRecord = {
  id: string;
  license_id: string;
  license_iptv_source_id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
};

type LicenseRecord = {
  id: string;
  license_code: string;
  admin_owner_id: string | null;
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

function getAuditAction(isActive: boolean) {
  return isActive
    ? 'license_channel_manually_activated'
    : 'license_channel_manually_deactivated';
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

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
      .from('admin_profiles')
      .select('id, role, is_active')
      .eq('id', actor.id)
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
      actorProfile.is_active !== true ||
      (actorProfile.role !== 'admin' && actorProfile.role !== 'super_admin')
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    let payload: UpdateLicenseChannelStatusRequest;

    try {
      payload = (await request.json()) as UpdateLicenseChannelStatusRequest;
    } catch {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const channelId =
      typeof payload.channelId === 'string' ? normalizeText(payload.channelId) : null;
    const nextIsActive = payload.isActive;

    if (!channelId || typeof nextIsActive !== 'boolean') {
      return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
    }

    const { data: existingChannel, error: existingChannelError } =
      await supabaseAdmin
        .from('license_channels_cache')
        .select('id, license_id, license_iptv_source_id, name, is_active, updated_at')
        .eq('id', channelId)
        .maybeSingle();

    if (existingChannelError) {
      return jsonResponse(
        {
          ok: false,
          error: 'SERVER_ERROR',
          details: existingChannelError.message,
        },
        500,
      );
    }

    if (!existingChannel) {
      return jsonResponse({ ok: false, error: 'LICENSE_CHANNEL_NOT_FOUND' }, 404);
    }

    const typedChannel = existingChannel as LicenseChannelCacheRecord;

    const { data: license, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, license_code, admin_owner_id')
      .eq('id', typedChannel.license_id)
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

    const typedLicense = license as LicenseRecord;

    if (
      !canManageLicense({
        actorId: actor.id,
        actorRole: actorProfile.role as AdminRole,
        ownerId: typedLicense.admin_owner_id,
      })
    ) {
      return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403);
    }

    if (typedChannel.is_active === nextIsActive) {
      return jsonResponse({
        ok: true,
        channel: {
          id: typedChannel.id,
          name: typedChannel.name,
          is_active: typedChannel.is_active,
          updated_at: typedChannel.updated_at,
        },
      });
    }

    const { data: updatedChannel, error: updateChannelError } =
      await supabaseAdmin
        .from('license_channels_cache')
        .update({
          is_active: nextIsActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', channelId)
        .select('id, name, is_active, updated_at')
        .single();

    if (updateChannelError) {
      return jsonResponse(
        {
          ok: false,
          error: 'LICENSE_CHANNEL_STATUS_UPDATE_FAILED',
          details: updateChannelError.message,
        },
        500,
      );
    }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      action: getAuditAction(updatedChannel.is_active),
      entity: 'license_channels_cache',
      entity_id: updatedChannel.id,
      metadata: {
        channelId: updatedChannel.id,
        channelName: updatedChannel.name,
        licenseId: typedLicense.id,
        licenseCode: typedLicense.license_code,
        sourceId: typedChannel.license_iptv_source_id,
        previousIsActive: typedChannel.is_active,
        nextIsActive: updatedChannel.is_active,
      },
    });

    return jsonResponse({
      ok: true,
      channel: updatedChannel,
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
