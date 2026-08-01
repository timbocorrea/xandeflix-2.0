import { classifyChannelContent } from '@/features/playlists/lib/channelClassification';
import {
  parseM3uPlaylistProgressive,
  type ParseM3uPlaylistProgress,
} from '@/features/playlists/lib/parseM3uPlaylist';
import type { IptvChannel } from '@/features/playlists/types/playlist';
import type { UniversalCatalogSourceType } from '@/features/universalCatalog';

import {
  countLocalCatalogItemsForSource,
  getLocalCatalogImportMetadata,
  getLocalCatalogItemsByIds,
  putLocalCatalogImportMetadata,
  putLocalCatalogItems,
  removeObsoleteLocalCatalogItems,
} from './localCatalogDb.service';
import type {
  LocalCatalogImportMetadata,
  LocalCatalogItem,
} from '../types/localCatalog.types';
import type {
  LocalPlaylistImportOptions,
  LocalPlaylistImportProgress,
  LocalPlaylistImportResult,
} from '../types/localPlaylistImport.types';

export const LOCAL_CATALOG_CLASSIFICATION_VERSION = 1;
export const DEFAULT_LOCAL_CATALOG_IMPORT_BATCH_SIZE = 250;

const activeImportSessions = new Map<string, string>();

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function normalizeCatalogText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function createImportSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createIdentityInput(sourceId: string, channel: IptvChannel) {
  return JSON.stringify([
    'v1',
    sourceId,
    normalizeCatalogText(channel.tvgId),
    normalizeCatalogText(channel.name),
    normalizeCatalogText(channel.groupTitle),
    channel.url.trim(),
  ]);
}

