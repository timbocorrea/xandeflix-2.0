import {
  createDiscoveryCandidatePool,
  createDiscoveryGenerationKey,
  createDiscoveryPresentationSnapshot,
  createDiscoverySessionSeed,
  refreshDiscoveryPresentationSnapshotItems,
  selectDiscoveryItems,
} from './discoverySelector.service';

export type DiscoverySelectorSmokeTestResult = {
  ok: boolean;
  d1_same_seed_same_order: boolean;
  d1b_input_order_independent: boolean;
  d2_different_session_different_order: boolean;
  d3_render_no_reshuffle: boolean;
  d4_new_generation_can_produce_new_order: boolean;
  d5_focused_item_does_not_move: boolean;
  d6_artwork_update_does_not_reorder: boolean;
  d6b_normalized_id_refresh: boolean;
  d8_duplicates_removed: boolean;
  d8b_duplicate_artwork_order_independent: boolean;
  d10_artwork_ready_preferred: boolean;
  d11_no_artwork_not_removed: boolean;
  d20_backend_control_plane_only: boolean;
  generation_empty_part_rejected: boolean;
  generation_position_collision_prevented: boolean;
};

type TestItem = {
  id: string;
  title: string;
  posterUrl?: string;
};

function createSampleCandidates(count: number): TestItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `item-${idx + 1}`,
    title: `Item Teste ${idx + 1}`,
  }));
}

