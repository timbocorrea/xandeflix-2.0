import type { IptvChannel } from '@/features/playlists/types/playlist';
import { localCatalogRepository } from '@/features/localCatalog/repositories/localCatalogRepository.service';
import type { CatalogRepository } from '@/features/localCatalog/repositories/catalogRepository.types';
import { isLocalCatalogReadable } from '@/features/localCatalog/services/localCatalogReadability.service';

export async function loadReadableLocalLiveChannels(
  rawSourceId: string,
  repository: CatalogRepository = localCatalogRepository,
): Promise<IptvChannel[] | null> {
  const sourceId = rawSourceId.trim();

  if (!sourceId) {
    return null;
  }

  const metadata = await repository.getImportMetadata(sourceId);

  if (!isLocalCatalogReadable(metadata)) {
    return null;
  }

  const localLiveItems = await repository.listItems({
    sourceId,
    contentKind: 'live',
  });
  const channels = localLiveItems.flatMap<IptvChannel>((item) => {
    const streamUrl = item.streamUrl?.trim();

    if (!streamUrl) {
      return [];
    }

    return [{
      id: item.id,
      name: item.name,
      url: streamUrl,
      logo: item.tvgLogo ?? undefined,
      groupTitle: item.groupTitle ?? undefined,
      tvgId: item.tvgId ?? undefined,
      tvgName: item.tvgName ?? undefined,
      contentKind: 'live',
    }];
  });

  if (localLiveItems.length > 0 && channels.length === 0) {
    throw new Error('LOCAL_LIVE_CATALOG_STREAM_URLS_UNAVAILABLE');
  }

  return channels;
}
