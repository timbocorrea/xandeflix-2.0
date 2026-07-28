import { classifyChannelContent } from '@/features/playlists/lib/channelClassification';
import {
  parseM3uPlaylistProgressive,
  parseM3uPlaylistProgressiveFromStream,
} from '@/features/playlists/lib/parseM3uPlaylist';
import type { IptvChannel } from '@/features/playlists/types/playlist';

import { createDeterministicLocalCatalogId } from './localPlaylistImport.service';
import {
  beginLocalCatalogStagingSnapshot,
  cancelLocalCatalogStagingSnapshot,
  evaluateLocalCatalogResume,
  failLocalCatalogStagingSnapshot,
  markLocalCatalogSnapshotReady,
  markLocalCatalogSnapshotValidating,
  promoteLocalCatalogStagingSnapshot,
  writeLocalCatalogSnapshotBatch,
} from './localCatalogSnapshotLifecycle.service';
import {
  getLocalCatalogImportCheckpoint,
  getLocalCatalogScope,
  LOCAL_CATALOG_DB_VERSION,
} from './localCatalogDb.service';
import type { LocalCatalogSnapshotItem } from '../types/localCatalog.types';
import { purgeLocalCatalogSnapshotPartialData } from './localCatalogSnapshotPurge.service';

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_TRANSFORM_CONCURRENCY = 2;
const MAX_TRANSFORM_CONCURRENCY = 4;
const MAX_WHOLE_TEXT_BYTES = 20 * 1024 * 1024;

export type LocalCatalogSnapshotImportSource =
  | { kind: 'stream'; stream: ReadableStream<Uint8Array>; knownBytes?: number | null }
  | { kind: 'text'; text: string; knownBytes?: number | null };

export type LocalCatalogSnapshotImportResult = {
  snapshotId: string;
  status: 'ready';
  transport: 'streaming' | 'whole_text_fallback';
  sizeRange: 'unknown' | 'small' | 'medium' | 'large' | 'over_limit';
  parsedItems: number;
  insertedItems: number;
  duplicatesIgnored: number;
  batchesCommitted: number;
  resumedFromItems: number;
  collectedChannelsCount: 0;
  peakBatchSize: number;
  peakTransformQueue: number;
  peakInMemoryItems: number;
};

export type RunLocalCatalogSnapshotImportInput = {
  scopeKey: string;
  sourceId: string;
  snapshotId: string;
  expectedRuntimeEpoch: number;
  sourceRevision: string | null;
  sourceEtag?: string | null;
  sourceLastModified?: string | null;
  parserVersion: number;
  classificationVersion: number;
  signal?: AbortSignal;
  source: LocalCatalogSnapshotImportSource;
  batchSize?: number;
  transformConcurrency?: number;
  onProgress?: (progress: { parsedItems: number; committedItems: number; batchesCommitted: number }) => void;
};

export type CreateLocalCatalogSnapshotImportSessionInput = Omit<
  RunLocalCatalogSnapshotImportInput,
  'source'
>;

export type LocalCatalogSnapshotImportSessionMetrics = {
  status: 'building' | 'ready' | 'active' | 'failed' | 'canceled';
  parsedItems: number;
  insertedItems: number;
  duplicatesIgnored: number;
  batchesCommitted: number;
  resumedFromItems: number;
  peakBatchSize: number;
  peakTransformQueue: number;
  peakInMemoryItems: number;
  failureCode: string | null;
};

export type LocalCatalogSnapshotImportSession = {
  writeBatch(
    channels: IptvChannel[],
    parserProgress?: { confirmedBytes?: number },
  ): Promise<void>;
  complete(finalStats?: { parsedItems?: number; confirmedBytes?: number }): Promise<void>;
  cancel(): Promise<void>;
  fail(failureCode?: string): Promise<void>;
  promote(): Promise<void>;
  getMetrics(): LocalCatalogSnapshotImportSessionMetrics;
};

function normalize(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw Object.assign(new Error('LOCAL_CATALOG_IMPORT_CANCELED'), { name: 'AbortError' });
}

function integerInRange(value: number | undefined, fallback: number, min: number, max: number) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < min || resolved > max)
    throw new Error('LOCAL_CATALOG_IMPORT_OPTIONS_INVALID');
  return resolved;
}

function sizeRange(bytes?: number | null): LocalCatalogSnapshotImportResult['sizeRange'] {
  if (bytes === null || bytes === undefined) return 'unknown';
  if (bytes > MAX_WHOLE_TEXT_BYTES) return 'over_limit';
  if (bytes <= 512 * 1024) return 'small';
  if (bytes <= 5 * 1024 * 1024) return 'medium';
  return 'large';
}

