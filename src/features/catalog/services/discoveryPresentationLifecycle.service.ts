/**
 * XANDEFLIX 2.0 — DISCOVERY PRESENTATION LIFECYCLE SERVICE (DISCOVERY-2B)
 *
 * Orquestrador puro e determinístico de ciclo de vida de Presentation Snapshots.
 *
 * REGRAS ARQUITETURAIS:
 * 1. 100% síncrono e em memória (sem React, sem storage, sem APIs de rede, sem Date.now).
 * 2. Aplicação estrita dos contratos de recomposição por fronteira de sessão.
 * 3. Preservação de snapshot ativa durante background refresh da mesma sessão (D19).
 * 4. Atualização de payload no mesmo ID e slot quando na mesma sessão e mesma geração.
 */

import type { HomeVodItem } from './homeVod.service';
import {
  createDiscoveryGenerationKey,
  createDiscoveryPresentationSnapshot,
  refreshDiscoveryPresentationSnapshotItems,
  type DiscoveryCandidateItem,
  type DiscoveryGenerationKey,
  type DiscoveryPresentationSnapshot,
  type DiscoverySectionKey,
  type DiscoverySessionSeed,
  type DiscoverySurfaceKey,
} from './discoverySelector.service';
import type { LoadLocalCatalogDiscoveryGroupCandidatesResult } from '../../localCatalog/readModels/localCatalogDiscoveryCandidateReadModel.service';

export type DiscoveryLifecycleDecision =
  | 'created'
  | 'refreshed'
  | 'preserved-defer'
  | 'preserved-new-generation'
  | 'unavailable';

export type ResolveDiscoveryPresentationLifecycleOptions<
  T extends DiscoveryCandidateItem = HomeVodItem,
> = {
  candidateResult: LoadLocalCatalogDiscoveryGroupCandidatesResult;
  sessionSeed: DiscoverySessionSeed;
  surfaceKey: DiscoverySurfaceKey;
  sectionKey: DiscoverySectionKey;
  slotCount: number;
  activeSnapshot?: DiscoveryPresentationSnapshot<T>;
  isArtworkReady?: (candidate: T) => boolean;
};

export type ResolveDiscoveryPresentationLifecycleResult<
  T extends DiscoveryCandidateItem = HomeVodItem,
> = {
  status: 'ready' | 'defer' | 'unavailable';
  decision: DiscoveryLifecycleDecision;
  snapshot?: DiscoveryPresentationSnapshot<T>;
  currentGenerationKey?: DiscoveryGenerationKey;
  pendingGenerationKey?: DiscoveryGenerationKey;
  generationChanged: boolean;
};

/**
 * Resolve o ciclo de vida da apresentação determinando se uma Presentation Snapshot
 * deve ser criada, atualizada no mesmo slot, preservada (defer ou nova geração em sessão ativa)
 * ou invalidada (unavailable).
 */
export function resolveDiscoveryPresentationLifecycle<
  T extends DiscoveryCandidateItem = HomeVodItem,
>(
  options: ResolveDiscoveryPresentationLifecycleOptions<T>,
): ResolveDiscoveryPresentationLifecycleResult<T> {
  const {
    candidateResult,
    sessionSeed,
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot,
    isArtworkReady,
  } = options;

  // Validação estrita de slotCount
  if (
    typeof slotCount !== 'number' ||
    !Number.isFinite(slotCount) ||
    Number.isNaN(slotCount) ||
    slotCount <= 0
  ) {
    return {
      status: 'unavailable',
      decision: 'unavailable',
      snapshot: undefined,
      generationChanged: false,
    };
  }

  // Validação do escopo da snapshot ativa (snapshots pertencem a uma surfaceKey e sectionKey específicas)
  const matchingActiveSnapshot =
    activeSnapshot &&
    activeSnapshot.surfaceKey === surfaceKey &&
    activeSnapshot.sectionKey === sectionKey
      ? activeSnapshot
      : undefined;

  // 1.Tratamento de status 'unavailable' (Access/Storage Mismatch remove snapshot anterior)
  if (candidateResult.status === 'unavailable') {
    return {
      status: 'unavailable',
      decision: 'unavailable',
      snapshot: undefined,
      generationChanged: false,
    };
  }

  // 2. Tratamento de status 'defer' (importing / failed / canceled)
  if (candidateResult.status === 'defer') {
    if (matchingActiveSnapshot && matchingActiveSnapshot.sessionSeed === sessionSeed) {
      return {
        status: 'defer',
        decision: 'preserved-defer',
        snapshot: matchingActiveSnapshot,
        currentGenerationKey: matchingActiveSnapshot.generationKey,
        generationChanged: false,
      };
    }

    return {
      status: 'defer',
      decision: 'preserved-defer',
      snapshot: undefined,
      generationChanged: false,
    };
  }

  // 3. Tratamento de status 'ready'
  if (!candidateResult.generation) {
    return {
      status: 'unavailable',
      decision: 'unavailable',
      snapshot: undefined,
      generationChanged: false,
    };
  }

  const candidateGenerationKey = createDiscoveryGenerationKey([
    candidateResult.generation.sourceId,
    candidateResult.generation.classificationVersion,
    candidateResult.generation.lastSuccessfulImportAt,
  ]);

  const candidateItems = (candidateResult.items ?? []) as unknown as T[];

  // Cenário: Existe snapshot ativa para a mesma sessão e escopo
  if (matchingActiveSnapshot && matchingActiveSnapshot.sessionSeed === sessionSeed) {
    // Subcenário A: Mesma geração -> Refresh de payload mantendo slots e ordens (Refreshed)
    if (matchingActiveSnapshot.generationKey === candidateGenerationKey) {
      const refreshedSnapshot = refreshDiscoveryPresentationSnapshotItems(
        matchingActiveSnapshot,
        candidateItems,
        isArtworkReady,
      );

      return {
        status: 'ready',
        decision: 'refreshed',
        snapshot: refreshedSnapshot,
        currentGenerationKey: candidateGenerationKey,
        generationChanged: false,
      };
    }

    // Subcenário B: Nova geração durante a MESMA sessão -> Preserva a snapshot ativa antiga (Contrato D19)
    return {
      status: 'ready',
      decision: 'preserved-new-generation',
      snapshot: matchingActiveSnapshot,
      currentGenerationKey: matchingActiveSnapshot.generationKey,
      pendingGenerationKey: candidateGenerationKey,
      generationChanged: true,
    };
  }

  // Cenário: Sem snapshot ativa OU snapshot ativa pertence a uma sessão anterior (Nova Sessão)
  const isNewSession = Boolean(
    matchingActiveSnapshot && matchingActiveSnapshot.sessionSeed !== sessionSeed,
  );

  const newSnapshot = createDiscoveryPresentationSnapshot({
    candidates: candidateItems,
    sessionSeed,
    generationKey: candidateGenerationKey,
    surfaceKey,
    sectionKey,
    slotCount,
    isArtworkReady,
  });

  return {
    status: 'ready',
    decision: 'created',
    snapshot: newSnapshot,
    currentGenerationKey: candidateGenerationKey,
    generationChanged: isNewSession
      ? matchingActiveSnapshot!.generationKey !== candidateGenerationKey
      : false,
  };
}
