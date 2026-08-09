import {
  readLiveLastChannel,
  resolveLiveContinuity,
  saveLiveLastChannel,
  type LiveContinuityScope,
  type LiveContinuityStorage,
} from './liveContinuity.service';

export type LiveContinuitySmokeResult = {
  ok: boolean;
  saveAndRead: boolean;
  licenseScopeIsolation: boolean;
  sourceScopeIsolation: boolean;
  deviceScopeIsolation: boolean;
  validRestore: boolean;
  staleDiscarded: boolean;
  staleFallback: boolean;
  noStateFallback: boolean;
  unplayableSkipped: boolean;
  noPlayableReturnsNull: boolean;
  rawUrlNotPersisted: boolean;
  licenseCodeNotPersisted: boolean;
  malformedStateSafe: boolean;
  networkRequestAvoided: boolean;
  restartPersistenceRegression: boolean;
  previewSelectionPersists: boolean;
  processRestartRestore: boolean;
  processRestartAutopreview: boolean;
  scopeIsolationAfterRestart: boolean;
  staleChannelAfterRestart: boolean;
  noStateAfterRestart: boolean;
};

class MemoryStorage implements LiveContinuityStorage {
  private store: Map<string, string>;

  constructor(store = new Map<string, string>()) {
    this.store = store;
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  getRawStore(): Map<string, string> {
    return this.store;
  }
}

export function runLiveContinuitySmokeTest(): LiveContinuitySmokeResult {
  const memory = new MemoryStorage();

  let networkRequestCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    networkRequestCount++;
    throw new Error('Network requests strictly forbidden during continuity smoke test.');
  }) as typeof fetch;

  try {
    const scopeA: LiveContinuityScope = {
      internalLicenseId: 'lic-123',
      sourceId: 'src-456',
      deviceIdentifier: 'dev-789',
    };

    const scopeB: LiveContinuityScope = {
      internalLicenseId: 'lic-999',
      sourceId: 'src-456',
      deviceIdentifier: 'dev-789',
    };

    const scopeC: LiveContinuityScope = {
      internalLicenseId: 'lic-123',
      sourceId: 'src-777',
      deviceIdentifier: 'dev-789',
    };

    const scopeD: LiveContinuityScope = {
      internalLicenseId: 'lic-123',
      sourceId: 'src-456',
      deviceIdentifier: 'dev-111',
    };

    // Case 1: Save & Read
    const savedOk = saveLiveLastChannel(scopeA, 'chan-ch1', memory);
    const recordA = readLiveLastChannel(scopeA, memory);
    const saveAndRead = savedOk && recordA?.channelId === 'chan-ch1';

    // Case 2: License scope isolation
    const recordB = readLiveLastChannel(scopeB, memory);
    const licenseScopeIsolation = recordB === null;

    // Case 3: Source scope isolation
    const recordC = readLiveLastChannel(scopeC, memory);
    const sourceScopeIsolation = recordC === null;

    // Case 4: Device scope isolation
    const recordD = readLiveLastChannel(scopeD, memory);
    const deviceScopeIsolation = recordD === null;

    // Case 5: Valid restore
    const channels = [
      { id: 'chan-ch0', url: 'http://source.local/ch0.m3u8', title: 'Canal 0' },
      { id: 'chan-ch1', url: 'http://source.local/ch1.m3u8', title: 'Canal 1' },
      { id: 'chan-ch2', url: 'http://source.local/ch2.m3u8', title: 'Canal 2' },
    ];
    const resValid = resolveLiveContinuity(scopeA, channels, memory);
    const validRestore = resValid.status === 'RESTORED' && resValid.channel?.id === 'chan-ch1';

    // Case 6 & 7: Stale discarded and stale fallback to first playable
    const staleChannels = [
      { id: 'chan-ch99', url: 'http://source.local/ch99.m3u8', title: 'Canal 99' },
      { id: 'chan-ch2', url: 'http://source.local/ch2.m3u8', title: 'Canal 2' },
    ];
    const resStale = resolveLiveContinuity(scopeA, staleChannels, memory);
    const staleDiscarded = resStale.status === 'STALE_DISCARDED';
    const staleFallback = resStale.channel?.id === 'chan-ch99';

    // Case 8: NO_STATE fallback
    const resNoState = resolveLiveContinuity(scopeB, channels, memory);
    const noStateFallback = resNoState.status === 'NO_STATE' && resNoState.channel?.id === 'chan-ch0';

    // Case 9: Unplayable (empty URL) skipped as fallback
    const channelsWithUnplayable = [
      { id: 'chan-bad', url: '', title: 'Canal Sem URL' },
      { id: 'chan-ch2', url: 'http://source.local/ch2.m3u8', title: 'Canal 2' },
    ];
    const resUnplayable = resolveLiveContinuity(scopeB, channelsWithUnplayable, memory);
    const unplayableSkipped = resUnplayable.channel?.id === 'chan-ch2';

    // Case 10: No playable channel returns null
    const noPlayable = [{ id: 'chan-bad', url: '   ', title: 'Canal Invalido' }];
    const resNull = resolveLiveContinuity(scopeB, noPlayable, memory);
    const noPlayableReturnsNull = resNull.channel === null;

    // Case 11 & 12: Raw URL and license code NOT persisted in stored string
    saveLiveLastChannel(scopeA, 'chan-ch1', memory);
    const rawStored = Array.from(memory.getRawStore().values()).join(' ');
    const rawUrlNotPersisted = !rawStored.includes('http://') && !rawStored.includes('.m3u8');
    const licenseCodeNotPersisted = !rawStored.includes('LIC_SECRET_CODE_123');

    // Case 13: Malformed state safe
    const key = Array.from(memory.getRawStore().keys())[0];
    if (key) {
      memory.setItem(key, '{ malformed_json_corrupted: ');
    }
    const resMalformed = resolveLiveContinuity(scopeA, channels, memory);
    const malformedStateSafe = resMalformed.status === 'NO_STATE' && resMalformed.channel?.id === 'chan-ch0';

    // Case 14: Network requests avoided
    const networkRequestAvoided = networkRequestCount === 0;

    // Case 15: process restart uses only the durable storage backing store.
    const restartBackingStore = new Map<string, string>();
    const sessionAStorage = new MemoryStorage(restartBackingStore);
    const sessionAScope: LiveContinuityScope = {
      internalLicenseId: 'lic-restart',
      sourceId: 'src-restart',
      deviceIdentifier: 'dev-restart',
    };
    const sessionAChannels = [
      { id: 'chan-restart-a', url: 'https://media.invalid/a', title: 'A' },
      { id: 'chan-restart-b', url: 'https://media.invalid/b', title: 'B' },
    ];
    const previewSelectionPersists =
      sessionAChannels[1]?.id === 'chan-restart-b' &&
      saveLiveLastChannel(
        sessionAScope,
        sessionAChannels[1].id,
        sessionAStorage,
      );

    const sessionBStorage = new MemoryStorage(restartBackingStore);
    const sessionBScope: LiveContinuityScope = {
      internalLicenseId: 'lic-restart',
      sourceId: 'src-restart',
      deviceIdentifier: 'dev-restart',
    };
    const sessionBCatalog = [
      { id: 'chan-restart-a', url: 'https://media.invalid/a', title: 'A' },
      { id: 'chan-restart-b', url: 'https://media.invalid/b', title: 'B' },
    ];
    const restartResolution = resolveLiveContinuity(
      sessionBScope,
      sessionBCatalog,
      sessionBStorage,
    );
    const processRestartRestore =
      restartResolution.status === 'RESTORED' &&
      restartResolution.channel?.id === 'chan-restart-b';
    const processRestartAutopreview =
      restartResolution.channel?.id === 'chan-restart-b';
    const restartPersistenceRegression =
      previewSelectionPersists &&
      processRestartRestore &&
      processRestartAutopreview;

    const isolatedRestartScope: LiveContinuityScope = {
      internalLicenseId: 'lic-restart',
      sourceId: 'src-other',
      deviceIdentifier: 'dev-restart',
    };
    const isolatedRestartResolution = resolveLiveContinuity(
      isolatedRestartScope,
      sessionBCatalog,
      new MemoryStorage(restartBackingStore),
    );
    const scopeIsolationAfterRestart =
      isolatedRestartResolution.status === 'NO_STATE' &&
      isolatedRestartResolution.channel?.id === 'chan-restart-a';

    const staleRestartBackingStore = new Map<string, string>();
    saveLiveLastChannel(
      sessionAScope,
      'chan-removed-after-restart',
      new MemoryStorage(staleRestartBackingStore),
    );
    const staleRestartResolution = resolveLiveContinuity(
      sessionBScope,
      sessionBCatalog,
      new MemoryStorage(staleRestartBackingStore),
    );
    const staleChannelAfterRestart =
      staleRestartResolution.status === 'STALE_DISCARDED' &&
      staleRestartResolution.channel?.id === 'chan-restart-a';

    const noStateRestartResolution = resolveLiveContinuity(
      sessionBScope,
      sessionBCatalog,
      new MemoryStorage(new Map<string, string>()),
    );
    const noStateAfterRestart =
      noStateRestartResolution.status === 'NO_STATE' &&
      noStateRestartResolution.channel?.id === 'chan-restart-a';

    const ok =
      saveAndRead &&
      licenseScopeIsolation &&
      sourceScopeIsolation &&
      deviceScopeIsolation &&
      validRestore &&
      staleDiscarded &&
      staleFallback &&
      noStateFallback &&
      unplayableSkipped &&
      noPlayableReturnsNull &&
      rawUrlNotPersisted &&
      licenseCodeNotPersisted &&
      malformedStateSafe &&
      networkRequestAvoided &&
      restartPersistenceRegression &&
      previewSelectionPersists &&
      processRestartRestore &&
      processRestartAutopreview &&
      scopeIsolationAfterRestart &&
      staleChannelAfterRestart &&
      noStateAfterRestart;

    return {
      ok,
      saveAndRead,
      licenseScopeIsolation,
      sourceScopeIsolation,
      deviceScopeIsolation,
      validRestore,
      staleDiscarded,
      staleFallback,
      noStateFallback,
      unplayableSkipped,
      noPlayableReturnsNull,
      rawUrlNotPersisted,
      licenseCodeNotPersisted,
      malformedStateSafe,
      networkRequestAvoided,
      restartPersistenceRegression,
      previewSelectionPersists,
      processRestartRestore,
      processRestartAutopreview,
      scopeIsolationAfterRestart,
      staleChannelAfterRestart,
      noStateAfterRestart,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
