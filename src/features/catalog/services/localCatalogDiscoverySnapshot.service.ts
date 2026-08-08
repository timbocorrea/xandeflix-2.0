import type { HomeVodItem } from './homeVod.service';
import {
  createDiscoveryCandidatePool,
  createDiscoveryGenerationKey,
  createDiscoveryPresentationSnapshot,
  fnv1a32Pure,
  refreshDiscoveryPresentationSnapshotItems,
  type DiscoveryCandidateItem,
} from './discoverySelector.service';
import {
  getDiscoveryRuntimePresentationSnapshot,
  getOrCreateDiscoveryRuntimeContext,
  setDiscoveryRuntimePresentationSnapshot,
  type DiscoveryRuntimeAccessScope,
} from './discoveryRuntimePresentationStore.service';
import {
  getRecentRotationItemIds,
  recordRotationItemIds,
  type RotationHistoryKind,
} from './localCatalogRotationHistory.service';

export const DISCOVERY_SNAPSHOT_VERSION = 1;

export function createSanitizedDiscoveryFingerprint(itemId?: string | null) {
  const normalizedItemId = itemId?.trim();
  return normalizedItemId
    ? fnv1a32Pure(normalizedItemId).toString(16).padStart(8, '0')
    : undefined;
}

export function createBoundedDiscoveryGenerationKey(input: {
  sourceId: string;
  activeGenerationId?: string | null;
  candidates: readonly DiscoveryCandidateItem[];
}) {
  const candidateIdentity = input.candidates
    .slice(0, 160)
    .map((candidate) => candidate.id.trim())
    .filter(Boolean)
    .join('|');
  const boundedFingerprint = fnv1a32Pure(candidateIdentity)
    .toString(16)
    .padStart(8, '0');

  return createDiscoveryGenerationKey([
    DISCOVERY_SNAPSHOT_VERSION,
    input.sourceId.trim() || 'local-source',
    input.activeGenerationId?.trim() || `bounded:${boundedFingerprint}`,
  ]);
}

export function resolveLocalCatalogDiscoverySnapshot<
  T extends DiscoveryCandidateItem,
>(input: {
  scope: DiscoveryRuntimeAccessScope;
  surfaceKey: string;
  sectionKey: string;
  generationKey: string;
  candidates: T[];
  slotCount: number;
  historyKind: RotationHistoryKind;
  historyItemCount?: number;
  isArtworkReady?: (candidate: T) => boolean;
}) {
  const currentCandidates = createDiscoveryCandidatePool(
    input.candidates,
    input.isArtworkReady,
  );
  const runtimeContext = getOrCreateDiscoveryRuntimeContext(input.scope);

  if (!runtimeContext.isValid || !runtimeContext.sessionSeed) {
    return {
      items: currentCandidates.slice(0, Math.max(0, input.slotCount)),
      created: false,
      poolExhausted: false,
    };
  }

  const stored = getDiscoveryRuntimePresentationSnapshot<T>(
    input.scope,
    input.surfaceKey,
    input.sectionKey,
  );

  if (stored?.slots.length) {
    const currentCandidateIds = new Set(
      currentCandidates.map((candidate) => candidate.id),
    );
    const allStoredItemsStillExist = stored.slots.every((slot) =>
      currentCandidateIds.has(slot.id.trim()),
    );

    if (allStoredItemsStillExist) {
      const refreshedStored = refreshDiscoveryPresentationSnapshotItems(
        stored,
        currentCandidates,
        input.isArtworkReady,
      );
      const currentStored =
        refreshedStored.generationKey === input.generationKey
          ? refreshedStored
          : {
              ...refreshedStored,
              generationKey: input.generationKey,
            };

      if (currentStored !== stored) {
        setDiscoveryRuntimePresentationSnapshot(input.scope, currentStored);
      }

      return {
        items: currentStored.slots.map((slot) => slot.payload),
        created: false,
        poolExhausted: false,
      };
    }
  }

  const recentIds = getRecentRotationItemIds({
    scope: input.scope,
    kind: input.historyKind,
    surfaceKey: `${input.surfaceKey}:${input.sectionKey}`,
  });
  const candidateIds = new Set(
    currentCandidates.map((candidate) => candidate.id),
  );
  const poolExhausted =
    candidateIds.size > 0 &&
    Array.from(candidateIds).every((candidateId) =>
      recentIds.includes(candidateId),
    );
  const snapshot = createDiscoveryPresentationSnapshot({
    candidates: currentCandidates,
    sessionSeed: runtimeContext.sessionSeed,
    generationKey: input.generationKey,
    surfaceKey: input.surfaceKey,
    sectionKey: input.sectionKey,
    slotCount: Math.min(input.slotCount, currentCandidates.length),
    isArtworkReady: input.isArtworkReady,
    excludedIds: poolExhausted ? [] : recentIds,
  });
  setDiscoveryRuntimePresentationSnapshot(input.scope, snapshot);
  const selectedIds = snapshot.slots
    .slice(0, Math.max(1, input.historyItemCount ?? 1))
    .map((slot) => slot.id);
  recordRotationItemIds({
    scope: input.scope,
    kind: input.historyKind,
    surfaceKey: `${input.surfaceKey}:${input.sectionKey}`,
    itemIds: selectedIds,
  });

  return {
    items: snapshot.slots.map((slot) => slot.payload),
    created: true,
    poolExhausted,
  };
}

export function isDiscoveryArtworkReady(item: HomeVodItem) {
  return Boolean(
    item.backdropUrl?.trim() ||
      item.posterUrl?.trim() ||
      item.artworkCandidates?.some((candidate) => candidate.url?.trim()),
  );
}

export function moveDiscoveryHeroOutOfFirstSlot<
  TItem extends DiscoveryCandidateItem,
  TSection extends { items: TItem[] },
>(
  sections: TSection[],
  heroItemId?: string | readonly string[] | null,
) {
  const heroItemIds = Array.isArray(heroItemId) ? heroItemId : [heroItemId];
  const normalizedHeroIds = new Set(
    heroItemIds
      .map((itemId) => itemId?.trim())
      .filter((itemId): itemId is string => Boolean(itemId)),
  );

  if (normalizedHeroIds.size === 0) {
    return sections;
  }

  return sections.map((section) => {
    if (
      section.items.length <= 1 ||
      !normalizedHeroIds.has(section.items[0]?.id ?? '')
    ) {
      return section;
    }

    const items = [...section.items];
    const replacementIndex = items.findIndex(
      (item, index) => index > 0 && !normalizedHeroIds.has(item.id),
    );

    if (replacementIndex < 1) {
      return section;
    }

    [items[0], items[replacementIndex]] = [
      items[replacementIndex]!,
      items[0]!,
    ];
    return { ...section, items };
  });
}
