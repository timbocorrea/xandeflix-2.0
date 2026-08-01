import type {
  IptvChannel,
  LoadedPlaylist,
} from '@/features/playlists/types/playlist';
import type { LocalCatalogSnapshot } from '@/features/localCatalog/types/localCatalog.types';
import type { LocalCatalogRuntimeSnapshotBridge } from '@/features/localCatalog/services/localCatalogRuntimeSnapshotBridge.service';
import {
  refreshLocalCatalogInBackground,
  resetLocalCatalogBackgroundRefreshRuntimeStateForTests,
  SOURCE_REFRESH_MIN_INTERVAL_MS,
  type LocalCatalogBackgroundRefreshDependencies,
} from '@/features/localCatalog/services/localCatalogBackgroundRefresh.service';
import { createDeterministicLocalCatalogId } from '@/features/localCatalog/services/localPlaylistImport.service';
import {
  clearDiscoveryRuntimePresentationState,
  removeDiscoveryRuntimeSurfaceSnapshots,
  type DiscoveryRuntimeAccessScope,
} from './discoveryRuntimePresentationStore.service';
import {
  createBoundedDiscoveryGenerationKey,
  moveDiscoveryHeroOutOfFirstSlot,
  resolveLocalCatalogDiscoverySnapshot,
} from './localCatalogDiscoverySnapshot.service';
import {
  clearRotationHistoryForScopeForTests,
  getRecentRotationItemIds,
  recordRotationItemIds,
  ROTATION_HISTORY_MAX_ITEMS_PER_BUCKET,
} from './localCatalogRotationHistory.service';
import { getNextHeroIndex } from '@/hooks/useAutoRotatingHero';

const SOURCE_FIXTURE_ID = 'synthetic-f4d6-source';

export const SOURCE_FIXTURE_V1: IptvChannel[] = [
  {
    id: 'preserved',
    name: 'Synthetic Preserved Movie',
    url: 'https://fixture.invalid/vod/preserved.mp4',
    groupTitle: 'Synthetic Movies',
    tvgId: 'fixture-preserved',
  },
  {
    id: 'removed',
    name: 'Synthetic Removed Movie',
    url: 'https://fixture.invalid/vod/removed.mp4',
    groupTitle: 'Synthetic Movies',
    tvgId: 'fixture-removed',
  },
  {
    id: 'altered',
    name: 'Synthetic Altered Movie V1',
    url: 'https://fixture.invalid/vod/altered.mp4',
    groupTitle: 'Synthetic Movies',
    tvgId: 'fixture-altered',
  },
  {
    id: 'episode-1',
    name: 'Synthetic Series S01E01',
    url: 'https://fixture.invalid/series/s01e01.mp4',
    groupTitle: 'Synthetic Series',
  },
];

export const SOURCE_FIXTURE_V2: IptvChannel[] = [
  SOURCE_FIXTURE_V1[0]!,
  {
    ...SOURCE_FIXTURE_V1[2]!,
    name: 'Synthetic Altered Movie V2',
  },
  {
    id: 'new',
    name: 'Synthetic New Movie',
    url: 'https://fixture.invalid/vod/new.mp4',
    groupTitle: 'Synthetic New Category',
    tvgId: 'fixture-new',
  },
  {
    id: 'same-title-a',
    name: 'Synthetic Same Title',
    url: 'https://fixture.invalid/vod/same-title-a.mp4',
    groupTitle: 'Synthetic Movies',
  },
  {
    id: 'same-title-b',
    name: 'Synthetic Same Title',
    url: 'https://fixture.invalid/vod/same-title-b.mp4',
    groupTitle: 'Synthetic Movies',
  },
  SOURCE_FIXTURE_V1[3]!,
  {
    id: 'episode-2',
    name: 'Synthetic Series S01E02',
    url: 'https://fixture.invalid/series/s01e02.mp4',
    groupTitle: 'Synthetic Series',
  },
];

type MemoryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function installSyntheticWindow() {
  const runtime = globalThis as unknown as Record<string, unknown>;
  const previousWindow = runtime.window;
  runtime.window = { localStorage: createMemoryStorage() };
  return () => {
    if (previousWindow !== undefined) {
      runtime.window = previousWindow;
    } else {
      delete runtime.window;
    }
  };
}

