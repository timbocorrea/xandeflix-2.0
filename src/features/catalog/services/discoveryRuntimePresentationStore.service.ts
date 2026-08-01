/**
 * XANDEFLIX 2.0 — DISCOVERY RUNTIME PRESENTATION STORE (DISCOVERY-3A.1.1)
 *
 * Armazenamento de sessão e Presentation Snapshots em memória efêmera de runtime com Hardening.
 *
 * HARDENINGS APLICADOS:
 * A. Snapshot deve ter sessionSeed idêntica a currentSessionSeed (rejeita stale snapshots).
 * B. Default entropy falha fechado (lança DISCOVERY_SECURE_ENTROPY_UNAVAILABLE se sem crypto).
 * C. Transição de Scope é transacional (geração de seed/entropy precede limpeza de estado).
 * D. Key de armazenamento em encoding determinístico length-prefixed com validação de vazios.
 */

import {
  createDiscoverySessionSeed,
  type DiscoveryCandidateItem,
  type DiscoveryPresentationSnapshot,
  type DiscoverySectionKey,
  type DiscoverySessionSeed,
  type DiscoverySurfaceKey,
} from './discoverySelector.service';

export type DiscoveryRuntimeAccessScope = {
  licenseCode: string;
  deviceIdentifier: string;
  sourceId: string;
};

export type DiscoveryRuntimeContext = {
  isValid: boolean;
  scopeKey: string | null;
  sessionSeed: DiscoverySessionSeed | null;
};

// Estado mutável efêmero privado de runtime
let currentScopeKey: string | null = null;
let currentSessionSeed: DiscoverySessionSeed | null = null;
const runtimeSnapshotsMap = new Map<
  string,
  DiscoveryPresentationSnapshot<DiscoveryCandidateItem>
>();
const interactedSurfacesSet = new Set<string>();

/**
 * Constrói a chave canônica da Scope de Acesso com encoding determinístico e seguro.
 * Não realiza log de dados sensíveis.
 */
export function buildDiscoveryScopeKey(
  scope?: DiscoveryRuntimeAccessScope | null,
): string | null {
  if (!scope) {
    return null;
  }

  const lic = scope.licenseCode?.trim().toUpperCase();
  const dev = scope.deviceIdentifier?.trim();
  const src = scope.sourceId?.trim();

  if (!lic || !dev || !src) {
    return null;
  }

  return `lic:${lic.length}:${lic}/dev:${dev.length}:${dev}/src:${src.length}:${src}`;
}

/**
 * Gera entropy segura para a Session Seed usando crypto.randomUUID ou crypto.getRandomValues.
 * Lança erro sanitizado se nenhum mecanismo seguro estiver disponível (fail-closed).
 */
function defaultEntropyGenerator(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const array = new Uint8Array(16);
    globalThis.crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('DISCOVERY_SECURE_ENTROPY_UNAVAILABLE');
}

/**
 * Obtém ou cria o contexto de runtime da Discovery para uma scope de acesso.
 * Transacional: valida e gera a nova sessionSeed ANTES de mutar o estado ativo.
 */
export function getOrCreateDiscoveryRuntimeContext(
  scope: DiscoveryRuntimeAccessScope,
  entropyGenerator: () => string = defaultEntropyGenerator,
): DiscoveryRuntimeContext {
  const scopeKey = buildDiscoveryScopeKey(scope);

  if (!scopeKey) {
    return {
      isValid: false,
      scopeKey: null,
      sessionSeed: null,
    };
  }

  // Mesma scope ativa -> Reaproveita sessionSeed e snapshots
  if (currentScopeKey === scopeKey && currentSessionSeed) {
    return {
      isValid: true,
      scopeKey: currentScopeKey,
      sessionSeed: currentSessionSeed,
    };
  }

  // HARDENING C: Gerar e validar a nova seed ANTES de alterar o estado atual
  const rawEntropy = entropyGenerator();
  if (typeof rawEntropy !== 'string' || rawEntropy.trim().length === 0) {
    throw new Error('DISCOVERY_SECURE_ENTROPY_UNAVAILABLE');
  }

  const newSessionSeed = createDiscoverySessionSeed(rawEntropy);
  if (!newSessionSeed) {
    throw new Error('DISCOVERY_SESSION_SEED_INVALID');
  }

  // SOMENTE DEPOIS de sucesso na geração: transição atômica
  runtimeSnapshotsMap.clear();
  interactedSurfacesSet.clear();
  currentScopeKey = scopeKey;
  currentSessionSeed = newSessionSeed;

  return {
    isValid: true,
    scopeKey: currentScopeKey,
    sessionSeed: currentSessionSeed,
  };
}