async function digestIdentity(value: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('LOCAL_CATALOG_ID_CRYPTO_UNAVAILABLE');
  }

  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function createCollisionFingerprint(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function createDeterministicLocalCatalogId(
  sourceId: string,
  channel: IptvChannel,
) {
  const identityInput = createIdentityInput(sourceId, channel);
  return `uc_${await digestIdentity(identityInput)}`;
}

function resolveContentKind(channel: IptvChannel): LocalCatalogItem['contentKind'] {
  if (
    channel.contentKind === 'live' ||
    channel.contentKind === 'movie' ||
    channel.contentKind === 'series' ||
    channel.contentKind === 'unknown'
  ) {
    return channel.contentKind;
  }

  return classifyChannelContent(channel);
}

function mapChannelToLocalCatalogItem({
  id,
  sourceId,
  sourceType,
  importSessionId,
  channel,
  existingItem,
}: {
  id: string;
  sourceId: string;
  sourceType: UniversalCatalogSourceType;
  importSessionId: string;
  channel: IptvChannel;
  existingItem?: LocalCatalogItem;
}): LocalCatalogItem | null {
  const rawName = channel.name?.trim();
  const streamUrl = channel.url?.trim();

  if (!rawName || !streamUrl) {
    return null;
  }

  const timestamp = nowIso();
  const rawGroupTitle = channel.groupTitle ?? null;

  return {
    id,
    sourceId,
    sourceType,
    name: rawName,
    rawName,
    normalizedName: normalizeCatalogText(rawName),
    groupTitle: rawGroupTitle,
    normalizedGroup: normalizeCatalogText(rawGroupTitle) || null,
    contentKind: resolveContentKind(channel),
    streamUrl,
    tvgId: channel.tvgId ?? null,
    tvgName: channel.tvgName ?? null,
    tvgLogo: channel.logo ?? null,
    classificationVersion: LOCAL_CATALOG_CLASSIFICATION_VERSION,
    importSessionId,
    createdAt: existingItem?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function emitProgress(
  progress: LocalPlaylistImportProgress,
  onProgress?: (progress: LocalPlaylistImportProgress) => void,
) {
  try {
    onProgress?.({ ...progress });
  } catch {
    // Observabilidade não pode interromper a importação.
  }
}

function sanitizeErrorCode(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'LOCAL_CATALOG_IMPORT_CANCELED';
  }

  if (
    error instanceof Error &&
    /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(error.message)
  ) {
    return error.message;
  }

  return 'LOCAL_CATALOG_IMPORT_FAILED';
}

function toMetadata({
  progress,
  sourceType,
  previousMetadata,
  status,
  errorCode,
  removedCount,
  unknownCount,
  withoutGroupCount,
  storedItemCount,
}: {
  progress: LocalPlaylistImportProgress;
  sourceType: UniversalCatalogSourceType;
  previousMetadata: LocalCatalogImportMetadata | null;
  status: LocalCatalogImportMetadata['status'];
  errorCode?: string | null;
  removedCount: number;
  unknownCount: number;
  withoutGroupCount: number;
  storedItemCount?: number;
}): LocalCatalogImportMetadata {
  const completedAt =
    status === 'ready' || status === 'failed' || status === 'canceled'
      ? progress.finishedAt ?? nowIso()
      : null;

  return {
    sourceId: progress.sourceId,
    sourceType,
    status,
    startedAt: progress.startedAt ?? null,
    completedAt,
    lastSuccessfulImportAt:
      status === 'ready'
        ? completedAt
        : previousMetadata?.lastSuccessfulImportAt ?? null,
    parsedCount: progress.processed,
    importedCount:
      storedItemCount ?? progress.inserted + progress.updated,
    updatedCount: progress.updated,
    removedCount,
    unknownCount,
    withoutGroupCount,
    classificationVersion: LOCAL_CATALOG_CLASSIFICATION_VERSION,
    errorCode: errorCode ?? null,
  };
}

export type LocalCatalogImportSession = {
  sourceId: string;
  importSessionId: string;
  writeBatch(channels: IptvChannel[]): Promise<void>;
  complete(): Promise<LocalPlaylistImportResult>;
  cancel(): Promise<LocalPlaylistImportResult>;
  fail(error?: unknown): Promise<LocalPlaylistImportResult>;
};

export async function beginLocalCatalogImport({
  sourceId: rawSourceId,
  sourceType = 'm3u',
  signal,
  onProgress,
}: {
  sourceId: string;
  sourceType?: UniversalCatalogSourceType;
  signal?: AbortSignal;
  onProgress?: (progress: LocalPlaylistImportProgress) => void;
}): Promise<LocalCatalogImportSession> {
  const sourceId = rawSourceId.trim();

  if (!sourceId) {
    throw new Error('LOCAL_CATALOG_SOURCE_ID_REQUIRED');
  }

  if (sourceType !== 'm3u') {
    throw new Error('LOCAL_CATALOG_SOURCE_TYPE_UNSUPPORTED');
  }

  if (activeImportSessions.has(sourceId)) {
    throw new Error('LOCAL_CATALOG_IMPORT_IN_PROGRESS');
  }

  const importSessionId = createImportSessionId();
  const startedAtMs = nowMs();
  const seenItemIds = new Set<string>();
  const identityFingerprintById = new Map<string, string>();
  let removedCount = 0;
  let unknownCount = 0;
  let withoutGroupCount = 0;
  let isFinished = false;
  const progress: LocalPlaylistImportProgress = {
    status: 'importing',
    sourceId,
    importSessionId,
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    startedAt: nowIso(),
    message: 'LOCAL_CATALOG_IMPORT_STARTED',
  };

  activeImportSessions.set(sourceId, importSessionId);
  let previousMetadata: LocalCatalogImportMetadata | null = null;

  try {
    previousMetadata = await getLocalCatalogImportMetadata(sourceId);
    await putLocalCatalogImportMetadata(
      toMetadata({
        progress,
        sourceType,
        previousMetadata,
        status: 'importing',
        removedCount,
        unknownCount,
        withoutGroupCount,
      }),
    );
  } catch (error) {
    activeImportSessions.delete(sourceId);
    throw error;
  }

  emitProgress(progress, onProgress);

  function releaseLock() {
    if (activeImportSessions.get(sourceId) === importSessionId) {
      activeImportSessions.delete(sourceId);
    }
  }

  function buildResult(): LocalPlaylistImportResult {
    return {
      progress: { ...progress },
      removedItems: removedCount,
      unknownItems: unknownCount,
      itemsWithoutGroup: withoutGroupCount,
      durationMs: Math.max(0, Math.round(nowMs() - startedAtMs)),
    };
  }

  async function finalize(
    status: 'ready' | 'failed' | 'canceled',
    errorCode?: string,
  ) {
    if (isFinished) {
      return buildResult();
    }

    const terminalProgress: LocalPlaylistImportProgress = {
      ...progress,
      status,
      finishedAt: nowIso(),
      message:
      status === 'ready'
        ? 'LOCAL_CATALOG_IMPORT_READY'
        : errorCode ?? `LOCAL_CATALOG_IMPORT_${status.toUpperCase()}`,
      errors: progress.errors + (status === 'failed' ? 1 : 0),
    };

    try {
      const storedItemCount =
        status === 'ready'
          ? await countLocalCatalogItemsForSource(sourceId)
          : undefined;
      await putLocalCatalogImportMetadata(
        toMetadata({
          progress: terminalProgress,
          sourceType,
          previousMetadata,
          status,
          errorCode: errorCode ?? null,
          removedCount,
          unknownCount,
          withoutGroupCount,
          storedItemCount,
        }),
      );
      Object.assign(progress, terminalProgress);
      isFinished = true;
    } finally {
      releaseLock();
      identityFingerprintById.clear();
    }

    emitProgress(progress, onProgress);
    return buildResult();
  }

  return {
    sourceId,
    importSessionId,
    async writeBatch(channels) {
      if (isFinished) {
        throw new Error('LOCAL_CATALOG_IMPORT_SESSION_FINISHED');
      }

      if (signal?.aborted) {
        throw Object.assign(new Error('LOCAL_CATALOG_IMPORT_CANCELED'), {
          name: 'AbortError',
        });
      }

      progress.processed += channels.length;
      const candidates = await Promise.all(
        channels.map(async (channel) => {
          const id = await createDeterministicLocalCatalogId(sourceId, channel);
          const identity = createIdentityInput(sourceId, channel);
          const fingerprint = createCollisionFingerprint(identity);
          const knownFingerprint = identityFingerprintById.get(id);

          if (knownFingerprint && knownFingerprint !== fingerprint) {
            throw new Error('LOCAL_CATALOG_ID_COLLISION');
          }

          identityFingerprintById.set(id, fingerprint);

          if (seenItemIds.has(id)) {
            progress.skipped += 1;
            return null;
          }

          seenItemIds.add(id);
          return { id, channel };
        }),
      );
      const uniqueCandidates = candidates.filter(
        (candidate): candidate is { id: string; channel: IptvChannel } =>
          candidate !== null,
      );
      const existingItems = await getLocalCatalogItemsByIds(
        uniqueCandidates.map((candidate) => candidate.id),
      );
      const items = (
        await Promise.all(
          uniqueCandidates.map(({ id, channel }) =>
            mapChannelToLocalCatalogItem({
              id,
              sourceId,
              sourceType,
              importSessionId,
              channel,
              existingItem: existingItems.get(id),
            }),
          ),
        )
      ).filter((item): item is LocalCatalogItem => item !== null);

      for (const item of items) {
        if (existingItems.has(item.id)) {
          progress.updated += 1;
        } else {
          progress.inserted += 1;
        }

        if (item.contentKind === 'unknown') {
          unknownCount += 1;
        }

        if (!item.groupTitle?.trim()) {
          withoutGroupCount += 1;
        }

      }

      await putLocalCatalogItems(items);
      progress.message = 'LOCAL_CATALOG_IMPORT_BATCH_WRITTEN';
      await putLocalCatalogImportMetadata(
        toMetadata({
          progress,
          sourceType,
          previousMetadata,
          status: 'importing',
          removedCount,
          unknownCount,
          withoutGroupCount,
        }),
      );
      emitProgress(progress, onProgress);
    },
    async complete() {
      if (signal?.aborted) {
        return finalize('canceled', 'LOCAL_CATALOG_IMPORT_CANCELED');
      }

      if (progress.processed === 0) {
        return finalize('failed', 'LOCAL_CATALOG_IMPORT_EMPTY');
      }

      removedCount = await removeObsoleteLocalCatalogItems(
        sourceId,
        importSessionId,
      );
      return finalize('ready');
    },
    cancel: () => finalize('canceled', 'LOCAL_CATALOG_IMPORT_CANCELED'),
    fail: (error) => finalize('failed', sanitizeErrorCode(error)),
  };
}

export async function importPlaylistToLocalCatalog(
  options: LocalPlaylistImportOptions,
): Promise<LocalPlaylistImportResult> {
  const session = await beginLocalCatalogImport({
    sourceId: options.sourceId,
    sourceType: options.sourceType ?? 'm3u',
    signal: options.signal,
    onProgress: options.onProgress,
  });

  try {
    await parseM3uPlaylistProgressive(options.playlistText, {
      batchSize: options.batchSize ?? DEFAULT_LOCAL_CATALOG_IMPORT_BATCH_SIZE,
      collectChannels: false,
      signal: options.signal,
      onProgress: (parseProgress: ParseM3uPlaylistProgress) => {
        void parseProgress;
      },
      onChannelsBatch: (channels) => session.writeBatch(channels),
    });

    return await session.complete();
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError'
      ? session.cancel()
      : session.fail(error);
  }
}