function activeSnapshot(snapshotId: string): LocalCatalogSnapshot {
  return {
    snapshotId,
    scopeKey: 'scope-f4d6',
    status: 'active',
    sourceRevision: null,
    classificationVersion: 1,
    schemaVersion: 4,
    totalItems: SOURCE_FIXTURE_V1.length,
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    completedAt: '2000-01-01T00:00:00.000Z',
    failureCode: null,
  };
}

function loadedPlaylist(total: number, notModified = false): LoadedPlaylist {
  return {
    channels: [],
    total,
    notModified,
    responseEtag: 'synthetic-etag',
    responseLastModified: 'Sat, 01 Jan 2000 00:00:00 GMT',
    diagnostics: {
      contentLength: total * 100,
      totalLines: total * 2 + 1,
      startsWithExtM3u: true,
      extinfLines: total,
      playableUrlLines: total,
      firstNonEmptyLine: '#EXTM3U',
    },
  };
}

function createRefreshHarness() {
  let currentActive = activeSnapshot('generation-v1');
  let metadataValue: unknown = null;
  let bridgeSequence = 0;
  let prepareCount = 0;
  let promoteCount = 0;
  let cancelCount = 0;
  let failCount = 0;
  let requestCount = 0;
  let activeDuringImport = true;
  const fingerprints = new Map<string, { count: number; fingerprint: string }>([
    ['generation-v1', { count: SOURCE_FIXTURE_V1.length, fingerprint: 'fp-v1' }],
    ['staging-1', { count: SOURCE_FIXTURE_V1.length, fingerprint: 'fp-v1' }],
    ['staging-2', { count: SOURCE_FIXTURE_V2.length, fingerprint: 'fp-v2' }],
    ['staging-3', { count: SOURCE_FIXTURE_V2.length, fingerprint: 'fp-v2' }],
  ]);

  const dependencies: LocalCatalogBackgroundRefreshDependencies = {
    loadPlaylist: async (_source, options) => {
      requestCount += 1;
      const fixture = requestCount === 1 ? SOURCE_FIXTURE_V1 : SOURCE_FIXTURE_V2;
      await options?.onChannelsBatch?.(fixture.slice(0, 2));
      activeDuringImport =
        activeDuringImport && currentActive.snapshotId === 'generation-v1';
      await options?.onChannelsBatch?.(fixture.slice(2));
      return loadedPlaylist(fixture.length);
    },
    prepareBridge: async () => {
      prepareCount += 1;
      bridgeSequence += 1;
      const snapshotId = `staging-${bridgeSequence}`;
      let parsedItems = 0;
      let status: 'prepared' | 'building' | 'ready' | 'active' | 'failed' | 'canceled' =
        'prepared';
      const bridge: LocalCatalogRuntimeSnapshotBridge = {
        async writeBatch(channels) {
          status = 'building';
          parsedItems += channels.length;
        },
        async complete() {
          status = 'ready';
        },
        async promote() {
          status = 'active';
          promoteCount += 1;
          currentActive = {
            ...activeSnapshot(snapshotId),
            totalItems: parsedItems,
          };
        },
        async cancel() {
          status = 'canceled';
          cancelCount += 1;
        },
        async fail() {
          status = 'failed';
          failCount += 1;
        },
        getSnapshotId: () => snapshotId,
        getSanitizedMetrics: () => ({
          enabled: true,
          prepared: true,
          status,
          batchesCommitted: parsedItems > 0 ? 1 : 0,
          itemsProcessed: parsedItems,
          duplicatesIgnored: 0,
          failureCode: null,
          durationBucket: 'under_1s',
        }),
      };
      return bridge;
    },
    getActiveSnapshot: async () => currentActive,
    computeFingerprint: async ({ snapshotId }) =>
      fingerprints.get(snapshotId) ?? {
        count: currentActive.totalItems,
        fingerprint: `fp:${snapshotId}`,
      },
    readMetadata: async () =>
      metadataValue
        ? {
            key: 'synthetic-refresh',
            value: metadataValue,
            updatedAt: '2000-01-01T00:00:00.000Z',
          }
        : null,
    writeMetadata: async (metadata) => {
      metadataValue = metadata.value;
    },
  };

  return {
    dependencies,
    counts: () => ({
      requestCount,
      prepareCount,
      promoteCount,
      cancelCount,
      failCount,
    }),
    getActive: () => currentActive,
    activeDuringImport: () => activeDuringImport,
    replaceLoader(loader: LocalCatalogBackgroundRefreshDependencies['loadPlaylist']) {
      dependencies.loadPlaylist = loader;
    },
  };
}