async function mapWithConcurrency<T, R>(
  values: T[], concurrency: number, signal: AbortSignal | undefined,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let next = 0;
  let active = 0;
  let peak = 0;
  async function worker() {
    for (;;) {
      throwIfAborted(signal);
      const index = next++;
      if (index >= values.length) return;
      active += 1;
      peak = Math.max(peak, active);
      try { results[index] = await mapper(values[index], index); }
      finally { active -= 1; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return { results, peak };
}

async function transformChannel(
  channel: IptvChannel, sourceId: string, scopeKey: string,
  snapshotId: string, sourceOrder: number, classificationVersion: number,
): Promise<LocalCatalogSnapshotItem> {
  const itemId = await createDeterministicLocalCatalogId(sourceId, channel);
  const timestamp = new Date().toISOString();
  return {
    snapshotId, itemId, scopeKey,
    logicalIdentity: { version: 1, strategy: 'url_fallback', value: itemId },
    sourceItemId: itemId, contentKind: channel.contentKind ?? classifyChannelContent(channel),
    rawName: channel.name.trim(), normalizedName: normalize(channel.name),
    rawGroupTitle: channel.groupTitle?.trim() || null,
    normalizedGroup: normalize(channel.groupTitle) || null,
    streamUrl: channel.url.trim(),
    artworkUrl: channel.logo?.trim() || null,
    sourceOrder, classificationVersion,
    createdAt: timestamp, updatedAt: timestamp,
  };
}

function sanitizedFailureCode(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError')
    return 'LOCAL_CATALOG_IMPORT_CANCELED';
  if (error instanceof Error && /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(error.message))
    return error.message;
  if (typeof error === 'string' && /^LOCAL_CATALOG_[A-Z0-9_]+$/.test(error))
    return error;
  return 'LOCAL_CATALOG_IMPORT_FAILED';
}

export async function createLocalCatalogSnapshotImportSession(
  input: CreateLocalCatalogSnapshotImportSessionInput,
): Promise<LocalCatalogSnapshotImportSession> {
  const batchSize = integerInRange(input.batchSize, DEFAULT_BATCH_SIZE, 1, 500);
  const concurrency = integerInRange(
    input.transformConcurrency,
    DEFAULT_TRANSFORM_CONCURRENCY,
    1,
    MAX_TRANSFORM_CONCURRENCY,
  );
  throwIfAborted(input.signal);
  const scope = await getLocalCatalogScope(input.scopeKey);
  if (!scope) throw new Error('LOCAL_CATALOG_SCOPE_NOT_FOUND');

  let resumeFromItems = 0;
  if (scope.stagingSnapshotId) {
    const decision = await evaluateLocalCatalogResume({
      scopeKey: input.scopeKey,
      expectedRuntimeEpoch: input.expectedRuntimeEpoch,
      parserVersion: input.parserVersion,
      sourceRevision: input.sourceRevision,
      sourceEtag: input.sourceEtag ?? null,
      sourceLastModified: input.sourceLastModified ?? null,
    });
    if (
      decision.decision !== 'resume_eligible' ||
      decision.snapshotId !== input.snapshotId
    ) {
      throw new Error(
        decision.decision === 'blocked'
          ? decision.reasonCode
          : 'LOCAL_CATALOG_RESTART_REQUIRED',
      );
    }
    resumeFromItems = decision.checkpoint?.confirmedItems ?? 0;
  } else {
    await beginLocalCatalogStagingSnapshot({
      scopeKey: input.scopeKey,
      snapshotId: input.snapshotId,
      expectedRuntimeEpoch: input.expectedRuntimeEpoch,
      sourceRevision: input.sourceRevision,
      classificationVersion: input.classificationVersion,
      schemaVersion: LOCAL_CATALOG_DB_VERSION,
      parserVersion: input.parserVersion,
      timestamp: new Date().toISOString(),
    });
  }

  const initialCheckpoint = await getLocalCatalogImportCheckpoint(input.snapshotId);
  let batchSequence = initialCheckpoint?.batchSequence ?? 0;
  let confirmedBytes = initialCheckpoint?.confirmedBytes ?? 0;
  let accepting = true;
  let stopRequested = false;
  let pendingWrite = Promise.resolve();
  const metrics: LocalCatalogSnapshotImportSessionMetrics = {
    status: 'building',
    parsedItems: 0,
    insertedItems: 0,
    duplicatesIgnored: 0,
    batchesCommitted: 0,
    resumedFromItems: resumeFromItems,
    peakBatchSize: 0,
    peakTransformQueue: 0,
    peakInMemoryItems: 0,
    failureCode: null,
  };

  async function markFailed(error: unknown) {
    const failureCode = sanitizedFailureCode(error);
    accepting = false;
    stopRequested = true;
    metrics.status = failureCode === 'LOCAL_CATALOG_IMPORT_CANCELED'
      ? 'canceled'
      : 'failed';
    metrics.failureCode = failureCode;
    const lifecycle = {
      scopeKey: input.scopeKey,
      snapshotId: input.snapshotId,
      expectedRuntimeEpoch: input.expectedRuntimeEpoch,
      timestamp: new Date().toISOString(),
      failureCode,
    };
    if (metrics.status === 'canceled') {
      await cancelLocalCatalogStagingSnapshot(lifecycle);
      await purgeLocalCatalogSnapshotPartialData({
        snapshotId: input.snapshotId,
      });
    } else {
      await failLocalCatalogStagingSnapshot({
        ...lifecycle,
        failureKind: 'transient',
      }).catch(() => undefined);
    }
    return failureCode;
  }

  async function processBatch(
    channels: IptvChannel[],
    parserProgress?: { confirmedBytes?: number },
  ) {
    if (stopRequested) throw new Error('LOCAL_CATALOG_IMPORT_SESSION_FINISHED');
    throwIfAborted(input.signal);
    const batchStart = metrics.parsedItems;
    metrics.parsedItems += channels.length;
    confirmedBytes = Math.max(
      confirmedBytes,
      parserProgress?.confirmedBytes ?? confirmedBytes,
    );
    if (metrics.parsedItems <= resumeFromItems) return;
    const skip = Math.max(0, resumeFromItems - batchStart);
    const pending = channels.slice(skip);
    if (pending.length === 0) return;
    metrics.peakBatchSize = Math.max(metrics.peakBatchSize, pending.length);
    const transformed = await mapWithConcurrency(
      pending,
      concurrency,
      input.signal,
      (channel, index) => transformChannel(
        channel,
        input.sourceId,
        input.scopeKey,
        input.snapshotId,
        batchStart + skip + index,
        input.classificationVersion,
      ),
    );
    metrics.peakTransformQueue = Math.max(
      metrics.peakTransformQueue,
      transformed.peak,
    );
    metrics.peakInMemoryItems = Math.max(
      metrics.peakInMemoryItems,
      pending.length + transformed.results.length,
    );
    throwIfAborted(input.signal);
    batchSequence += 1;
    const committed = await writeLocalCatalogSnapshotBatch({
      scopeKey: input.scopeKey,
      snapshotId: input.snapshotId,
      expectedRuntimeEpoch: input.expectedRuntimeEpoch,
      batchSequence,
      items: transformed.results,
      parsedItemsInBatch: pending.length,
      confirmedItems: metrics.parsedItems,
      confirmedBytes,
      sourceRevision: input.sourceRevision,
      sourceEtag: input.sourceEtag ?? null,
      sourceLastModified: input.sourceLastModified ?? null,
      parserVersion: input.parserVersion,
      updatedAt: new Date().toISOString(),
    });
    metrics.insertedItems += committed.inserted;
    metrics.duplicatesIgnored += committed.duplicates;
    metrics.batchesCommitted += 1;
    input.onProgress?.({
      parsedItems: metrics.parsedItems,
      committedItems: committed.checkpoint.confirmedItems,
      batchesCommitted: metrics.batchesCommitted,
    });
  }

  return {
    writeBatch(channels, parserProgress) {
      if (!accepting)
        return Promise.reject(new Error('LOCAL_CATALOG_IMPORT_SESSION_FINISHED'));
      const boundedBatch = channels.slice(0, batchSize);
      if (boundedBatch.length !== channels.length)
        return Promise.reject(new Error('LOCAL_CATALOG_IMPORT_BATCH_TOO_LARGE'));
      pendingWrite = pendingWrite.then(() => processBatch(boundedBatch, parserProgress));
      return pendingWrite.catch(async (error) => {
        const failureCode = await markFailed(error);
        throw new Error(failureCode);
      });
    },
    async complete(finalStats) {
      accepting = false;
      try {
        await pendingWrite;
        throwIfAborted(input.signal);
        confirmedBytes = Math.max(
          confirmedBytes,
          finalStats?.confirmedBytes ?? confirmedBytes,
        );
        const expectedTotalItems = finalStats?.parsedItems ?? metrics.parsedItems;
        if (expectedTotalItems !== metrics.parsedItems)
          throw new Error('LOCAL_CATALOG_IMPORT_COUNT_MISMATCH');
        const checkpoint = await getLocalCatalogImportCheckpoint(input.snapshotId);
        if (!checkpoint || checkpoint.confirmedItems !== expectedTotalItems)
          throw new Error('LOCAL_CATALOG_IMPORT_COUNT_MISMATCH');
        await markLocalCatalogSnapshotValidating({
          scopeKey: input.scopeKey,
          snapshotId: input.snapshotId,
          expectedRuntimeEpoch: input.expectedRuntimeEpoch,
          timestamp: new Date().toISOString(),
        });
        await markLocalCatalogSnapshotReady({
          scopeKey: input.scopeKey,
          snapshotId: input.snapshotId,
          expectedRuntimeEpoch: input.expectedRuntimeEpoch,
          timestamp: new Date().toISOString(),
          expectedTotalItems,
        });
        metrics.status = 'ready';
      } catch (error) {
        const failureCode = await markFailed(error);
        // Raw causes are intentionally discarded before crossing the sidecar boundary.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(failureCode);
      }
    },
    async cancel() {
      accepting = false;
      stopRequested = true;
      await pendingWrite.catch(() => undefined);
      if (metrics.status === 'active' || metrics.status === 'canceled') return;
      await markFailed('LOCAL_CATALOG_IMPORT_CANCELED');
    },
    async fail(failureCode = 'LOCAL_CATALOG_IMPORT_FAILED') {
      accepting = false;
      stopRequested = true;
      await pendingWrite.catch(() => undefined);
      if (metrics.status === 'active' || metrics.status === 'failed') return;
      await markFailed(failureCode);
    },
    async promote() {
      await pendingWrite;
      throwIfAborted(input.signal);
      if (metrics.status !== 'ready')
        throw new Error('LOCAL_CATALOG_SNAPSHOT_TRANSITION_INVALID');
      await promoteLocalCatalogStagingSnapshot({
        scopeKey: input.scopeKey,
        snapshotId: input.snapshotId,
        expectedRuntimeEpoch: input.expectedRuntimeEpoch,
        timestamp: new Date().toISOString(),
      });
      metrics.status = 'active';
    },
    getMetrics() {
      return { ...metrics };
    },
  };
}

export async function runLocalCatalogSnapshotImport(
  input: RunLocalCatalogSnapshotImportInput,
): Promise<LocalCatalogSnapshotImportResult> {
  const knownBytes = input.source.knownBytes;
  const range = sizeRange(knownBytes);
  if (input.source.kind === 'text' && range === 'over_limit')
    throw new Error('LOCAL_CATALOG_STREAMING_REQUIRED');
  const session = await createLocalCatalogSnapshotImportSession(input);
  let bytesReceived = input.source.kind === 'text' ? (knownBytes ?? input.source.text.length) : 0;
  try {
    const parserOptions = {
      batchSize: input.batchSize ?? DEFAULT_BATCH_SIZE,
      collectChannels: false,
      signal: input.signal,
      onChannelsBatch: (channels: IptvChannel[]) =>
        session.writeBatch(channels, { confirmedBytes: bytesReceived }),
    };
    const parsed = input.source.kind === 'stream'
      ? await parseM3uPlaylistProgressiveFromStream(input.source.stream, {
          ...parserOptions, onBytesReceived: (bytes) => { bytesReceived = bytes; },
        })
      : await parseM3uPlaylistProgressive(input.source.text, parserOptions);
    if (parsed.channels.length !== 0) throw new Error('LOCAL_CATALOG_CHANNEL_COLLECTION_UNEXPECTED');
    await session.complete({
      parsedItems: parsed.stats.channelsParsed,
      confirmedBytes: bytesReceived,
    });
    const metrics = session.getMetrics();
    return {
      snapshotId: input.snapshotId, status: 'ready',
      transport: input.source.kind === 'stream' ? 'streaming' : 'whole_text_fallback',
      sizeRange: range, parsedItems: parsed.stats.channelsParsed,
      insertedItems: metrics.insertedItems,
      duplicatesIgnored: metrics.duplicatesIgnored,
      batchesCommitted: metrics.batchesCommitted,
      resumedFromItems: metrics.resumedFromItems,
      collectedChannelsCount: 0,
      peakBatchSize: metrics.peakBatchSize,
      peakTransformQueue: metrics.peakTransformQueue,
      peakInMemoryItems: metrics.peakInMemoryItems,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      await session.cancel().catch(() => undefined);
    } else {
      await session.fail(sanitizedFailureCode(error)).catch(() => undefined);
    }
    // Raw parser/import causes are intentionally replaced with a safe code.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(sanitizedFailureCode(error));
  }
}

export function promoteLocalCatalogSnapshotImport(input: {
  scopeKey: string; snapshotId: string; expectedRuntimeEpoch: number;
}) {
  return promoteLocalCatalogStagingSnapshot({ ...input, timestamp: new Date().toISOString() });
}
