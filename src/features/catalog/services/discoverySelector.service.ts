/**
 * XANDEFLIX 2.0 — DISCOVERY SELECTOR SERVICE (HARDENED V1A)
 * Primitivas puras e determinísticas de Discovery e Presentation Snapshot.
 *
 * REGRAS ARQUITETURAIS:
 * 1. 100% síncrono e puro (sem Math.random, sem Date.now, sem APIs de rede, storage ou React).
 * 2. Operação sobre genéricos T extends { id: string }.
 * 3. Identidade canônica de ID (trim) em toda a pipeline.
 * 4. Resolução não ambígua de Generation Key sem eliminação posicional.
 * 5. Tipos estruturalmente Readonly no snapshot.
 */

export type DiscoverySessionSeed = string;
export type DiscoveryGenerationKey = string;
export type DiscoverySurfaceKey = string;
export type DiscoverySectionKey = string;

export type DiscoveryCandidateItem = {
  id: string;
};

export type DiscoverySnapshotSlot<T extends DiscoveryCandidateItem> = Readonly<{
  id: string;
  payload: T;
}>;

export type DiscoveryPresentationSnapshot<T extends DiscoveryCandidateItem> = Readonly<{
  sessionSeed: DiscoverySessionSeed;
  generationKey: DiscoveryGenerationKey;
  surfaceKey: DiscoverySurfaceKey;
  sectionKey: DiscoverySectionKey;
  slots: readonly DiscoverySnapshotSlot<T>[];
  itemCount: number;
}>;

export type SelectDiscoveryItemsInput<T extends DiscoveryCandidateItem> = {
  candidates: T[];
  sessionSeed: DiscoverySessionSeed;
  generationKey: DiscoveryGenerationKey;
  surfaceKey: DiscoverySurfaceKey;
  sectionKey: DiscoverySectionKey;
  slotCount: number;
  isArtworkReady?: (candidate: T) => boolean;
  excludedIds?: readonly string[];
};

/**
 * Valida e normaliza uma Session Seed recebida pelo caller.
 * Rejeita valores vazios e não gera aleatoriedade internamente.
 */
export function createDiscoverySessionSeed(value: string): DiscoverySessionSeed {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('DISCOVERY_SESSION_SEED_INVALID_EMPTY');
  }
  return `seed:${trimmed}`;
}

/**
 * Helper para construir uma Generation Key determinística e opaca a partir de partes.
 * Preserva estritamente a posição de cada parte e rejeita valores vazios, null ou não numéricos.
 */
export function createDiscoveryGenerationKey(
  parts: (string | number | undefined | null)[],
): DiscoveryGenerationKey {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('DISCOVERY_GENERATION_KEY_PARTS_REQUIRED');
  }

  const encodedParts: string[] = [];

  for (const part of parts) {
    if (part === null || part === undefined) {
      throw new Error('DISCOVERY_GENERATION_KEY_INVALID_PART');
    }

    let strVal = '';

    if (typeof part === 'number') {
      if (!Number.isFinite(part)) {
        throw new Error('DISCOVERY_GENERATION_KEY_INVALID_PART');
      }
      strVal = String(part);
    } else if (typeof part === 'string') {
      strVal = part.trim();
      if (!strVal) {
        throw new Error('DISCOVERY_GENERATION_KEY_INVALID_PART');
      }
    } else {
      throw new Error('DISCOVERY_GENERATION_KEY_INVALID_PART');
    }

    encodedParts.push(`${strVal.length}:${strVal}`);
  }

  return `gen:${encodedParts.join('/')}`;
}

/**
 * Combina deterministicamente sessionSeed, generationKey, surfaceKey e sectionKey.
 */
export function createDiscoveryEffectiveSeed(
  sessionSeed: DiscoverySessionSeed,
  generationKey: DiscoveryGenerationKey,
  surfaceKey: DiscoverySurfaceKey,
  sectionKey: DiscoverySectionKey,
): string {
  const normSeed = sessionSeed.trim();
  const normGen = generationKey.trim();
  const normSurface = surfaceKey.trim();
  const normSection = sectionKey.trim();

  if (!normSeed || !normGen || !normSurface || !normSection) {
    throw new Error('DISCOVERY_EFFECTIVE_SEED_KEYS_REQUIRED');
  }

  return `${normSeed.length}:${normSeed}/${normGen.length}:${normGen}/${normSurface.length}:${normSurface}/${normSection.length}:${normSection}`;
}

/**
 * Implementação local pura do algoritmo de Hash FNV-1a 32-bit.
 * Retorna um inteiro não assinado de 32 bits.
 */
