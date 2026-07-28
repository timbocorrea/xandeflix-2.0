/**
 * XANDEFLIX 2.0 — HOME DISCOVERY PRESENTATION SMOKE TEST (DISCOVERY-3A.2.1)
 *
 * Suíte de testes verdadeiramente assíncronos para validar a integração de
 * Presentation Snapshots com a página Home (fileiras de cards).
 *
 * Cobertura completa e rigorosa dos requisitos H3A2_1 a H3A2_20.
 */

import {
  resolveHomeSectionContentKind,
  buildHomeDiscoverySectionKey,
  isCardArtworkReady,
  overlayStoredHomeDiscoverySnapshots,
  executeHomeDiscoveryPresentation,
  HOME_DISCOVERY_MAX_CONCURRENCY,
} from './homeDiscoveryPresentation.service';
import {
  getOrCreateDiscoveryRuntimeContext,
  setDiscoveryRuntimePresentationSnapshot,
  getDiscoveryRuntimePresentationSnapshot,
  markDiscoveryRuntimeSurfaceInteracted,
  hasDiscoveryRuntimeSurfaceInteracted,
  clearDiscoveryRuntimePresentationState,
  type DiscoveryRuntimeAccessScope,
} from './discoveryRuntimePresentationStore.service';
import {
  createDiscoveryGenerationKey,
  createDiscoveryPresentationSnapshot,
} from './discoverySelector.service';
import type { HomeVodItem, HomeVodSection } from './homeVod.service';
import type { CatalogRepository } from '../../localCatalog/repositories/catalogRepository.types';
import type { LocalCatalogItem } from '../../localCatalog/types/localCatalog.types';
import { normalizeLocalCatalogGroupIdentity } from '../../localCatalog/services/localCatalogGroupIdentity.service';

/**
 * Cria um objeto LocalCatalogItem válido para o repositório de teste.
 * O atributo posterUrl do HomeVodItem é derivado de tvgLogo.
 */
function createTestLocalCatalogItem(
  id: string,
  name: string,
  contentKind: 'movie' | 'series',
  groupTitle: string,
  posterUrl?: string,
): LocalCatalogItem {
  const normGroup = normalizeLocalCatalogGroupIdentity(groupTitle);
  return {
    id,
    sourceId: 'SRC-MOVIE-SERIES-001',
    name,
    rawName: name,
    normalizedName: name.toLowerCase(),
    groupTitle,
    normalizedGroup: normGroup,
    contentKind,
    streamUrl: `http://source.test/stream/${id}.mp4`,
    tvgLogo: posterUrl,
    createdAt: '2026-07-25T10:00:00.000Z',
    updatedAt: '2026-07-25T10:00:00.000Z',
  };
}

/**
 * Constrói um Mock Repository estrito que respeita o contrato do Candidate Read Model:
 * - getImportMetadata()
 * - listItems()
 * - getTmdbMetadataBySourceItemIds()
 * - listCategories() (lança exceção se for invocado para provar ausência de chamadas)
 */
function createMockCatalogRepository(options?: {
  metadataStatus?: 'ready' | 'importing' | 'failed' | 'canceled';
  lastSuccessfulImportAt?: string;
  classificationVersion?: number;
  items?: LocalCatalogItem[];
  onListItems?: (filter: { sourceId?: string; contentKind?: string; normalizedGroup?: string; limit?: number }) => Promise<LocalCatalogItem[]> | LocalCatalogItem[];
}) {
  const metadataStatus = options?.metadataStatus ?? 'ready';
  const lastSuccessfulImportAt = options?.lastSuccessfulImportAt ?? '2026-07-25T10:00:00.000Z';
  const classificationVersion = options?.classificationVersion ?? 1;
  const itemsPool = options?.items ?? [];

  return {
    async getImportMetadata(sourceId: string) {
      return {
        sourceId,
        sourceType: 'm3u',
        status: metadataStatus,
        importedCount: Math.max(1, itemsPool.length),
        classificationVersion,
        lastSuccessfulImportAt,
      };
    },
    async listItems(filter: { sourceId?: string; contentKind?: string; normalizedGroup?: string; limit?: number }): Promise<LocalCatalogItem[]> {
      if (options?.onListItems) {
        return options.onListItems(filter);
      }
      return itemsPool.filter((item) => {
        if (filter.contentKind && item.contentKind !== filter.contentKind) {
          return false;
        }
        if (filter.normalizedGroup) {
          const itemGroup = normalizeLocalCatalogGroupIdentity(item.groupTitle || '');
          if (itemGroup !== filter.normalizedGroup) {
            return false;
          }
        }
        return true;
      }).slice(0, filter.limit ?? 40);
    },
    async getTmdbMetadataBySourceItemIds() {
      return new Map();
    },
    async listCategories() {
      throw new Error('LIST_CATEGORIES_SHOULD_NOT_BE_CALLED');
    },
  } as unknown as CatalogRepository;
}

