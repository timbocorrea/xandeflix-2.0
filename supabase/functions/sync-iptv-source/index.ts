type SyncIptvSourceRequest = {
  sourceId?: string;
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
    const payload = (await request.json()) as SyncIptvSourceRequest;
    const sourceId = payload.sourceId?.trim();

    if (!sourceId) {
      return jsonResponse(
        {
          error: 'sourceId é obrigatório.',
        },
        400,
      );
    }

    return jsonResponse({
      ok: true,
      sourceId,
      message: 'Edge Function sync-iptv-source inicializada com sucesso.',
    });
  } catch {
    return jsonResponse(
      {
        error: 'Payload inválido.',
      },
      400,
    );
  }
});
