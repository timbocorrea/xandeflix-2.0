import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SyncIptvSourceRequest = {
  sourceId?: string;
};

type IptvSource = {
  id: string;
  name: string;
  source_url: string;
  type: 'm3u' | 'xtream' | 'manual';
  is_active: boolean;
};

type ParsedChannel = {
  iptv_source_id: string;
  name: string;
  logo_url: string | null;
  group_title: string | null;
  stream_url: string;
  tvg_id: string | null;
  sort_order: number;
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

function parseAttributes(line: string) {
  const attributes: Record<string, string> = {};
  const attributeRegex = /([\w-]+)="([^"]*)"/g;

  for (const match of line.matchAll(attributeRegex)) {
    const [, key, value] = match;

    if (key) {
      attributes[key] = value ?? '';
    }
  }

  return attributes;
}

function parseChannelName(line: string) {
  const commaIndex = line.lastIndexOf(',');

  if (commaIndex === -1) {
    return undefined;
  }

  return line.slice(commaIndex + 1).trim() || undefined;
}

function isPlayableUrl(line: string) {
  const normalizedLine = line.trim().toLowerCase();

  return (
    normalizedLine.startsWith('http://') ||
    normalizedLine.startsWith('https://') ||
    normalizedLine.startsWith('rtmp://') ||
    normalizedLine.startsWith('rtsp://')
  );
}

function parseM3u(content: string, sourceId: string): ParsedChannel[] {
  const channels: ParsedChannel[] = [];
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let pendingMetadata: {
    name?: string;
    logo?: string;
    groupTitle?: string;
    tvgId?: string;
    tvgName?: string;
  } | null = null;

  for (const line of lines) {
    if (line.startsWith('#EXTINF')) {
      const attributes = parseAttributes(line);

      pendingMetadata = {
        name: parseChannelName(line),
        logo: attributes['tvg-logo'],
        groupTitle: attributes['group-title'],
        tvgId: attributes['tvg-id'],
        tvgName: attributes['tvg-name'],
      };

      continue;
    }

    if (line.startsWith('#') || !isPlayableUrl(line)) {
      continue;
    }

    const name =
      pendingMetadata?.name ||
      pendingMetadata?.tvgName ||
      `Canal ${channels.length + 1}`;

    channels.push({
      iptv_source_id: sourceId,
      name,
      logo_url: pendingMetadata?.logo || null,
      group_title: pendingMetadata?.groupTitle || null,
      stream_url: line,
      tvg_id: pendingMetadata?.tvgId || null,
      sort_order: channels.length,
    });

    pendingMetadata = null;
  }

  return channels;
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
          error: 'Variáveis de ambiente Supabase não configuradas.',
        },
        500,
      );
    }

    const authorization = request.headers.get('Authorization');

    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse(
        {
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
          error: 'Usuário não autenticado.',
          details: userError?.message,
        },
        401,
      );
    }

    const { data: adminProfile, error: adminError } = await supabaseAdmin
      .from('admin_profiles')
      .select('id, role, is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (adminError || !adminProfile) {
      return jsonResponse(
        {
          error: 'Acesso administrativo não autorizado.',
          details: adminError?.message,
        },
        403,
      );
    }

    let payload: SyncIptvSourceRequest;

    try {
      payload = (await request.json()) as SyncIptvSourceRequest;
    } catch {
      return jsonResponse(
        {
          error: 'Payload inválido.',
        },
        400,
      );
    }

    const sourceId = payload.sourceId?.trim();

    if (!sourceId) {
      return jsonResponse(
        {
          error: 'sourceId é obrigatório.',
        },
        400,
      );
    }

    const { data: source, error: sourceError } = await supabaseAdmin
      .from('iptv_sources')
      .select('id, name, source_url, type, is_active')
      .eq('id', sourceId)
      .single<IptvSource>();

    if (sourceError || !source) {
      return jsonResponse(
        {
          error: 'Fonte IPTV não encontrada.',
          details: sourceError?.message,
        },
        404,
      );
    }

    if (!source.is_active) {
      return jsonResponse(
        {
          error: 'Fonte IPTV inativa.',
        },
        400,
      );
    }

    if (source.type === 'manual') {
      return jsonResponse(
        {
          error: 'Sincronização automática ainda não disponível para fontes manuais.',
          details: 'Nesta fase, fontes manuais devem ser cadastradas individualmente ou convertidas para M3U/Xtream.',
        },
        400,
      );
    }

    if (
      source.type === 'xtream' &&
      !source.source_url.toLowerCase().includes('get.php')
    ) {
      return jsonResponse(
        {
          error: 'URL Xtream inválida para sincronização automática.',
          details: 'Use uma URL no formato get.php?username=...&password=...&type=m3u_plus&output=ts.',
        },
        400,
      );
    }

    const playlistResponse = await fetch(source.source_url, {
      method: 'GET',
      headers: {
        Accept:
          'application/vnd.apple.mpegurl, application/x-mpegURL, audio/mpegurl, text/plain, */*',
        'User-Agent': 'Xandeflix/1.0',
      },
    });

    if (!playlistResponse.ok) {
      return jsonResponse(
        {
          error: `Falha ao baixar playlist. HTTP ${playlistResponse.status}.`,
        },
        502,
      );
    }

    const content = await playlistResponse.text();
    const channels = parseM3u(content, source.id);

    if (channels.length === 0) {
      return jsonResponse(
        {
          error: 'Nenhum canal válido encontrado na playlist.',
        },
        422,
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from('channels_cache')
      .delete()
      .eq('iptv_source_id', source.id);

    if (deleteError) {
      return jsonResponse(
        {
          error: 'Não foi possível limpar o cache anterior de canais.',
          details: deleteError.message,
        },
        500,
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from('channels_cache')
      .insert(channels);

    if (insertError) {
      return jsonResponse(
        {
          error: 'Não foi possível salvar canais no cache.',
          details: insertError.message,
        },
        500,
      );
    }

    await supabaseAdmin
      .from('iptv_sources')
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', source.id);

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: user.id,
      action: 'sync_iptv_source',
      entity: 'iptv_sources',
      entity_id: source.id,
      metadata: {
        source_name: source.name,
        source_type: source.type,
        channels_count: channels.length,
      },
    });

    return jsonResponse({
      ok: true,
      sourceId: source.id,
      sourceName: source.name,
      channelsCount: channels.length,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: 'Erro interno ao sincronizar fonte IPTV.',
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
});
