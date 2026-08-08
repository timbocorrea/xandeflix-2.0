import {
  clearDiscoveryRuntimePresentationState,
  getDiscoveryRuntimePresentationSnapshot,
  removeDiscoveryRuntimePresentationSnapshot,
  type DiscoveryRuntimeAccessScope,
} from './discoveryRuntimePresentationStore.service';
import {
  getRecentRotationItemIds,
  clearRotationHistoryForScopeForTests,
} from './localCatalogRotationHistory.service';
import { resolveLocalCatalogDiscoverySnapshot } from './localCatalogDiscoverySnapshot.service';
import type { HomeVodItem } from './homeVod.service';

export type LocalCatalogDiscoverySnapshotSmokeTestResult = {
  ok: boolean;
  newSnapshotSelectsValidCandidates: boolean;
  currentCandidatePayloadRefreshed: boolean;
  unavailableSlotReplaced: boolean;
  rotationHistoryRespected: boolean;
  artworkIndependentEligibility: boolean;
  networkRequestAvoided: boolean;
};

const SCOPE: DiscoveryRuntimeAccessScope = {
  licenseCode: 'SMOKE-LICENSE',
  deviceIdentifier: 'smoke-device',
  sourceId: 'smoke-local-source',
};

function candidate(id: string, title: string): HomeVodItem {
  return {
    id,
    title,
    kind: 'movie',
  };
}

function resolveSnapshot(input: {
  sectionKey: string;
  generationKey: string;
  candidates: HomeVodItem[];
  slotCount: number;
  historyItemCount?: number;
}) {
  return resolveLocalCatalogDiscoverySnapshot({
    scope: SCOPE,
    surfaceKey: 'vs02-smoke',
    sectionKey: input.sectionKey,
    generationKey: input.generationKey,
    candidates: input.candidates,
    slotCount: input.slotCount,
    historyKind: 'CATEGORY_DISCOVERY_WINDOW',
    historyItemCount: input.historyItemCount,
    isArtworkReady: (item) => Boolean(item.backdropUrl?.trim()),
  });
}

export async function runLocalCatalogDiscoverySnapshotSmokeTest(): Promise<LocalCatalogDiscoverySnapshotSmokeTestResult> {
  clearDiscoveryRuntimePresentationState();
  clearRotationHistoryForScopeForTests(SCOPE);

  let networkRequestCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    networkRequestCount += 1;
    throw new Error('VS02_SMOKE_NETWORK_REQUEST_FORBIDDEN');
  }) as typeof globalThis.fetch;

  try {
    const initialRefreshCandidates = [
      candidate('refresh-a', 'Titulo anterior A'),
      candidate('refresh-b', 'Titulo anterior B'),
    ];
    const initialRefresh = resolveSnapshot({
      sectionKey: 'payload-refresh',
      generationKey: 'generation:refresh:1',
      candidates: initialRefreshCandidates,
      slotCount: 2,
    });
    const refreshedCandidates = initialRefreshCandidates.map((item) => ({
      ...item,
      title: `${item.title} atualizado`,
    }));
    const refreshed = resolveSnapshot({
      sectionKey: 'payload-refresh',
      generationKey: 'generation:refresh:2',
      candidates: refreshedCandidates,
      slotCount: 2,
    });
    const persistedRefresh = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
      SCOPE,
      'vs02-smoke',
      'payload-refresh',
    );
    const newSnapshotSelectsValidCandidates =
      initialRefresh.created &&
      initialRefresh.items.length === initialRefreshCandidates.length &&
      initialRefresh.items.every((item) =>
        initialRefreshCandidates.some((candidateItem) => candidateItem.id === item.id),
      );
    const currentCandidatePayloadRefreshed =
      initialRefresh.created &&
      !refreshed.created &&
      refreshed.items.every((item) => item.title.endsWith(' atualizado')) &&
      persistedRefresh?.slots.every((slot) =>
        slot.payload.title.endsWith(' atualizado'),
      ) === true;

    const unavailableInitial = resolveSnapshot({
      sectionKey: 'unavailable-slot',
      generationKey: 'generation:unavailable:1',
      candidates: [
        candidate('available-a', 'Disponivel A'),
        candidate('available-b', 'Disponivel B'),
        candidate('available-c', 'Disponivel C'),
      ],
      slotCount: 2,
      historyItemCount: 2,
    });
    const removedId = unavailableInitial.items[0]?.id;
    const currentAvailableCandidates = [
      candidate('available-a', 'Disponivel A atual'),
      candidate('available-b', 'Disponivel B atual'),
      candidate('available-c', 'Disponivel C atual'),
      candidate('available-d', 'Disponivel D'),
    ].filter((item) => item.id !== removedId);
    const unavailableResolved = resolveSnapshot({
      sectionKey: 'unavailable-slot',
      generationKey: 'generation:unavailable:2',
      candidates: currentAvailableCandidates,
      slotCount: 2,
      historyItemCount: 2,
    });
    const unavailableSlotReplaced =
      Boolean(removedId) &&
      unavailableResolved.created &&
      unavailableResolved.items.length === 2 &&
      unavailableResolved.items.every(
        (item) =>
          item.id !== removedId &&
          currentAvailableCandidates.some((candidateItem) => candidateItem.id === item.id),
      );

    const rotationCandidates = [
      candidate('rotation-a', 'Rotacao A'),
      candidate('rotation-b', 'Rotacao B'),
      candidate('rotation-c', 'Rotacao C'),
    ];
    const firstRotation = resolveSnapshot({
      sectionKey: 'rotation-history',
      generationKey: 'generation:rotation:1',
      candidates: rotationCandidates,
      slotCount: 1,
    });
    const firstRotationId = firstRotation.items[0]?.id;
    const rotationHistory = getRecentRotationItemIds({
      scope: SCOPE,
      kind: 'CATEGORY_DISCOVERY_WINDOW',
      surfaceKey: 'vs02-smoke:rotation-history',
    });
    removeDiscoveryRuntimePresentationSnapshot(
      SCOPE,
      'vs02-smoke',
      'rotation-history',
    );
    const secondRotation = resolveSnapshot({
      sectionKey: 'rotation-history',
      generationKey: 'generation:rotation:2',
      candidates: rotationCandidates,
      slotCount: 1,
    });
    const rotationHistoryRespected =
      typeof firstRotationId === 'string' &&
      rotationHistory.includes(firstRotationId) &&
      secondRotation.items[0]?.id !== firstRotationId;

    const artworkIndependent = resolveSnapshot({
      sectionKey: 'artwork-independent',
      generationKey: 'generation:artwork-independent:1',
      candidates: [candidate('without-artwork', 'Valido sem arte')],
      slotCount: 1,
    });
    const artworkIndependentEligibility =
      artworkIndependent.items.length === 1 &&
      artworkIndependent.items[0]?.id === 'without-artwork';
    const networkRequestAvoided = networkRequestCount === 0;
    const assertions = {
      newSnapshotSelectsValidCandidates,
      currentCandidatePayloadRefreshed,
      unavailableSlotReplaced,
      rotationHistoryRespected,
      artworkIndependentEligibility,
      networkRequestAvoided,
    };

    return {
      ok: Object.values(assertions).every(Boolean),
      ...assertions,
    };
  } finally {
    globalThis.fetch = originalFetch;
    clearDiscoveryRuntimePresentationState();
    clearRotationHistoryForScopeForTests(SCOPE);
  }
}
