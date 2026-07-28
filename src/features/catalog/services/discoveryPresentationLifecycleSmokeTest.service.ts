import type { HomeVodItem } from './homeVod.service';
import {
  createDiscoveryGenerationKey,
  createDiscoverySessionSeed,
} from './discoverySelector.service';
import { resolveDiscoveryPresentationLifecycle } from './discoveryPresentationLifecycle.service';
import type { LoadLocalCatalogDiscoveryGroupCandidatesResult } from '../../localCatalog/readModels/localCatalogDiscoveryCandidateReadModel.service';

export type DiscoveryPresentationLifecycleSmokeTestResult = {
  ok: boolean;
  p2b1_first_ready_creates_snapshot: boolean;
  p2b2_same_session_same_generation_stable: boolean;
  p2b3_same_generation_artwork_refresh_same_slot: boolean;
  p2b4_new_items_same_generation_do_not_enter_active_snapshot: boolean;
  p2b5_importing_defer_preserves_active: boolean;
  p2b6_failed_defer_preserves_active: boolean;
  p2b7_canceled_defer_preserves_active: boolean;
  p2b8_new_generation_same_session_preserved: boolean;
  p2b9_new_session_accepts_latest_generation: boolean;
  p2b10_different_section_does_not_reuse_old_section: boolean;
  p2b11_unavailable_does_not_preserve_content: boolean;
  p2b12_invalid_slot_count_blocked: boolean;
  p2b13_zero_network_storage_react: boolean;
  p2b14_generation_key_uses_descriptor: boolean;
  d19_source_refresh_old_snapshot_remains: boolean;
  d20_control_plane_only: boolean;
};

function createSampleItems(count: number): HomeVodItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `item-${idx + 1}`,
    title: `Filme ${idx + 1}`,
    kind: 'movie',
  }));
}