/**
 * HARDENING D: Constrói a chave composta em encoding determinístico length-prefixed.
 * Retorna null se surfaceKey ou sectionKey forem vazias.
 */
function buildSnapshotStorageKey(
  surfaceKey?: DiscoverySurfaceKey | null,
  sectionKey?: DiscoverySectionKey | null,
): string | null {
  const normSurface = surfaceKey?.trim();
  const normSection = sectionKey?.trim();

  if (!normSurface || !normSection) {
    return null;
  }

  return `${normSurface.length}:${normSurface}/${normSection.length}:${normSection}`;
}

/**
 * Obtém a Presentation Snapshot armazenada para uma surface e section na scope ativa.
 * HARDENING A: Rejeita e purga snapshots de sessão antiga.
 */
export function getDiscoveryRuntimePresentationSnapshot<
  T extends DiscoveryCandidateItem = DiscoveryCandidateItem,
>(
  scope: DiscoveryRuntimeAccessScope,
  surfaceKey: DiscoverySurfaceKey,
  sectionKey: DiscoverySectionKey,
): DiscoveryPresentationSnapshot<T> | undefined {
  const scopeKey = buildDiscoveryScopeKey(scope);
  if (!scopeKey || scopeKey !== currentScopeKey) {
    return undefined;
  }

  const key = buildSnapshotStorageKey(surfaceKey, sectionKey);
  if (!key) {
    return undefined;
  }

  const storedSnapshot = runtimeSnapshotsMap.get(key) as
    | DiscoveryPresentationSnapshot<T>
    | undefined;

  if (!storedSnapshot) {
    return undefined;
  }

  // HARDENING A: Rejeita e expurga snapshots que pertençam a uma sessionSeed antiga
  if (storedSnapshot.sessionSeed !== currentSessionSeed) {
    runtimeSnapshotsMap.delete(key);
    return undefined;
  }

  return storedSnapshot;
}

/**
 * Salva ou atualiza a Presentation Snapshot na scope ativa.
 * HARDENING A: Rejeita gravações com sessionSeed divergente da atual.
 */
export function setDiscoveryRuntimePresentationSnapshot<
  T extends DiscoveryCandidateItem = DiscoveryCandidateItem,
>(
  scope: DiscoveryRuntimeAccessScope,
  snapshot: DiscoveryPresentationSnapshot<T>,
): void {
  const scopeKey = buildDiscoveryScopeKey(scope);
  if (!scopeKey || scopeKey !== currentScopeKey || !snapshot) {
    return;
  }

  // HARDENING A: Snapshot deve pertencer à sessionSeed ativa atual
  if (!snapshot.sessionSeed || snapshot.sessionSeed !== currentSessionSeed) {
    return;
  }

  const key = buildSnapshotStorageKey(snapshot.surfaceKey, snapshot.sectionKey);
  if (!key) {
    return;
  }

  runtimeSnapshotsMap.set(key, snapshot);
}

/**
 * Remove uma Presentation Snapshot específica de uma surface e section.
 */
export function removeDiscoveryRuntimePresentationSnapshot(
  scope: DiscoveryRuntimeAccessScope,
  surfaceKey: DiscoverySurfaceKey,
  sectionKey: DiscoverySectionKey,
): void {
  const scopeKey = buildDiscoveryScopeKey(scope);
  if (!scopeKey || scopeKey !== currentScopeKey) {
    return;
  }

  const key = buildSnapshotStorageKey(surfaceKey, sectionKey);
  if (!key) {
    return;
  }

  runtimeSnapshotsMap.delete(key);
}

