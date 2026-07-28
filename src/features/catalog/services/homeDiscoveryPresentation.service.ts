/**
 * XANDEFLIX 2.0 — HOME DISCOVERY PRESENTATION SERVICE (DISCOVERY-3A.2)
 *
 * Integração Android-First de Discovery nas fileiras de cards da Home.
 *
 * REGRAS ARQUITETURAIS:
 * 1. Preservação estrita da shell da seção (id, title, eyebrow, description). Substitui SOMENTE section.items.
 * 2. Processo em Duas Fases:
 *    - FASE A (Async Read): Bounded candidate reads (concorrência <= 4). Sem mutação de UI ou store.
 *    - FASE B (Sync Commit): Valida interaction lock, resolve lifecycle 2B e salva snapshots atômicas.
 * 3. Overlay síncrono instantâneo no re-entry / remount (sem re-carregar IndexedDB).
 * 4. Fallback legado 100% preservado em caso de erro, defer, unavailable ou interaction lock.
 * 5. Seções não classificadas (unknown/outras) permanecem totalmente intactas.
 */

import { getCatalogCategoryDefinition } from './catalogCategoryGroups.service';
import type { HomeVodItem, HomeVodSection } from './homeVod.service';
import {
  getOrCreateDiscoveryRuntimeContext,
  getDiscoveryRuntimePresentationSnapshot,
  hasDiscoveryRuntimeSurfaceInteracted,
  setDiscoveryRuntimePresentationSnapshot,
  removeDiscoveryRuntimePresentationSnapshot,
  type DiscoveryRuntimeAccessScope,
} from './discoveryRuntimePresentationStore.service';
import { resolveDiscoveryPresentationLifecycle } from './discoveryPresentationLifecycle.service';
import {
  loadLocalCatalogDiscoveryGroupCandidates,
  type LoadLocalCatalogDiscoveryGroupCandidatesResult,
} from '../../localCatalog/readModels/localCatalogDiscoveryCandidateReadModel.service';
import {
  dedupeLocalCatalogGroupTitles,
  normalizeLocalCatalogGroupIdentity,
} from '../../localCatalog/services/localCatalogGroupIdentity.service';
import type { CatalogRepository } from '../../localCatalog/repositories/catalogRepository.types';

export const HOME_DISCOVERY_MAX_CONCURRENCY = 4;

/**
 * Classifica deterministicamente o groupTitle de uma seção da Home como 'movie' ou 'series'.
 * Se pertencer ao catálogo de Filmes retorna 'movie', Séries retorna 'series'.
 * Caso contrário retorna null (seção não classificada / unknown).
 */
export function resolveHomeSectionContentKind(
  groupTitle: string,
): 'movie' | 'series' | null {
  const normTitle = normalizeLocalCatalogGroupIdentity(groupTitle);
  const usableIdentity = normTitle.replace(/[^a-z0-9]/gi, '').trim();

  if (!normTitle || usableIdentity.length === 0) {
    return null;
  }

  const rawMovieTitles = getCatalogCategoryDefinition('filmes')?.groupTitles ?? [];
  const rawSeriesTitles = getCatalogCategoryDefinition('series')?.groupTitles ?? [];

  const dedupedMovieTitles = dedupeLocalCatalogGroupTitles(rawMovieTitles);
  const dedupedSeriesTitles = dedupeLocalCatalogGroupTitles(rawSeriesTitles);

  const movieIdentities = new Set(
    dedupedMovieTitles.map((t) => normalizeLocalCatalogGroupIdentity(t)),
  );
  const seriesIdentities = new Set(
    dedupedSeriesTitles.map((t) => normalizeLocalCatalogGroupIdentity(t)),
  );

  if (movieIdentities.has(normTitle)) {
    return 'movie';
  }

  if (seriesIdentities.has(normTitle)) {
    return 'series';
  }

  return null;
}

/**
 * Constrói a chave Discovery de seção canônica e estável a partir de contentKind e groupTitle.
 * Não utiliza a propriedade instável section.id (que pode ser gerada dentro de Promise.all).
 */
export function buildHomeDiscoverySectionKey(
  contentKind: 'movie' | 'series',
  groupTitle: string,
): string {
  const normTitle = normalizeLocalCatalogGroupIdentity(groupTitle);
  return `${contentKind.length}:${contentKind}/${normTitle.length}:${normTitle}`;
}

/**
 * Avalia se um item possui artwork-ready suficiente para visualização em Card.
 * Para cards: posterUrl válido ou artworkCandidates com URL válida.
 */
export function isCardArtworkReady(item: HomeVodItem): boolean {
  if (item.posterUrl && item.posterUrl.trim().length > 0) {
    return true;
  }

  if (Array.isArray(item.artworkCandidates)) {
    return item.artworkCandidates.some(
      (art) => Boolean(art.url && art.url.trim().length > 0),
    );
  }

  return false;
}

export type OverlayStoredHomeDiscoverySnapshotsInput = {
  scope: DiscoveryRuntimeAccessScope;
  sections: HomeVodSection[];
};

/**
 * Aplica de forma 100% síncrona e em memória as Presentation Snapshots já salvas
 * no Runtime Store sobre as seções fornecidas (Remount / Re-entry / Cold Load com cache).
 */