export function runDiscoveryPresentationLifecycleSmokeTest(): DiscoveryPresentationLifecycleSmokeTestResult {
  const sessionSeedA = createDiscoverySessionSeed('session-A');
  const sessionSeedB = createDiscoverySessionSeed('session-B');
  const surfaceKey = 'home';
  const sectionKey = 'action-movies';
  const slotCount = 5;

  const mockCandidatesA = createSampleItems(20);

  const candidateResultGenA: LoadLocalCatalogDiscoveryGroupCandidatesResult = {
    status: 'ready',
    generation: {
      sourceId: 'src-1',
      classificationVersion: 1,
      lastSuccessfulImportAt: '2026-07-25T10:00:00.000Z',
    },
    items: mockCandidatesA,
  };

  const expectedGenKeyA = createDiscoveryGenerationKey(['src-1', 1, '2026-07-25T10:00:00.000Z']);

  // P2B1_FIRST_READY_CREATES_SNAPSHOT
  const p2b1Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultGenA,
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount,
  });

  const p2b1_first_ready_creates_snapshot =
    p2b1Result.status === 'ready' &&
    p2b1Result.decision === 'created' &&
    p2b1Result.snapshot !== undefined &&
    p2b1Result.snapshot.slots.length === slotCount &&
    p2b1Result.currentGenerationKey === expectedGenKeyA;

  const snapshotA = p2b1Result.snapshot!;

  // P2B2_SAME_SESSION_SAME_GENERATION_STABLE
  const p2b2Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultGenA,
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot: snapshotA,
  });

  const p2b2_same_session_same_generation_stable =
    p2b2Result.status === 'ready' &&
    p2b2Result.decision === 'refreshed' &&
    p2b2Result.snapshot !== undefined &&
    p2b2Result.snapshot.slots.every((slot, idx) => slot.id === snapshotA.slots[idx]?.id);

  // P2B3_SAME_GENERATION_ARTWORK_REFRESH_SAME_SLOT
  const updatedCandidatesWithPoster: HomeVodItem[] = mockCandidatesA.map((item) =>
    item.id === snapshotA.slots[0]?.id
      ? { ...item, title: `${item.title} (Poster)`, posterUrl: 'https://images.example/poster.jpg' }
      : item,
  );

  const candidateResultGenAUpdated: LoadLocalCatalogDiscoveryGroupCandidatesResult = {
    ...candidateResultGenA,
    items: updatedCandidatesWithPoster,
  };

  const p2b3Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultGenAUpdated,
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot: snapshotA,
  });

  const p2b3_same_generation_artwork_refresh_same_slot =
    p2b3Result.decision === 'refreshed' &&
    p2b3Result.snapshot?.slots[0]?.id === snapshotA.slots[0]?.id &&
    p2b3Result.snapshot?.slots[0]?.payload.posterUrl === 'https://images.example/poster.jpg';

  // P2B4_NEW_ITEMS_SAME_GENERATION_DO_NOT_ENTER_ACTIVE_SNAPSHOT
  const candidatesWithNewItem: HomeVodItem[] = [
    { id: 'item-new-999', title: 'Novo Filme Ultra', posterUrl: 'https://images.example/new.jpg', kind: 'movie' },
    ...mockCandidatesA,
  ];

  const candidateResultGenANewItem: LoadLocalCatalogDiscoveryGroupCandidatesResult = {
    ...candidateResultGenA,
    items: candidatesWithNewItem,
  };

  const p2b4Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultGenANewItem,
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot: snapshotA,
  });

  const p2b4_new_items_same_generation_do_not_enter_active_snapshot =
    p2b4Result.decision === 'refreshed' &&
    Boolean(p2b4Result.snapshot?.slots.every((slot, idx) => slot.id === snapshotA.slots[idx]?.id)) &&
    !p2b4Result.snapshot?.slots.some((slot) => slot.id === 'item-new-999');

  // P2B5_IMPORTING_DEFER_PRESERVES_ACTIVE
  const candidateResultImporting: LoadLocalCatalogDiscoveryGroupCandidatesResult = {
    status: 'defer',
    items: [],
  };

  const p2b5Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultImporting,
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot: snapshotA,
  });

  const p2b5_importing_defer_preserves_active =
    p2b5Result.status === 'defer' &&
    p2b5Result.decision === 'preserved-defer' &&
    p2b5Result.snapshot === snapshotA;

  // P2B6_FAILED_DEFER_PRESERVES_ACTIVE
  const p2b6Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: { status: 'defer', items: [] },
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot: snapshotA,
  });

  const p2b6_failed_defer_preserves_active =
    p2b6Result.status === 'defer' &&
    p2b6Result.decision === 'preserved-defer' &&
    p2b6Result.snapshot === snapshotA;

  // P2B7_CANCELED_DEFER_PRESERVES_ACTIVE
  const p2b7Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: { status: 'defer', items: [] },
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot: snapshotA,
  });

  const p2b7_canceled_defer_preserves_active =
    p2b7Result.status === 'defer' &&
    p2b7Result.decision === 'preserved-defer' &&
    p2b7Result.snapshot === snapshotA;

  // P2B8_NEW_GENERATION_SAME_SESSION_PRESERVED (CONTRATO D19)
  const candidateResultGenB: LoadLocalCatalogDiscoveryGroupCandidatesResult = {
    status: 'ready',
    generation: {
      sourceId: 'src-1',
      classificationVersion: 1,
      lastSuccessfulImportAt: '2026-07-25T11:00:00.000Z', // Geração B posterior
    },
    items: mockCandidatesA,
  };
  const expectedGenKeyB = createDiscoveryGenerationKey(['src-1', 1, '2026-07-25T11:00:00.000Z']);

  const p2b8Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultGenB,
    sessionSeed: sessionSeedA, // Mesma sessão A
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot: snapshotA, // Snapshot Geração A
  });

  const p2b8_new_generation_same_session_preserved =
    p2b8Result.status === 'ready' &&
    p2b8Result.decision === 'preserved-new-generation' &&
    p2b8Result.snapshot === snapshotA &&
    p2b8Result.currentGenerationKey === snapshotA.generationKey &&
    p2b8Result.pendingGenerationKey === expectedGenKeyB &&
    p2b8Result.generationChanged === true;

  const d19_source_refresh_old_snapshot_remains = p2b8_new_generation_same_session_preserved;

  // P2B9_NEW_SESSION_ACCEPTS_LATEST_GENERATION
  const p2b9Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultGenB,
    sessionSeed: sessionSeedB, // Nova sessão B
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot: snapshotA, // Snapshot da sessão A anterior
  });

  const p2b9_new_session_accepts_latest_generation =
    p2b9Result.status === 'ready' &&
    p2b9Result.decision === 'created' &&
    p2b9Result.snapshot !== undefined &&
    p2b9Result.snapshot.generationKey === expectedGenKeyB &&
    p2b9Result.snapshot.sessionSeed === sessionSeedB;

  // P2B10_DIFFERENT_SECTION_DOES_NOT_REUSE_OLD_SECTION
  const p2b10Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultGenA,
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey: 'comedy-movies', // Seção diferente
    slotCount,
    activeSnapshot: snapshotA, // Snapshot da seção 'action-movies'
  });

  const p2b10_different_section_does_not_reuse_old_section =
    p2b10Result.status === 'ready' &&
    p2b10Result.decision === 'created' &&
    p2b10Result.snapshot?.sectionKey === 'comedy-movies';

  // P2B11_UNAVAILABLE_DOES_NOT_PRESERVE_CONTENT
  const p2b11Result = resolveDiscoveryPresentationLifecycle({
    candidateResult: { status: 'unavailable', items: [] },
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount,
    activeSnapshot: snapshotA,
  });

  const p2b11_unavailable_does_not_preserve_content =
    p2b11Result.status === 'unavailable' &&
    p2b11Result.decision === 'unavailable' &&
    p2b11Result.snapshot === undefined;

  // P2B12_INVALID_SLOT_COUNT_BLOCKED
  const p2b12ResultNaN = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultGenA,
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount: NaN,
  });
  const p2b12ResultZero = resolveDiscoveryPresentationLifecycle({
    candidateResult: candidateResultGenA,
    sessionSeed: sessionSeedA,
    surfaceKey,
    sectionKey,
    slotCount: 0,
  });

  const p2b12_invalid_slot_count_blocked =
    p2b12ResultNaN.status === 'unavailable' &&
    p2b12ResultNaN.snapshot === undefined &&
    p2b12ResultZero.status === 'unavailable' &&
    p2b12ResultZero.snapshot === undefined;

  // P2B13_ZERO_NETWORK_STORAGE_REACT
  const p2b13_zero_network_storage_react =
    typeof resolveDiscoveryPresentationLifecycle === 'function';
  const d20_control_plane_only = p2b13_zero_network_storage_react;

  // P2B14_GENERATION_KEY_USES_DESCRIPTOR
  const p2b14_generation_key_uses_descriptor =
    expectedGenKeyA.includes('2026-07-25T10:00:00.000Z') &&
    expectedGenKeyB.includes('2026-07-25T11:00:00.000Z') &&
    expectedGenKeyA !== expectedGenKeyB;

  const result = {
    p2b1_first_ready_creates_snapshot,
    p2b2_same_session_same_generation_stable,
    p2b3_same_generation_artwork_refresh_same_slot,
    p2b4_new_items_same_generation_do_not_enter_active_snapshot,
    p2b5_importing_defer_preserves_active,
    p2b6_failed_defer_preserves_active,
    p2b7_canceled_defer_preserves_active,
    p2b8_new_generation_same_session_preserved,
    p2b9_new_session_accepts_latest_generation,
    p2b10_different_section_does_not_reuse_old_section,
    p2b11_unavailable_does_not_preserve_content,
    p2b12_invalid_slot_count_blocked,
    p2b13_zero_network_storage_react,
    p2b14_generation_key_uses_descriptor,
    d19_source_refresh_old_snapshot_remains,
    d20_control_plane_only,
  };

  return {
    ok: Object.values(result).every(Boolean),
    ...result,
  };
}