export function removeDiscoveryRuntimeSurfaceSnapshots(
  scope: DiscoveryRuntimeAccessScope,
  surfaceKey: DiscoverySurfaceKey,
): void {
  const scopeKey = buildDiscoveryScopeKey(scope);
  const normalizedSurfaceKey = surfaceKey.trim();

  if (!scopeKey || scopeKey !== currentScopeKey || !normalizedSurfaceKey) {
    return;
  }

  for (const [key, snapshot] of runtimeSnapshotsMap.entries()) {
    if (snapshot.surfaceKey === normalizedSurfaceKey) {
      runtimeSnapshotsMap.delete(key);
    }
  }

  interactedSurfacesSet.delete(normalizedSurfaceKey);
}

/**
 * Reseta e limpa todo o estado efêmero de runtime da Discovery em memória.
 * Chamado obrigatoriamente no access clear / logout / invalidate session.
 */
export function clearDiscoveryRuntimePresentationState(): void {
  currentScopeKey = null;
  currentSessionSeed = null;
  runtimeSnapshotsMap.clear();
  interactedSurfacesSet.clear();
}

/**
 * Marca uma surface da Discovery como tendo recebido interação humana direta no runtime.
 */
export function markDiscoveryRuntimeSurfaceInteracted(
  scope: DiscoveryRuntimeAccessScope,
  surfaceKey: DiscoverySurfaceKey,
): void {
  if (!scope || !surfaceKey || !surfaceKey.trim()) {
    return;
  }
  const scopeKey = buildDiscoveryScopeKey(scope);
  if (!scopeKey) {
    return;
  }
  if (currentScopeKey !== scopeKey) {
    getOrCreateDiscoveryRuntimeContext(scope);
  }
  interactedSurfacesSet.add(surfaceKey.trim());
}

/**
 * Consulta se uma surface da Discovery recebeu interação humana na scope de runtime atual.
 */
export function hasDiscoveryRuntimeSurfaceInteracted(
  scope: DiscoveryRuntimeAccessScope,
  surfaceKey: DiscoverySurfaceKey,
): boolean {
  const scopeKey = buildDiscoveryScopeKey(scope);
  if (!scopeKey || scopeKey !== currentScopeKey || !surfaceKey || !surfaceKey.trim()) {
    return false;
  }
  return interactedSurfacesSet.has(surfaceKey.trim());
}

/**
 * Atualiza em memória o payload de itens em Presentation Snapshots ativas da scope atual
 * preservando sessionSeed, ordenação de slots e estabilidade de sessão (Same-ID Payload Refresh).
 */
export function updateDiscoveryRuntimeSnapshotItemPayloads<
  T extends DiscoveryCandidateItem = DiscoveryCandidateItem,
>(
  scope: DiscoveryRuntimeAccessScope,
  enrichedItems: readonly T[],
): void {
  const scopeKey = buildDiscoveryScopeKey(scope);
  if (
    !scopeKey ||
    scopeKey !== currentScopeKey ||
    !Array.isArray(enrichedItems) ||
    enrichedItems.length === 0
  ) {
    return;
  }

  const enrichedById = new Map<string, T>(
    enrichedItems.map((item) => [item.id, item]),
  );

  for (const [key, snapshot] of runtimeSnapshotsMap.entries()) {
    if (snapshot.sessionSeed !== currentSessionSeed) {
      continue;
    }

    let hasChanges = false;
    const updatedSlots = snapshot.slots.map((slot) => {
      const enriched = enrichedById.get(slot.payload.id);
      if (!enriched) {
        return slot;
      }

      hasChanges = true;
      return {
        ...slot,
        payload: {
          ...slot.payload,
          ...enriched,
        },
      };
    });

    if (hasChanges) {
      runtimeSnapshotsMap.set(key, {
        ...snapshot,
        slots: updatedSlots,
      });
    }
  }
}
