import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type GetAuthorizedIptvSourceRequest = {
  deviceIdentifier?: string;
};

type AuthorizedSourceResponse = {
  ok: true;
  client: {
    id: string;
    name: string;
    status: string;
    expiresAt: string | null;
  };
  device: {
    id: string;
    name: string | null;
    identifier: string | null;
    platform: string | null;
  };
  source: {
    id: string;
    name: string;
    type: 'm3u' | 'xtream' | 'manual';
    url: string;
  };
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
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() < Date.now();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      {
        ok: false,
        error: 'Método não permitido.',
      },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          ok: false,
          error: 'Variáveis de ambiente Supabase não configuradas.',
        },
        500,
      );
    }

    const authorization = request.headers.get('Authorization');

    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse(
        {
          ok: false,
          error: 'Token de autenticação não informado.',
        },
        401,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authorization.replace('Bearer ', '');

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(
        {
          ok: false,
          error: 'Usuário não autenticado.',
          details: userError?.message,
        },
        401,
      );
    }

    let payload: GetAuthorizedIptvSourceRequest;

    try {
      payload = (await request.json()) as GetAuthorizedIptvSourceRequest;
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'Payload inválido.',
        },
        400,
      );
    }

    const deviceIdentifier = payload.deviceIdentifier?.trim();

    if (!deviceIdentifier) {
      return jsonResponse(
        {
          ok: false,
          error: 'deviceIdentifier é obrigatório.',
        },
        400,
      );
    }

    const { data: device, error: deviceError } = await supabaseAdmin
      .from('devices')
      .select('id, client_id, device_name, device_identifier, platform, is_active')
      .eq('device_identifier', deviceIdentifier)
      .maybeSingle();

    if (deviceError) {
      return jsonResponse(
        {
          ok: false,
          error: 'Não foi possível consultar o dispositivo.',
          details: deviceError.message,
        },
        500,
      );
    }

    if (!device) {
      return jsonResponse(
        {
          ok: false,
          error: 'Dispositivo não autorizado.',
        },
        403,
      );
    }

    if (!device.is_active) {
      return jsonResponse(
        {
          ok: false,
          error: 'Dispositivo bloqueado ou inativo.',
        },
        403,
      );
    }

    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, name, status, expires_at')
      .eq('id', device.client_id)
      .maybeSingle();

    if (clientError) {
      return jsonResponse(
        {
          ok: false,
          error: 'Não foi possível consultar o cliente.',
          details: clientError.message,
        },
        500,
      );
    }

    if (!client) {
      return jsonResponse(
        {
          ok: false,
          error: 'Cliente não encontrado.',
        },
        403,
      );
    }

    if (client.status !== 'active') {
      return jsonResponse(
        {
          ok: false,
          error: 'Cliente inativo, expirado ou bloqueado.',
          status: client.status,
        },
        403,
      );
    }

    if (isExpired(client.expires_at)) {
      return jsonResponse(
        {
          ok: false,
          error: 'Acesso do cliente expirado.',
        },
        403,
      );
    }

    const { data: source, error: sourceError } = await supabaseAdmin
      .from('iptv_sources')
      .select('id, name, source_url, type, is_active')
      .eq('client_id', client.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sourceError) {
      return jsonResponse(
        {
          ok: false,
          error: 'Não foi possível consultar a fonte IPTV.',
          details: sourceError.message,
        },
        500,
      );
    }

    if (!source) {
      return jsonResponse(
        {
          ok: false,
          error: 'Nenhuma fonte IPTV ativa vinculada ao cliente.',
        },
        404,
      );
    }

    await supabaseAdmin
      .from('devices')
      .update({
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', device.id);

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: user.id,
      action: 'resolve_authorized_iptv_source',
      entity: 'iptv_sources',
      entity_id: source.id,
      metadata: {
        client_id: client.id,
        device_id: device.id,
        device_identifier: device.device_identifier,
        source_type: source.type,
      },
    });

    const body: AuthorizedSourceResponse = {
      ok: true,
      client: {
        id: client.id,
        name: client.name,
        status: client.status,
        expiresAt: client.expires_at,
      },
      device: {
        id: device.id,
        name: device.device_name,
        identifier: device.device_identifier,
        platform: device.platform,
      },
      source: {
        id: source.id,
        name: source.name,
        type: source.type,
        url: source.source_url,
      },
    };

    return jsonResponse(body);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: 'Erro interno ao resolver fonte IPTV autorizada.',
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
