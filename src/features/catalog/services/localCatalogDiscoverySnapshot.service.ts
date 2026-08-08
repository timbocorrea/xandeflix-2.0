import type { HomeVodItem } from './homeVod.service';
import { getHorizontalHeroArtworkCandidates } from './heroArtworkPolicy.service';
import {
  createDiscoveryGenerationKey,
  createDiscoveryPresentationSnapshot,
  fnv1a32Pure,
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

function prepareDiscoveryCandidates<T extends DiscoveryCandidateItem>(input: {
  surfaceKey: string;
  sectionKey: string;
  candidates: T[];
}) {
  if (input.surfaceKey !== 'home' || input.sectionKey !== 'hero') {
    return input.candidates;
  }

  return input.candidates
    .filter(
      (candidate) =>
        getHorizontalHeroArtworkCandidates(
          candidate as unknown as HomeVodItem,
        ).length > 0,
    )
    .map(
      (candidate) =>
        ({
          ...candidate,
          posterUrl: undefined,
        }) as T,
    );
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
  const candidates = prepareDiscoveryCandidates(input);
  const candidateById = new Map(
    candidates
      .map((candidate) => [candidate.id.trim(), candidate] as const)
      .filter(([candidateId]) => Boolean(candidateId)),
  );
  const runtimeContext = getOrCreateDiscoveryRuntimeContext(input.scope);

  if (!runtimeContext.isValid || !runtimeContext.sessionSeed) {
    return {
      items: candidates.slice(0, Math.max(0, input.slotCount)),
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
    const refreshedStoredItems = stored.slots
      .map((slot) => candidateById.get(slot.id.trim()))
      .filter((candidate): candidate is T => Boolean(candidate));

    if (refreshedStoredItems.length === stored.slots.length) {
      return {
        items: refreshedStoredItems,
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
  const candidateIds = new Set(candidateById.keys());
  const poolExhausted =
    candidateIds.size > 0 &&
    Array.from(candidateIds).every((candidateId) =>
      recentIds.includes(candidateId),
    );
  const snapshot = createDiscoveryPresentationSnapshot({
    candidates,
    sessionSeed: runtimeContext.sessionSeed,
    generationKey: input.generationKey,
    surfaceKey: input.surfaceKey,
    sectionKey: input.sectionKey,
    slotCount: Math.min(input.slotCount, candidates.length),
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