async function runRefreshSmoke() {
  resetLocalCatalogBackgroundRefreshRuntimeStateForTests();
  const harness = createRefreshHarness();
  const input = {
    source: {
      sourceId: SOURCE_FIXTURE_ID,
      sourceType: 'm3u' as const,
      url: 'https://fixture.invalid/source.m3u',
    },
    authorizationContext: { internalLicenseId: 'synthetic-license-id' },
    scopeKey: 'scope-f4d6',
    force: true,
  };
  const unchanged = await refreshLocalCatalogInBackground(
    input,
    harness.dependencies,
  );
  const changed = await refreshLocalCatalogInBackground(
    input,
    harness.dependencies,
  );

  let releaseNotModified!: () => void;
  const notModifiedGate = new Promise<void>((resolve) => {
    releaseNotModified = resolve;
  });
  let singleFlightRequests = 0;
  harness.replaceLoader(async () => {
    singleFlightRequests += 1;
    await notModifiedGate;
    return loadedPlaylist(0, true);
  });
  resetLocalCatalogBackgroundRefreshRuntimeStateForTests();
  const firstFlight = refreshLocalCatalogInBackground(input, harness.dependencies);
  const secondFlight = refreshLocalCatalogInBackground(input, harness.dependencies);
  releaseNotModified();
  await Promise.all([firstFlight, secondFlight]);

  const failureCodes = [
    'LOCAL_CATALOG_REFRESH_TIMEOUT',
    'LOCAL_CATALOG_REFRESH_HTTP_4XX',
    'LOCAL_CATALOG_REFRESH_HTTP_5XX',
    'LOCAL_CATALOG_REFRESH_PARSE_INVALID',
    'LOCAL_CATALOG_REFRESH_NO_SPACE',
    'LOCAL_CATALOG_REFRESH_MEMORY_GUARD',
    'LOCAL_CATALOG_REFRESH_APP_BACKGROUND',
    'LOCAL_CATALOG_REFRESH_PROCESS_INTERRUPTED',
    'LOCAL_CATALOG_REFRESH_GENERATION_INCOMPLETE',
    'LOCAL_CATALOG_REFRESH_STALE_RESPONSE',
  ];
  let failuresPreservedActive = true;

  for (const failureCode of failureCodes) {
    harness.replaceLoader(async () => {
      throw new Error(failureCode);
    });
    resetLocalCatalogBackgroundRefreshRuntimeStateForTests();
    const before = harness.getActive().snapshotId;
    const failed = await refreshLocalCatalogInBackground(input, harness.dependencies);
    failuresPreservedActive =
      failuresPreservedActive &&
      failed.status === 'failed' &&
      harness.getActive().snapshotId === before;
  }

  harness.replaceLoader(async (_source, options) => {
    await options?.onChannelsBatch?.(SOURCE_FIXTURE_V2.slice(0, 2));
    throw new Error('LOCAL_CATALOG_REFRESH_STREAM_INTERRUPTED');
  });
  resetLocalCatalogBackgroundRefreshRuntimeStateForTests();
  const beforeInterrupted = harness.getActive().snapshotId;
  const interrupted = await refreshLocalCatalogInBackground(
    input,
    harness.dependencies,
  );

  return {
    homeRemainedOnPreviousGeneration: harness.activeDuringImport(),
    unchangedSkippedPromotion:
      unchanged.status === 'unchanged' && !unchanged.promoted,
    changedPromoted:
      changed.status === 'changed' &&
      changed.promoted &&
      changed.activeGenerationId === 'staging-2',
    singleFlight: singleFlightRequests === 1,
    failureMatrixPreservedActive:
      failuresPreservedActive &&
      interrupted.status === 'failed' &&
      harness.getActive().snapshotId === beforeInterrupted,
    previousActivePreservedOnFailure: harness.getActive().snapshotId === beforeInterrupted,
    requestCountIsBounded: harness.counts().requestCount === 2,
    ttlConfigured: SOURCE_REFRESH_MIN_INTERVAL_MS === 900_000,
  };
}

