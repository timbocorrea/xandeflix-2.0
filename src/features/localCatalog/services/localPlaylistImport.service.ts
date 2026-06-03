import {
  parseM3uPlaylistProgressive,
  type ParseM3uPlaylistProgress,
} from '@/features/playlists/lib/parseM3uPlaylist';
import type { IptvChannel } from '@/features/playlists/types/playlist';
import { putLocalCatalogItems } from './localCatalogDb.service';
import type { LocalCatalogItem } from '../types/localCatalog.types';
import type {
  LocalPlaylistImportOptions,
  LocalPlaylistImportProgress,
  LocalPlaylistImportResult,
} from '../types/localPlaylistImport.types';

const DEFAULT_IMPORT_BATCH_SIZE = 500;
const SAMPLE_ITEMS_LIMIT = 5;

function nowIso() {
  return new Date().toISOString();
}

function emitProgress(
  progress: LocalPlaylistImportProgress,
  onProgress?: (progress: LocalPlaylistImportProgress) => void,
) {
  onProgress?.({ ...progress });
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toContentKind(groupTitle: string | undefined): LocalCatalogItem['contentKind'] {
  const normalizedGroup = normalizeName(groupTitle ?? '');

  if (
    normalizedGroup.includes('serie') ||
    normalizedGroup.includes('novela') ||
    normalizedGroup.includes('dorama')
  ) {
    return 'series';
  }

  if (
    normalizedGroup.includes('filme') ||
    normalizedGroup.includes('movie') ||
    normalizedGroup.includes('vod')
  ) {
    return 'movie';
  }

  return 'live';
}

function createLocalCatalogId(sourceId: string, channel: IptvChannel, index: number) {
  const baseName = normalizeName(channel.name || `item-${index + 1}`);
  const baseUrl = normalizeName(channel.url || `url-${index + 1}`);

  return `${sourceId}:${index}:${baseName}:${baseUrl}`;
}

function mapChannelToLocalCatalogItem(
  sourceId: string,
  channel: IptvChannel,
  index: number,
): LocalCatalogItem | null {
  const name = channel.name?.trim();
  const streamUrl = channel.url?.trim();

  if (!name || !streamUrl) {
    return null;
  }

  const timestamp = nowIso();

  return {
    id: createLocalCatalogId(sourceId, channel, index),
    sourceId,
    name,
    normalizedName: normalizeName(name),
    groupTitle: channel.groupTitle ?? null,
    contentKind: toContentKind(channel.groupTitle),
    streamUrl,
    tvgId: channel.tvgId ?? null,
    tvgName: channel.tvgName ?? null,
    tvgLogo: channel.logo ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createInitialProgress(sourceId: string): LocalPlaylistImportProgress {
  return {
    status: 'running',
    sourceId,
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    startedAt: nowIso(),
    message: 'Iniciando importação local da playlist.',
  };
}

export async function importPlaylistToLocalCatalog(
  options: LocalPlaylistImportOptions,
): Promise<LocalPlaylistImportResult> {
  const batchSize = options.batchSize ?? DEFAULT_IMPORT_BATCH_SIZE;
  const progress = createInitialProgress(options.sourceId);
  const sampleItems: LocalCatalogItem[] = [];
  let globalIndex = 0;

  emitProgress(progress, options.onProgress);

  if (options.signal?.aborted) {
    progress.status = 'cancelled';
    progress.finishedAt = nowIso();
    progress.message = 'Importação cancelada antes do início.';
    emitProgress(progress, options.onProgress);

    return { progress, sampleItems };
  }

  try {
    await parseM3uPlaylistProgressive(options.playlistText, {
      batchSize,
      onProgress: (parseProgress: ParseM3uPlaylistProgress) => {
        progress.totalEstimate = parseProgress.playableUrlLines || undefined;
      },
      onChannelsBatch: async (channels: IptvChannel[]) => {
        if (options.signal?.aborted) {
          progress.status = 'cancelled';
          progress.finishedAt = nowIso();
          progress.message = 'Importação cancelada.';
          emitProgress(progress, options.onProgress);
          return;
        }

        const localItems: LocalCatalogItem[] = [];

        for (const channel of channels) {
          const localItem = mapChannelToLocalCatalogItem(
            options.sourceId,
            channel,
            globalIndex,
          );

          globalIndex += 1;
          progress.processed += 1;

          if (!localItem) {
            progress.skipped += 1;
            continue;
          }

          localItems.push(localItem);

          if (sampleItems.length < SAMPLE_ITEMS_LIMIT) {
            sampleItems.push(localItem);
          }
        }

        await putLocalCatalogItems(localItems);
        progress.inserted += localItems.length;
        progress.message = `Importados ${progress.inserted} itens no catálogo local.`;
        emitProgress(progress, options.onProgress);
      },
    });

    if (progress.status === 'cancelled') {
      return { progress, sampleItems };
    }

    progress.status = 'completed';
    progress.finishedAt = nowIso();
    progress.message = `Importação concluída com ${progress.inserted} itens.`;
    emitProgress(progress, options.onProgress);

    return { progress, sampleItems };
  } catch (error) {
    progress.status = 'error';
    progress.errors += 1;
    progress.finishedAt = nowIso();
    progress.message =
      error instanceof Error ? error.message : 'LOCAL_PLAYLIST_IMPORT_FAILED';
    emitProgress(progress, options.onProgress);

    return { progress, sampleItems };
  }
}