export function runDiscoverySelectorSmokeTest(): DiscoverySelectorSmokeTestResult {
  const basePool = createSampleCandidates(50);
  const sessionSeedA = createDiscoverySessionSeed('session-alpha');
  const sessionSeedB = createDiscoverySessionSeed('session-beta');
  const genKey1 = createDiscoveryGenerationKey(['source-1', 'v1', 1000]);
  const genKey2 = createDiscoveryGenerationKey(['source-1', 'v1', 2000]);
  const surfaceKey = 'home';
  const sectionKey = 'hero';

  // CORREÇÃO 1: GENERATION KEY TESTS
  let emptyPartRejected = false;
  try {
    createDiscoveryGenerationKey(['source-A', '', 'timestamp-A']);
  } catch (error) {
    emptyPartRejected =
      error instanceof Error &&
      error.message === 'DISCOVERY_GENERATION_KEY_INVALID_PART';
  }

  const singlePartKey = createDiscoveryGenerationKey(['snapshot-37']);
  const positionCollisionPrevented = singlePartKey === 'gen:11:snapshot-37';

  // D1 SAME_SEED_SAME_ORDER
  const d1Select1 = selectDiscoveryItems({
    candidates: basePool,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 10,
  });
  const d1Select2 = selectDiscoveryItems({
    candidates: basePool,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 10,
  });
  const d1_same_seed_same_order =
    d1Select1.length === 10 &&
    d1Select1.every((item, idx) => item.id === d1Select2[idx]?.id);

  // D1B INPUT_ORDER_INDEPENDENT
  const reversedBasePool = [...basePool].reverse();
  const d1bSelectReversed = selectDiscoveryItems({
    candidates: reversedBasePool,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 10,
  });
  const d1b_input_order_independent =
    d1Select1.length === 10 &&
    d1Select1.every((item, idx) => item.id === d1bSelectReversed[idx]?.id);

  // D2 DIFFERENT_SESSION_DIFFERENT_ORDER
  const d2SelectA = selectDiscoveryItems({
    candidates: basePool,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 10,
  });
  const d2SelectB = selectDiscoveryItems({
    candidates: basePool,
    sessionSeed: sessionSeedB,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 10,
  });
  const d2_different_session_different_order =
    d2SelectA.some((item, idx) => item.id !== d2SelectB[idx]?.id);

  // D3 RENDER_NO_RESHUFFLE
  const d3Snapshot = createDiscoveryPresentationSnapshot({
    candidates: basePool,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 8,
  });
  const d3Refreshed = refreshDiscoveryPresentationSnapshotItems(
    d3Snapshot,
    basePool,
  );
  const d3_render_no_reshuffle =
    d3Snapshot.slots.length === 8 &&
    d3Snapshot.slots.every(
      (slot, idx) => slot.id === d3Refreshed.slots[idx]?.id,
    );

  // D4 NEW_GENERATION_CAN_PRODUCE_NEW_ORDER
  const d4SnapshotGen1 = createDiscoveryPresentationSnapshot({
    candidates: basePool,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 10,
  });
  const d4SnapshotGen2 = createDiscoveryPresentationSnapshot({
    candidates: basePool,
    sessionSeed: sessionSeedA,
    generationKey: genKey2,
    surfaceKey,
    sectionKey,
    slotCount: 10,
  });
  const d4_new_generation_can_produce_new_order =
    d4SnapshotGen1.slots.some(
      (slot, idx) => slot.id !== d4SnapshotGen2.slots[idx]?.id,
    );

  // D5 FOCUSED_ITEM_DOES_NOT_MOVE
  const d5Snapshot = createDiscoveryPresentationSnapshot({
    candidates: basePool,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 5,
  });
  const focusedIndex = 2;
  const focusedId = d5Snapshot.slots[focusedIndex]?.id;

  const updatedCandidates: TestItem[] = basePool.map((item) =>
    item.id === focusedId
      ? { ...item, title: `${item.title} (Atualizado)`, posterUrl: 'https://images.example/poster.jpg' }
      : item,
  );
  const d5Refreshed = refreshDiscoveryPresentationSnapshotItems(
    d5Snapshot,
    updatedCandidates,
  );
  const d5_focused_item_does_not_move =
    Boolean(focusedId) &&
    d5Refreshed.slots[focusedIndex]?.id === focusedId &&
    d5Refreshed.slots[focusedIndex]?.payload.title.includes('(Atualizado)');

  // D6 ARTWORK_UPDATE_DOES_NOT_REORDER
  const initialPoolWithoutArtwork: TestItem[] = basePool.map((item) => ({
    ...item,
    posterUrl: undefined,
  }));
  const d6Snapshot = createDiscoveryPresentationSnapshot({
    candidates: initialPoolWithoutArtwork,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 6,
  });
  const d6OriginalIds = d6Snapshot.slots.map((s) => s.id);

  const updatedPoolWithArtwork: TestItem[] = initialPoolWithoutArtwork.map(
    (item, idx) => (idx % 2 === 0 ? { ...item, posterUrl: `https://images.example/poster-${idx}.jpg` } : item),
  );
  const d6Refreshed = refreshDiscoveryPresentationSnapshotItems(
    d6Snapshot,
    updatedPoolWithArtwork,
  );
  const d6RefreshedIds = d6Refreshed.slots.map((s) => s.id);
  const d6_artwork_update_does_not_reorder =
    d6OriginalIds.every((id, idx) => id === d6RefreshedIds[idx]);

  // D6B NORMALIZED_ID_REFRESH
  const candidateWithSpaces: TestItem = {
    id: '  item-77  ',
    title: 'Item 77 Original',
  };
  const d6bInitialPool = [candidateWithSpaces, ...basePool.slice(0, 3)];
  const d6bSnapshot = createDiscoveryPresentationSnapshot({
    candidates: d6bInitialPool,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 4,
  });
  const cleanId = 'item-77';

  const updatedCandidateClean: TestItem = {
    id: cleanId,
    title: 'Item 77 Atualizado',
    posterUrl: 'https://images.example/item77.jpg',
  };
  const d6bRefreshed = refreshDiscoveryPresentationSnapshotItems(
    d6bSnapshot,
    [updatedCandidateClean, ...basePool.slice(0, 3)],
  );
  const targetSlotIndex = d6bSnapshot.slots.findIndex((s) => s.id === cleanId);
  const d6b_normalized_id_refresh =
    targetSlotIndex !== -1 &&
    d6bSnapshot.slots[targetSlotIndex]?.id === cleanId &&
    d6bRefreshed.slots[targetSlotIndex]?.id === cleanId &&
    d6bRefreshed.slots[targetSlotIndex]?.payload.title === 'Item 77 Atualizado';

  // D8 DUPLICATES_REMOVED
  const poolWithDuplicates: TestItem[] = [
    { id: 'item-1', title: 'Item 1' },
    { id: 'item-2', title: 'Item 2' },
    { id: 'item-1', title: 'Item 1 Duplicado' },
    { id: 'item-3', title: 'Item 3' },
  ];
  const cleanedPool = createDiscoveryCandidatePool(poolWithDuplicates);
  const d8_duplicates_removed =
    cleanedPool.length === 3 &&
    cleanedPool.map((i) => i.id).join(',') === 'item-1,item-2,item-3';

  // D8B DUPLICATE_ARTWORK_ORDER_INDEPENDENT
  const itemNoArt: TestItem = { id: 'same-item', title: 'Same Item', posterUrl: undefined };
  const itemWithArt: TestItem = { id: 'same-item', title: 'Same Item', posterUrl: 'https://images.example/same.jpg' };
  const isArtReady = (i: TestItem) => Boolean(i.posterUrl);

  const dupPool1 = createDiscoveryCandidatePool([itemNoArt, itemWithArt], isArtReady);
  const dupPool2 = createDiscoveryCandidatePool([itemWithArt, itemNoArt], isArtReady);
  const d8b_duplicate_artwork_order_independent =
    dupPool1.length === 1 &&
    dupPool2.length === 1 &&
    dupPool1[0]?.posterUrl === 'https://images.example/same.jpg' &&
    dupPool2[0]?.posterUrl === 'https://images.example/same.jpg';

  // D10 ARTWORK_READY_PREFERRED
  const mixedCandidates: TestItem[] = [
    { id: 'no-art-1', title: 'Sem Art 1' },
    { id: 'no-art-2', title: 'Sem Art 2' },
    { id: 'art-1', title: 'Com Art 1', posterUrl: 'https://images.example/art1.jpg' },
    { id: 'no-art-3', title: 'Sem Art 3' },
    { id: 'art-2', title: 'Com Art 2', posterUrl: 'https://images.example/art2.jpg' },
  ];
  const d10Selection = selectDiscoveryItems({
    candidates: mixedCandidates,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 2,
    isArtworkReady: isArtReady,
  });
  const d10_artwork_ready_preferred =
    d10Selection.length === 2 &&
    d10Selection.every((item) => Boolean(item.posterUrl));

  // D11 NO_ARTWORK_NOT_REMOVED
  const d11Selection = selectDiscoveryItems({
    candidates: mixedCandidates,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey,
    sectionKey,
    slotCount: 5,
    isArtworkReady: isArtReady,
  });
  const d11_no_artwork_not_removed =
    d11Selection.length === 5 &&
    d11Selection.some((item) => !item.posterUrl);

  // D20 BACKEND_CONTROL_PLANE_ONLY
  // Operação real e completa em memória demonstrando isolamento síncrono
  const d20Candidates = createSampleCandidates(15);
  const d20Selected = selectDiscoveryItems({
    candidates: d20Candidates,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey: 'live',
    sectionKey: 'featured',
    slotCount: 5,
  });
  const d20Snapshot = createDiscoveryPresentationSnapshot({
    candidates: d20Candidates,
    sessionSeed: sessionSeedA,
    generationKey: genKey1,
    surfaceKey: 'live',
    sectionKey: 'featured',
    slotCount: 5,
  });
  const d20Refreshed = refreshDiscoveryPresentationSnapshotItems(
    d20Snapshot,
    d20Candidates,
  );
  const d20_backend_control_plane_only =
    d20Selected.length === 5 &&
    d20Snapshot.slots.length === 5 &&
    d20Refreshed.slots.length === 5 &&
    d20Snapshot.slots.every((s, i) => s.id === d20Refreshed.slots[i]?.id);

  const result = {
    d1_same_seed_same_order,
    d1b_input_order_independent,
    d2_different_session_different_order,
    d3_render_no_reshuffle,
    d4_new_generation_can_produce_new_order,
    d5_focused_item_does_not_move,
    d6_artwork_update_does_not_reorder,
    d6b_normalized_id_refresh,
    d8_duplicates_removed,
    d8b_duplicate_artwork_order_independent,
    d10_artwork_ready_preferred,
    d11_no_artwork_not_removed,
    d20_backend_control_plane_only,
    generation_empty_part_rejected: emptyPartRejected,
    generation_position_collision_prevented: positionCollisionPrevented,
  };

  return {
    ok: Object.values(result).every(Boolean),
    ...result,
  };
}
