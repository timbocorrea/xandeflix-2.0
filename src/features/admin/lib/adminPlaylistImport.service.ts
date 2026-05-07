import { supabase } from '../../../lib/supabase/supabaseClient';
import { env } from '../../../config/env';

import type { IptvSource } from '../types/admin.types';

export type AdminPlaylistImportResult = {
  source: IptvSource;
  sourceId: string;
  sourceName: string;
  channelsCount: number;
  total: number;
};

type SyncIptvSourceResponse = {
  ok?: boolean;
  sourceId?: string;
  sourceName?: string;
  channelsCount?: number;
  error?: string;
  details?: string;
};

export async function importAdminPlaylistSource(
  source: IptvSource,
): Promise<AdminPlaylistImportResult> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('Sessão administrativa não encontrada.');
  }

  const response = await fetch(
    `${env.supabaseUrl}/functions/v1/sync-iptv-source`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: env.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceId: source.id,
      }),
    },
  );

  const data = (await response.json().catch(() => null)) as
    | SyncIptvSourceResponse
    | null;

  if (!response.ok || !data?.ok) {
    throw new Error(
      data?.details ||
        data?.error ||
        `Não foi possível sincronizar a fonte IPTV. HTTP ${response.status}`,
    );
  }

  const channelsCount = data.channelsCount ?? 0;

  return {
    source,
    sourceId: data.sourceId ?? source.id,
    sourceName: data.sourceName ?? source.name,
    channelsCount,
    total: channelsCount,
  };
}