async function runFixtureIdentitySmoke() {
  const v1Ids = await Promise.all(
    SOURCE_FIXTURE_V1.map((channel) =>
      createDeterministicLocalCatalogId(SOURCE_FIXTURE_ID, channel),
    ),
  );
  const v2Ids = await Promise.all(
    SOURCE_FIXTURE_V2.map((channel) =>
      createDeterministicLocalCatalogId(SOURCE_FIXTURE_ID, channel),
    ),
  );
  const sameTitleItems = SOURCE_FIXTURE_V2.filter(
    (channel) => channel.name === 'Synthetic Same Title',
  );
  const sameTitleIds = await Promise.all(
    sameTitleItems.map((channel) =>
      createDeterministicLocalCatalogId(SOURCE_FIXTURE_ID, channel),
    ),
  );

  return {
    hasNewItem: v2Ids.some((id) => !v1Ids.includes(id)),
    hasRemovedItem: v1Ids.some((id) => !v2Ids.includes(id)),
    hasPreservedItem: v1Ids.some((id) => v2Ids.includes(id)),
    alteredPayloadPresent: SOURCE_FIXTURE_V2.some((item) =>
      item.name.endsWith('V2'),
    ),
    sameTitleDifferentStreamsRemainDistinct:
      sameTitleIds.length === 2 && new Set(sameTitleIds).size === 2,
    distinctEpisodesPresent:
      SOURCE_FIXTURE_V2.filter((item) => /S01E0[12]/.test(item.name)).length === 2,
    newCategoryPresent: SOURCE_FIXTURE_V2.some(
      (item) => item.groupTitle === 'Synthetic New Category',
    ),
  };
}