export function fnv1a32Pure(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Normaliza e deduplica o pool de candidatos de forma imutável.
 * 1. Todos os IDs são canonicamente trimados.
 * 2. Se houver duplicatas do mesmo ID, prefere a representação com artwork-ready de forma determinística.
 */
export function createDiscoveryCandidatePool<T extends DiscoveryCandidateItem>(
  candidates: T[],
  isArtworkReady?: (candidate: T) => boolean,
): T[] {
  const poolMap = new Map<string, T>();
  const idOrder: string[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== 'string') {
      continue;
    }
    const cleanId = candidate.id.trim();
    if (!cleanId) {
      continue;
    }

    const canonicalCandidate: T =
      candidate.id !== cleanId
        ? { ...candidate, id: cleanId }
        : candidate;

    if (!poolMap.has(cleanId)) {
      poolMap.set(cleanId, canonicalCandidate);
      idOrder.push(cleanId);
    } else if (isArtworkReady) {
      const existing = poolMap.get(cleanId)!;
      const existingReady = isArtworkReady(existing);
      const newReady = isArtworkReady(canonicalCandidate);

      if (newReady && !existingReady) {
        poolMap.set(cleanId, canonicalCandidate);
      }
    }
  }

  return idOrder.map((id) => poolMap.get(id)!);
}

/**
 * Seleciona deterministicamente slotCount candidatos usando o algoritmo Discovery:
 * 1. Sanitização e normalização canônica do pool.
 * 2. Cálculo do score de Hash FNV-1a usando effectiveSeed + canonicalId.
 * 3. Classificação com preferência por artwork-ready.
 * 4. Desempate determinístico lexicográfico por canonicalId.
 */
export function selectDiscoveryItems<T extends DiscoveryCandidateItem>(
  input: SelectDiscoveryItemsInput<T>,
): T[] {
  const pool = createDiscoveryCandidatePool(input.candidates, input.isArtworkReady);
  if (pool.length === 0 || input.slotCount <= 0) {
    return [];
  }

  const effectiveSeed = createDiscoveryEffectiveSeed(
    input.sessionSeed,
    input.generationKey,
    input.surfaceKey,
    input.sectionKey,
  );

  type ScoredCandidate = {
    candidate: T;
    isArtworkReady: boolean;
    score: number;
    id: string;
    recentlyExposed: boolean;
  };

  const excludedIds = new Set(
    (input.excludedIds ?? []).map((id) => id.trim()).filter(Boolean),
  );

  const scoredCandidates: ScoredCandidate[] = pool.map((candidate) => {
    const isReady = input.isArtworkReady ? Boolean(input.isArtworkReady(candidate)) : false;
    const itemHash = fnv1a32Pure(`${effectiveSeed}::${candidate.id}`);
    return {
      candidate,
      isArtworkReady: isReady,
      score: itemHash,
      id: candidate.id,
      recentlyExposed: excludedIds.has(candidate.id),
    };
  });

  scoredCandidates.sort((left, right) => {
    if (left.recentlyExposed !== right.recentlyExposed) {
      return left.recentlyExposed ? 1 : -1;
    }
    // 1. Preferência por artwork-ready
    if (left.isArtworkReady !== right.isArtworkReady) {
      return left.isArtworkReady ? -1 : 1;
    }
    // 2. Score de Hash FNV-1a (maior score primeiro)
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    // 3. Desempate determinístico por ID canônico
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  return scoredCandidates
    .slice(0, Math.max(0, input.slotCount))
    .map((sc) => sc.candidate);
}

/**
 * Cria uma Presentation Snapshot congelando a composição e os slots (estrutura Readonly).
 */
export function createDiscoveryPresentationSnapshot<T extends DiscoveryCandidateItem>(
  input: SelectDiscoveryItemsInput<T>,
): DiscoveryPresentationSnapshot<T> {
  const selectedItems = selectDiscoveryItems(input);
  const slots: readonly DiscoverySnapshotSlot<T>[] = selectedItems.map((item) => ({
    id: item.id,
    payload: item,
  }));

  return {
    sessionSeed: input.sessionSeed,
    generationKey: input.generationKey,
    surfaceKey: input.surfaceKey,
    sectionKey: input.sectionKey,
    slots,
    itemCount: slots.length,
  };
}

/**
 * Atualiza o payload de uma Presentation Snapshot existente SEM alterar a ordem nem
 * a identidade dos slots (utiliza ID canônico).
 */
export function refreshDiscoveryPresentationSnapshotItems<T extends DiscoveryCandidateItem>(
  snapshot: DiscoveryPresentationSnapshot<T>,
  latestCandidates: T[],
  isArtworkReady?: (candidate: T) => boolean,
): DiscoveryPresentationSnapshot<T> {
  const latestPool = createDiscoveryCandidatePool(latestCandidates, isArtworkReady);
  const latestById = new Map<string, T>(
    latestPool.map((candidate) => [candidate.id, candidate]),
  );

  let didChange = false;
  const updatedSlots: readonly DiscoverySnapshotSlot<T>[] = snapshot.slots.map((slot) => {
    const updatedPayload = latestById.get(slot.id);
    if (updatedPayload && updatedPayload !== slot.payload) {
      didChange = true;
      return {
        id: slot.id,
        payload: updatedPayload,
      };
    }
    return slot;
  });

  if (!didChange) {
    return snapshot;
  }

  return {
    ...snapshot,
    slots: updatedSlots,
  };
}