export function overlayStoredHomeDiscoverySnapshots(
  input: OverlayStoredHomeDiscoverySnapshotsInput,
): HomeVodSection[] {
  const { scope, sections } = input;

  if (!scope || !Array.isArray(sections) || sections.length === 0) {
    return sections;
  }

  return sections.map((section) => {
    const contentKind = resolveHomeSectionContentKind(section.title);
    if (!contentKind) {
      return section;
    }

    const sectionKey = buildHomeDiscoverySectionKey(contentKind, section.title);
    const storedSnapshot = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
      scope,
      'home',
      sectionKey,
    );

    if (!storedSnapshot || !Array.isArray(storedSnapshot.slots) || storedSnapshot.slots.length === 0) {
      return section;
    }

    // Preserva rigorosamente a shell da seção e substitui apenas section.items
    return {
      ...section,
      items: storedSnapshot.slots.map((slot) => slot.payload),
    };
  });
}

export type ExecuteHomeDiscoveryPresentationInput = {
  scope: DiscoveryRuntimeAccessScope;
  sections: HomeVodSection[];
  candidateRepository?: CatalogRepository;
};

/**
 * Executa o fluxo Discovery completo em duas fases para a página Home.
 */
export async function executeHomeDiscoveryPresentation(
  input: ExecuteHomeDiscoveryPresentationInput,
): Promise<HomeVodSection[]> {
  const { scope, sections, candidateRepository } = input;

  if (!scope || !Array.isArray(sections) || sections.length === 0) {
    return sections;
  }

  // Identificar seções elegíveis para Discovery (Filmes e Séries classificadas)
  type EligibleSection = {
    sectionIndex: number;
    section: HomeVodSection;
    contentKind: 'movie' | 'series';
    sectionKey: string;
  };

  const eligibleSections: EligibleSection[] = [];
  for (let i = 0; i < sections.length; i += 1) {
    const sec = sections[i]!;
    const contentKind = resolveHomeSectionContentKind(sec.title);
    if (contentKind) {
      const sectionKey = buildHomeDiscoverySectionKey(contentKind, sec.title);
      eligibleSections.push({
        sectionIndex: i,
        section: sec,
        contentKind,
        sectionKey,
      });
    }
  }

  if (eligibleSections.length === 0) {
    return sections;
  }

  // FASE A — ASYNC CANDIDATE READS COM CONCORRÊNCIA LIMITADA (<= 4 IN-FLIGHT)
  const candidateResultsMap = new Map<
    string,
    LoadLocalCatalogDiscoveryGroupCandidatesResult
  >();

  // Auxiliar para execução concorrente bounded
  async function runBoundedCandidateReads() {
    let currentIndex = 0;

    async function worker() {
      while (currentIndex < eligibleSections.length) {
        const itemIndex = currentIndex;
        currentIndex += 1;

        const target = eligibleSections[itemIndex]!;
        try {
          const res = await loadLocalCatalogDiscoveryGroupCandidates(
            {
              sourceId: scope.sourceId,
              groupTitle: target.section.title,
              contentKind: target.contentKind,
              skipTmdbMetadata: false, // Habilitado para obter metadata TMDB local
            },
            candidateRepository,
          );
          candidateResultsMap.set(target.sectionKey, res);
        } catch {
          // Erro transitório/isolado na leitura de uma seção não derruba as demais e preserva snapshot existente
          candidateResultsMap.set(target.sectionKey, {
            status: 'defer',
            items: [],
          });
        }
      }
    }

    const workerCount = Math.min(HOME_DISCOVERY_MAX_CONCURRENCY, eligibleSections.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
  }

  await runBoundedCandidateReads();

  // FASE B — SYNCHRONOUS COMMIT (Sem nenhum await durante o commit)
  const isHomeInteracted = hasDiscoveryRuntimeSurfaceInteracted(scope, 'home');
  const runtimeContext = getOrCreateDiscoveryRuntimeContext(scope);

  if (!runtimeContext.isValid || !runtimeContext.sessionSeed) {
    return sections;
  }

  const updatedSections = [...sections];

  for (const eligible of eligibleSections) {
    const { sectionIndex, section, sectionKey } = eligible;
    const candidateResult = candidateResultsMap.get(sectionKey);

    if (!candidateResult) {
      continue;
    }

    const activeSnapshot = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
      scope,
      'home',
      sectionKey,
    );

    // REGRA DO INTERACTION LOCK (Section 17):
    // Se o usuário interagiu com a Home ANTES que essa seção tivesse uma snapshot ativa,
    // proíbe a criação de primeira snapshot para evitar recomposição na cara do usuário.
    if (isHomeInteracted && !activeSnapshot) {
      continue;
    }

    const slotCount = Math.max(1, section.items.length || 12);

    const lifecycleResult = resolveDiscoveryPresentationLifecycle<HomeVodItem>({
      candidateResult,
      sessionSeed: runtimeContext.sessionSeed,
      surfaceKey: 'home',
      sectionKey,
      slotCount,
      activeSnapshot,
      isArtworkReady: isCardArtworkReady,
    });

    if (
      lifecycleResult.decision === 'created' ||
      lifecycleResult.decision === 'refreshed'
    ) {
      if (lifecycleResult.snapshot) {
        setDiscoveryRuntimePresentationSnapshot(scope, lifecycleResult.snapshot);
        updatedSections[sectionIndex] = {
          ...section,
          items: lifecycleResult.snapshot.slots.map((slot) => slot.payload),
        };
      }
    } else if (
      lifecycleResult.decision === 'preserved-defer' ||
      lifecycleResult.decision === 'preserved-new-generation'
    ) {
      if (lifecycleResult.snapshot) {
        updatedSections[sectionIndex] = {
          ...section,
          items: lifecycleResult.snapshot.slots.map((slot) => slot.payload),
        };
      }
    } else if (lifecycleResult.decision === 'unavailable') {
      removeDiscoveryRuntimePresentationSnapshot(scope, 'home', sectionKey);
    }
  }

  return updatedSections;
}