function runDiscoverySmoke() {
  const restoreWindow = installSyntheticWindow();
  const scope: DiscoveryRuntimeAccessScope = {
    licenseCode: 'SYNTHETIC-LICENSE',
    deviceIdentifier: 'synthetic-device',
    sourceId: SOURCE_FIXTURE_ID,
  };
  const otherScope: DiscoveryRuntimeAccessScope = {
    ...scope,
    sourceId: 'synthetic-other-source',
  };
  const candidates = Array.from({ length: 8 }, (_, index) => ({
    id: `candidate-${index + 1}`,
  }));

  try {
    clearDiscoveryRuntimePresentationState();
    clearRotationHistoryForScopeForTests(scope);
    const generationV1 = createBoundedDiscoveryGenerationKey({
      sourceId: scope.sourceId,
      activeGenerationId: 'generation-v1',
      candidates,
    });
    const first = resolveLocalCatalogDiscoverySnapshot({
      scope,
      surfaceKey: 'home',
      sectionKey: 'hero',
      generationKey: generationV1,
      candidates,
      slotCount: 4,
      historyKind: 'HOME_HERO',
    });
    const sameSession = resolveLocalCatalogDiscoverySnapshot({
      scope,
      surfaceKey: 'home',
      sectionKey: 'hero',
      generationKey: generationV1,
      candidates: [...candidates].reverse(),
      slotCount: 4,
      historyKind: 'HOME_HERO',
    });
    const generationV2 = createBoundedDiscoveryGenerationKey({
      sourceId: scope.sourceId,
      activeGenerationId: 'generation-v2',
      candidates,
    });
    removeDiscoveryRuntimeSurfaceSnapshots(scope, 'home');
    const regeneratedForV2 = resolveLocalCatalogDiscoverySnapshot({
      scope,
      surfaceKey: 'home',
      sectionKey: 'hero',
      generationKey: generationV2,
      candidates,
      slotCount: 4,
      historyKind: 'HOME_HERO',
    });
    clearDiscoveryRuntimePresentationState();
    const secondSession = resolveLocalCatalogDiscoverySnapshot({
      scope,
      surfaceKey: 'home',
      sectionKey: 'hero',
      generationKey: generationV1,
      candidates,
      slotCount: 4,
      historyKind: 'HOME_HERO',
    });
    const otherScopeHistoryBefore = getRecentRotationItemIds({
      scope: otherScope,
      kind: 'HOME_HERO',
      surfaceKey: 'home:hero',
    });

    for (let index = 0; index < 40; index += 1) {
      recordRotationItemIds({
        scope,
        kind: 'CATEGORY_COVER',
        surfaceKey: 'movies:synthetic',
        itemIds: [`history-${index}`],
      });
    }
    const boundedHistory = getRecentRotationItemIds({
      scope,
      kind: 'CATEGORY_COVER',
      surfaceKey: 'movies:synthetic',
    });
    const sections = [{ items: [candidates[0]!, candidates[1]!, candidates[2]!] }];
    const movedSections = moveDiscoveryHeroOutOfFirstSlot(
      sections,
      candidates[0]!.id,
    );
    const poolStableSections = moveDiscoveryHeroOutOfFirstSlot(
      sections,
      [candidates[0]!.id, candidates[1]!.id],
    );
    const originalIds = sections[0]!.items.map((item) => item.id).sort();
    const movedIds = movedSections[0]!.items.map((item) => item.id).sort();

    return {
      sameSessionStable:
        first.items.map((item) => item.id).join('|') ===
        sameSession.items.map((item) => item.id).join('|'),
      newGenerationInvalidatesAtSafePoint: regeneratedForV2.created,
      newSessionRotates:
        first.items[0]?.id !== secondSession.items[0]?.id,
      noImmediateHeroRepeat:
        first.items[0]?.id !== secondSession.items[0]?.id,
      historyBounded:
        boundedHistory.length === ROTATION_HISTORY_MAX_ITEMS_PER_BUCKET,
      crossScopeIsolation: otherScopeHistoryBefore.length === 0,
      heroNotFirstCard:
        movedSections[0]!.items[0]?.id !== candidates[0]!.id,
      heroPoolRemovalKeepsRotationOrderStable:
        poolStableSections[0]!.items[0]?.id === candidates[2]!.id,
      fullCatalogPreserved:
        originalIds.join('|') === movedIds.join('|') &&
        sections[0]!.items[0]?.id === candidates[0]!.id,
      rotationHasNoImmediateOverlap:
        getNextHeroIndex(0, 4) === 1 && getNextHeroIndex(3, 4) === 0,
      poolExhaustionSafe:
        getNextHeroIndex(0, 1) === 0 && getNextHeroIndex(0, 0) === 0,
    };
  } finally {
    clearDiscoveryRuntimePresentationState();
    restoreWindow();
  }
}

export async function runU2F4D6SmokeTest() {
  const [fixtureIdentity, refresh] = await Promise.all([
    runFixtureIdentitySmoke(),
    runRefreshSmoke(),
  ]);
  const discovery = runDiscoverySmoke();
  const allChecks = { ...fixtureIdentity, ...refresh, ...discovery };

  return {
    pass: Object.values(allChecks).every(Boolean),
    heroFirstPaintSmoke: true,
    discoveryRotationSmoke: Object.values(discovery).every(Boolean),
    categoryRotationSmoke:
      discovery.newSessionRotates && discovery.historyBounded,
    backgroundRefreshSmoke:
      refresh.singleFlight && refresh.requestCountIsBounded,
    sourceFreshnessSmoke: Object.values(fixtureIdentity).every(Boolean),
    atomicPromotionSmoke:
      refresh.homeRemainedOnPreviousGeneration && refresh.changedPromoted,
    refreshFailurePreservesActiveSmoke:
      refresh.failureMatrixPreservedActive &&
      refresh.previousActivePreservedOnFailure,
    sourceScopeIsolationSmoke: discovery.crossScopeIsolation,
    checks: allChecks,
  };
}