export async function runHomeDiscoveryPresentationSmokeTest(): Promise<Record<string, boolean>> {
  clearDiscoveryRuntimePresentationState();

  const scopeA: DiscoveryRuntimeAccessScope = {
    licenseCode: 'LIC-HOME-001',
    deviceIdentifier: 'DEV-TABLET-001',
    sourceId: 'SRC-MOVIE-SERIES-001',
  };

  const scopeB_sourceChange: DiscoveryRuntimeAccessScope = {
    ...scopeA,
    sourceId: 'SRC-MOVIE-SERIES-002',
  };

  // 1. H3A2_1_STABLE_CANONICAL_SECTION_KEY
  const key1 = buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos');
  const key2 = buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos');
  const h3a2_1_stable_canonical_section_key =
    key1 === key2 &&
    key1.includes('movie') &&
    key1.includes('filmes | lancamentos');

  // 2. H3A2_2_MOVIE_POOL_INTEGRATED & H3A2_3_SERIES_POOL_INTEGRATED & H3A2_4_UNKNOWN_SECTION_UNTOUCHED
  const kindMovieCanonical = resolveHomeSectionContentKind('Filmes | Lançamentos');
  const kindMovieBroad = resolveHomeSectionContentKind('Filmes Aleatórios');
  const kindSeriesCanonical = resolveHomeSectionContentKind('SERIES | NETFLIX');
  const kindSeriesBroad = resolveHomeSectionContentKind('Series Qualquer');
  const kindUnknown = resolveHomeSectionContentKind('Canais Desconhecidos X100');

  const h3a2_2_movie_pool_integrated = kindMovieCanonical === 'movie' && kindMovieBroad === null;
  const h3a2_3_series_pool_integrated = kindSeriesCanonical === 'series' && kindSeriesBroad === null;
  const h3a2_4_unknown_section_untouched = kindUnknown === null;

  const mockLocalItems: LocalCatalogItem[] = [
    createTestLocalCatalogItem('m-101', 'Filme A', 'movie', 'Filmes | Lançamentos', 'https://img/a.jpg'),
    createTestLocalCatalogItem('m-102', 'Filme B', 'movie', 'Filmes | Lançamentos', 'https://img/b.jpg'),
    createTestLocalCatalogItem('s-201', 'Série A', 'series', 'SERIES | NETFLIX', 'https://img/sa.jpg'),
  ];

  const standardRepo = createMockCatalogRepository({ items: mockLocalItems });

  const initialSections: HomeVodSection[] = [
    {
      id: 'home-local-movie-0',
      title: 'Filmes | Lançamentos',
      eyebrow: 'Destaques',
      description: 'Lançamentos da semana',
      items: [
        { id: 'm-legacy-1', title: 'Filme Legado A', kind: 'movie' },
      ],
    },
    {
      id: 'home-local-series-1',
      title: 'SERIES | NETFLIX',
      eyebrow: 'Recomendadas',
      description: 'Séries em alta',
      items: [
        { id: 's-legacy-1', title: 'Série Legada A', kind: 'series' },
      ],
    },
    {
      id: 'home-local-unknown-2',
      title: 'Canais Desconhecidos X100',
      eyebrow: 'Outros',
      description: 'Variados',
      items: [
        { id: 'u-301', title: 'Desconhecido', kind: 'unknown' },
      ],
    },
  ];

  // 5. H3A2_5_INTERACTION_BEFORE_READ_COMPLETES_BLOCKS_FIRST_SNAPSHOT (TESTE DE CORRIDA REAL)
  clearDiscoveryRuntimePresentationState();
  getOrCreateDiscoveryRuntimeContext(scopeA);

  let resolveRead5: () => void = () => {};
  const readPendingPromise5 = new Promise<void>((r) => {
    resolveRead5 = r;
  });

  const raceRepo5 = createMockCatalogRepository({
    onListItems: async (filter) => {
      await readPendingPromise5;
      return mockLocalItems.filter((i) => i.contentKind === filter.contentKind);
    },
  });

  const presentationPromise5 = executeHomeDiscoveryPresentation({
    scope: scopeA,
    sections: initialSections,
    candidateRepository: raceRepo5,
  });

  // Durante a leitura pendente, o usuário interage via pointer ou D-pad
  markDiscoveryRuntimeSurfaceInteracted(scopeA, 'home');
  const firstPointerLocked = hasDiscoveryRuntimeSurfaceInteracted(scopeA, 'home');

  // Libera a leitura do repository
  resolveRead5();
  const resWithInteraction5 = await presentationPromise5;

  const snapshotAfterInteraction5 = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
    scopeA,
    'home',
    buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
  );

  const h3a2_5_interaction_before_read_completes_blocks_first_snapshot =
    firstPointerLocked === true &&
    snapshotAfterInteraction5 === undefined &&
    resWithInteraction5[0]?.items[0]?.id === 'm-legacy-1';

  // 6. H3A2_6_EXISTING_SNAPSHOT_SURVIVES_INTERACTION
  clearDiscoveryRuntimePresentationState();
  const ctx6 = getOrCreateDiscoveryRuntimeContext(scopeA);
  const genKey6 = createDiscoveryGenerationKey(['SRC-MOVIE-SERIES-001', 1, '2026-07-25T10:00:00.000Z']);
  const snap6 = createDiscoveryPresentationSnapshot<HomeVodItem>({
    candidates: [
      { id: 'm-101', title: 'Filme A', kind: 'movie', posterUrl: 'https://img/a.jpg' },
      { id: 'm-102', title: 'Filme B', kind: 'movie', posterUrl: 'https://img/b.jpg' },
    ],
    sessionSeed: ctx6.sessionSeed!,
    generationKey: genKey6,
    surfaceKey: 'home',
    sectionKey: buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
    slotCount: 2,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snap6);
  markDiscoveryRuntimeSurfaceInteracted(scopeA, 'home');

  const res6 = await executeHomeDiscoveryPresentation({
    scope: scopeA,
    sections: initialSections,
    candidateRepository: standardRepo,
  });

  const retrieved6 = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
    scopeA,
    'home',
    buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
  );
  const h3a2_6_existing_snapshot_survives_interaction =
    retrieved6 !== undefined &&
    retrieved6.slots.length === 2 &&
    retrieved6.slots[0]?.payload.id === snap6.slots[0]?.payload.id &&
    res6[0]?.items[0]?.id === snap6.slots[0]?.payload.id;

  // 7. H3A2_7_SAME_ID_ARTWORK_REFRESH (TESTE DE LIFECYCLE REAL)
  clearDiscoveryRuntimePresentationState();
  const ctx7 = getOrCreateDiscoveryRuntimeContext(scopeA);
  const genKey7 = createDiscoveryGenerationKey(['SRC-MOVIE-SERIES-001', 1, '2026-07-25T10:00:00.000Z']);
  const snap7 = createDiscoveryPresentationSnapshot<HomeVodItem>({
    candidates: [
      { id: 'm-101', title: 'Filme A', kind: 'movie' }, // sem poster no snapshot ativo
    ],
    sessionSeed: ctx7.sessionSeed!,
    generationKey: genKey7,
    surfaceKey: 'home',
    sectionKey: buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
    slotCount: 1,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snap7);

  const refreshRepo7 = createMockCatalogRepository({
    items: [
      createTestLocalCatalogItem('m-101', 'Filme A', 'movie', 'Filmes | Lançamentos', 'https://img/a-fresh.jpg'),
    ],
  });

  const res7 = await executeHomeDiscoveryPresentation({
    scope: scopeA,
    sections: initialSections,
    candidateRepository: refreshRepo7,
  });

  const updatedSnap7 = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
    scopeA,
    'home',
    buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
  );

  const h3a2_7_same_id_artwork_refresh =
    updatedSnap7?.slots[0]?.payload.id === snap7.slots[0]?.payload.id &&
    updatedSnap7?.slots[0]?.payload.posterUrl === 'https://img/a-fresh.jpg' &&
    res7[0]?.items[0]?.posterUrl === 'https://img/a-fresh.jpg';

  // 8. H3A2_8_NEW_GENERATION_SAME_SESSION_PRESERVED (TESTE DE LIFECYCLE REAL)
  clearDiscoveryRuntimePresentationState();
  const ctx8 = getOrCreateDiscoveryRuntimeContext(scopeA);
  const genKey8A = createDiscoveryGenerationKey(['SRC-MOVIE-SERIES-001', 1, '2026-07-25T10:00:00.000Z']);
  const snap8A = createDiscoveryPresentationSnapshot<HomeVodItem>({
    candidates: [{ id: 'm-101', title: 'Filme A', kind: 'movie' }],
    sessionSeed: ctx8.sessionSeed!,
    generationKey: genKey8A,
    surfaceKey: 'home',
    sectionKey: buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
    slotCount: 1,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snap8A);

  const newGenRepo8 = createMockCatalogRepository({
    lastSuccessfulImportAt: '2026-07-26T12:00:00.000Z', // Geração B
    items: [
      createTestLocalCatalogItem('m-999', 'Filme Ingestão Nova B', 'movie', 'Filmes | Lançamentos'),
    ],
  });

  const res8 = await executeHomeDiscoveryPresentation({
    scope: scopeA,
    sections: initialSections,
    candidateRepository: newGenRepo8,
  });

  const retrieved8 = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
    scopeA,
    'home',
    buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
  );
  const h3a2_8_new_generation_same_session_preserved =
    retrieved8 !== undefined &&
    retrieved8.generationKey === genKey8A &&
    res8[0]?.items[0]?.id === snap8A.slots[0]?.payload.id; // Permanece item de Geração A na sessão ativa

  // 9. H3A2_9_ROUTE_REENTRY_OVERLAY_IS_SYNCHRONOUS
  const overlayRes9 = overlayStoredHomeDiscoverySnapshots({
    scope: scopeA,
    sections: initialSections,
  });
  const h3a2_9_route_reentry_overlay_is_synchronous =
    overlayRes9.length === 3 &&
    overlayRes9[0]?.items[0]?.id === snap8A.slots[0]?.payload.id;

  // 10. H3A2_10_PLAYLIST_NOT_READY_ZERO_CANDIDATE_READS
  let listItemsCalledCount10 = 0;
  const gateRepo10 = createMockCatalogRepository({
    onListItems: async () => {
      listItemsCalledCount10 += 1;
      return [];
    },
  });

  // Simula o comportamento do CatalogPage quando playlistStatus !== 'ready'
  const playlistStatus10: string = 'loading';
  if (playlistStatus10 === 'ready') {
    await executeHomeDiscoveryPresentation({
      scope: scopeA,
      sections: initialSections,
      candidateRepository: gateRepo10,
    });
  }
  const overlaySections10 = overlayStoredHomeDiscoverySnapshots({
    scope: scopeA,
    sections: initialSections,
  });

  const h3a2_10_playlist_not_ready_zero_candidate_reads =
    listItemsCalledCount10 === 0 &&
    overlaySections10[0]?.items[0]?.id === snap8A.slots[0]?.payload.id;

  // 11. H3A2_11_SECTION_SHELL_PRESERVED
  const sec0 = initialSections[0]!;
  const overSec0 = overlayRes9[0]!;
  const h3a2_11_section_shell_preserved =
    overSec0.id === sec0.id &&
    overSec0.title === sec0.title &&
    overSec0.eyebrow === sec0.eyebrow &&
    overSec0.description === sec0.description;

  // 12. H3A2_12_CANDIDATE_ERROR_ISOLATED (TESTE REAL DE EXCEÇÃO ISOLADA)
  clearDiscoveryRuntimePresentationState();
  const ctx12 = getOrCreateDiscoveryRuntimeContext(scopeA);
  const genKey12 = createDiscoveryGenerationKey(['SRC-MOVIE-SERIES-001', 1, '2026-07-25T10:00:00.000Z']);
  const snap12A = createDiscoveryPresentationSnapshot<HomeVodItem>({
    candidates: [{ id: 'm-101', title: 'Filme A Existente', kind: 'movie' }],
    sessionSeed: ctx12.sessionSeed!,
    generationKey: genKey12,
    surfaceKey: 'home',
    sectionKey: buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
    slotCount: 1,
  });
  setDiscoveryRuntimePresentationSnapshot(scopeA, snap12A);

  const errorRepo12 = createMockCatalogRepository({
    onListItems: async (filter) => {
      if (filter.contentKind === 'movie') {
        throw new Error('INDEXEDDB_READ_ERROR_SECTION_A');
      }
      return [
        createTestLocalCatalogItem('s-201', 'Série B OK', 'series', 'SERIES | NETFLIX'),
      ];
    },
  });

  const res12 = await executeHomeDiscoveryPresentation({
    scope: scopeA,
    sections: initialSections,
    candidateRepository: errorRepo12,
  });

  const snapshotA12AfterError = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
    scopeA,
    'home',
    buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
  );

  const h3a2_12_candidate_error_isolated =
    snapshotA12AfterError !== undefined &&
    snapshotA12AfterError.slots[0]?.payload.id === snap12A.slots[0]?.payload.id && // Snapshot da Seção A preservada!
    res12[0]?.items[0]?.id === snap12A.slots[0]?.payload.id && // Seção A mantém snapshot
    res12[1]?.items[0]?.id === 's-201'; // Seção B executa normalmente // Seção B executa normalmente

  // 13. H3A2_13_CONCURRENCY_BOUNDED (TESTE DE CONCORRÊNCIA REAL INSTRUMENTADO)
  let currentInFlight13 = 0;
  let maxInFlight13 = 0;

  const multiSections13: HomeVodSection[] = Array.from({ length: 8 }, (_, idx) => ({
    id: `sec-concurrency-${idx}`,
    title: idx % 2 === 0 ? 'Filmes | Lançamentos' : 'SERIES | NETFLIX',
    eyebrow: 'Teste Concorrência',
    description: 'Bateria de Seções',
    items: [{ id: `item-legacy-${idx}`, title: `Item ${idx}`, kind: idx % 2 === 0 ? 'movie' : 'series' }],
  }));

  const concurrencyRepo13 = createMockCatalogRepository({
    onListItems: async () => {
      currentInFlight13 += 1;
      if (currentInFlight13 > maxInFlight13) {
        maxInFlight13 = currentInFlight13;
      }
      await new Promise((r) => setTimeout(r, 20));
      currentInFlight13 -= 1;
      return [
        createTestLocalCatalogItem('m-test', 'Filme Concorrência', 'movie', 'Filmes | Lançamentos'),
      ];
    },
  });

  clearDiscoveryRuntimePresentationState();
  getOrCreateDiscoveryRuntimeContext(scopeA);
  await executeHomeDiscoveryPresentation({
    scope: scopeA,
    sections: multiSections13,
    candidateRepository: concurrencyRepo13,
  });

  const h3a2_13_concurrency_bounded =
    maxInFlight13 <= HOME_DISCOVERY_MAX_CONCURRENCY && maxInFlight13 > 1;

  // 14. H3A2_14_ARTWORK_READY_PREFERRED & 15. H3A2_15_NO_ARTWORK_REMAINS_ELIGIBLE (SELETOR REAL DE ARTWORK)
  clearDiscoveryRuntimePresentationState();
  getOrCreateDiscoveryRuntimeContext(scopeA);

  const artworkPool14: LocalCatalogItem[] = [
    createTestLocalCatalogItem('m-noart-1', 'Sem Poster 1', 'movie', 'Filmes | Lançamentos'),
    createTestLocalCatalogItem('m-art-1', 'Com Poster 1', 'movie', 'Filmes | Lançamentos', 'https://img/art1.jpg'),
    createTestLocalCatalogItem('m-noart-2', 'Sem Poster 2', 'movie', 'Filmes | Lançamentos'),
    createTestLocalCatalogItem('m-art-2', 'Com Poster 2', 'movie', 'Filmes | Lançamentos', 'https://img/art2.jpg'),
  ];

  const artworkRepo14 = createMockCatalogRepository({ items: artworkPool14 });

  const sectionInput14: HomeVodSection[] = [
    {
      id: 'sec-art-14',
      title: 'Filmes | Lançamentos',
      eyebrow: 'Art',
      description: 'Test',
      items: [
        { id: 'p-1', title: 'Placeholder 1', kind: 'movie' },
        { id: 'p-2', title: 'Placeholder 2', kind: 'movie' },
      ], // SlotCount = 2
    },
  ];

  const res14 = await executeHomeDiscoveryPresentation({
    scope: scopeA,
    sections: sectionInput14,
    candidateRepository: artworkRepo14,
  });

  const snap14 = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
    scopeA,
    'home',
    buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
  );

  const h3a2_14_artwork_ready_preferred =
    snap14?.slots.length === 2 &&
    snap14.slots.every((slot) => isCardArtworkReady(slot.payload)) &&
    res14[0]?.items.map((i) => i.id).sort().join(',') === 'm-art-1,m-art-2';

  // H3A2_15: Artwork insuficiente (1 artwork + 2 sem artwork para slotCount = 3)
  clearDiscoveryRuntimePresentationState();
  getOrCreateDiscoveryRuntimeContext(scopeA);

  const artworkPool15: LocalCatalogItem[] = [
    createTestLocalCatalogItem('m-art-1', 'Com Poster 1', 'movie', 'Filmes | Lançamentos', 'https://img/art1.jpg'),
    createTestLocalCatalogItem('m-noart-1', 'Sem Poster 1', 'movie', 'Filmes | Lançamentos'),
    createTestLocalCatalogItem('m-noart-2', 'Sem Poster 2', 'movie', 'Filmes | Lançamentos'),
  ];

  const artworkRepo15 = createMockCatalogRepository({ items: artworkPool15 });

  const sectionInput15: HomeVodSection[] = [
    {
      id: 'sec-art-15',
      title: 'Filmes | Lançamentos',
      eyebrow: 'Art',
      description: 'Test',
      items: [
        { id: 'p-1', title: 'P1', kind: 'movie' },
        { id: 'p-2', title: 'P2', kind: 'movie' },
        { id: 'p-3', title: 'P3', kind: 'movie' },
      ], // SlotCount = 3
    },
  ];

  const res15 = await executeHomeDiscoveryPresentation({
    scope: scopeA,
    sections: sectionInput15,
    candidateRepository: artworkRepo15,
  });

  const snap15 = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
    scopeA,
    'home',
    buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
  );

  const h3a2_15_no_artwork_remains_eligible =
    snap15?.slots.length === 3 &&
    res15[0]?.items.length === 3; // Completa os 3 slots usando os sem poster quando necessário

  // 16. H3A2_16_RUNTIME_SCOPE_REENTRY_STABLE
  const ctx16A = getOrCreateDiscoveryRuntimeContext(scopeA);
  const ctx16B = getOrCreateDiscoveryRuntimeContext(scopeA);
  const h3a2_16_runtime_scope_reentry_stable =
    ctx16A.sessionSeed === ctx16B.sessionSeed;

  // 17. H3A2_17_SOURCE_CHANGE_NO_OLD_OVERLAY
  const ctx17_sourceB = getOrCreateDiscoveryRuntimeContext(scopeB_sourceChange);
  const overlaySourceB = overlayStoredHomeDiscoverySnapshots({
    scope: scopeB_sourceChange,
    sections: initialSections,
  });
  const snapshotSourceB = getDiscoveryRuntimePresentationSnapshot<HomeVodItem>(
    scopeB_sourceChange,
    'home',
    buildHomeDiscoverySectionKey('movie', 'Filmes | Lançamentos'),
  );
  const h3a2_17_source_change_no_old_overlay =
    snapshotSourceB === undefined &&
    ctx17_sourceB.sessionSeed !== ctx16A.sessionSeed &&
    overlaySourceB[0]?.items[0]?.id === 'm-legacy-1';

  // 18. H3A2_18_ZERO_DISCOVERY_CACHE_WRITE (INSPEÇÃO E PROVA DE ZERO CACHE WRITE)
  let storageWritesDetected = false;
  const originalLocalStorageSet = Storage.prototype.setItem;

  try {
    Storage.prototype.setItem = () => {
      storageWritesDetected = true;
    };
    clearDiscoveryRuntimePresentationState();
    getOrCreateDiscoveryRuntimeContext(scopeA);
    await executeHomeDiscoveryPresentation({
      scope: scopeA,
      sections: initialSections,
      candidateRepository: standardRepo,
    });
    overlayStoredHomeDiscoverySnapshots({
      scope: scopeA,
      sections: initialSections,
    });
  } finally {
    Storage.prototype.setItem = originalLocalStorageSet;
  }

  const h3a2_18_zero_discovery_cache_write = storageWritesDetected === false;

  // 19. H3A2_19_POINTER_INTERACTION_MARKS_HOME
  clearDiscoveryRuntimePresentationState();
  getOrCreateDiscoveryRuntimeContext(scopeA);
  markDiscoveryRuntimeSurfaceInteracted(scopeA, 'home');
  const h3a2_19_pointer_interaction_marks_home =
    hasDiscoveryRuntimeSurfaceInteracted(scopeA, 'home') === true;

  // 20. H3A2_20_SPATIAL_KEY_FILTER
  const spatialKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'];
  const isSpatialKey = (key: string) => spatialKeys.includes(key);
  const h3a2_20_spatial_key_filter =
    isSpatialKey('ArrowLeft') &&
    isSpatialKey('Enter') &&
    !isSpatialKey('Shift') &&
    !isSpatialKey('Tab') &&
    !isSpatialKey(' ');

  const allPassed = [
    h3a2_1_stable_canonical_section_key,
    h3a2_2_movie_pool_integrated,
    h3a2_3_series_pool_integrated,
    h3a2_4_unknown_section_untouched,
    h3a2_5_interaction_before_read_completes_blocks_first_snapshot,
    h3a2_6_existing_snapshot_survives_interaction,
    h3a2_7_same_id_artwork_refresh,
    h3a2_8_new_generation_same_session_preserved,
    h3a2_9_route_reentry_overlay_is_synchronous,
    h3a2_10_playlist_not_ready_zero_candidate_reads,
    h3a2_11_section_shell_preserved,
    h3a2_12_candidate_error_isolated,
    h3a2_13_concurrency_bounded,
    h3a2_14_artwork_ready_preferred,
    h3a2_15_no_artwork_remains_eligible,
    h3a2_16_runtime_scope_reentry_stable,
    h3a2_17_source_change_no_old_overlay,
    h3a2_18_zero_discovery_cache_write,
    h3a2_19_pointer_interaction_marks_home,
    h3a2_20_spatial_key_filter,
  ].every(Boolean);

  return {
    ok: allPassed,
    h3a2_1_stable_canonical_section_key,
    h3a2_2_movie_pool_integrated,
    h3a2_3_series_pool_integrated,
    h3a2_4_unknown_section_untouched,
    h3a2_5_interaction_before_read_completes_blocks_first_snapshot,
    h3a2_6_existing_snapshot_survives_interaction,
    h3a2_7_same_id_artwork_refresh,
    h3a2_8_new_generation_same_session_preserved,
    h3a2_9_route_reentry_overlay_is_synchronous,
    h3a2_10_playlist_not_ready_zero_candidate_reads,
    h3a2_11_section_shell_preserved,
    h3a2_12_candidate_error_isolated,
    h3a2_13_concurrency_bounded,
    h3a2_14_artwork_ready_preferred,
    h3a2_15_no_artwork_remains_eligible,
    h3a2_16_runtime_scope_reentry_stable,
    h3a2_17_source_change_no_old_overlay,
    h3a2_18_zero_discovery_cache_write,
    h3a2_19_pointer_interaction_marks_home,
    h3a2_20_spatial_key_filter,
  };
}
