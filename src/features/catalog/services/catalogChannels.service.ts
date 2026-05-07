import { supabase } from '../../../lib/supabase/supabaseClient';

import type { CatalogSection } from '../types';

type ChannelCacheRow = {
  id: string;
  name: string;
  logo_url: string | null;
  group_title: string | null;
  stream_url: string;
  sort_order: number | null;
};

function normalizeSectionId(groupTitle: string) {
  return groupTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'outros';
}

export async function listCatalogChannelSections(): Promise<CatalogSection[]> {
  const { data, error } = await supabase
    .from('channels_cache')
    .select('id, name, logo_url, group_title, stream_url, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(300);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ChannelCacheRow[];

  if (rows.length === 0) {
    return [];
  }

  const sectionMap = new Map<string, CatalogSection>();

  for (const row of rows) {
    const groupTitle = row.group_title?.trim() || 'Canais ao vivo';
    const sectionId = `live-${normalizeSectionId(groupTitle)}`;

    const existingSection = sectionMap.get(sectionId);

    const section =
      existingSection ??
      {
        id: sectionId,
        eyebrow: 'Ao vivo',
        title: groupTitle,
        showSeeAll: false,
        items: [],
      };

    section.items.push({
      id: row.id,
      title: row.name,
      subtitle: groupTitle,
      streamUrl: row.stream_url,
      logoUrl: row.logo_url,
      groupTitle,
    });

    sectionMap.set(sectionId, section);
  }

  return Array.from(sectionMap.values());
}
