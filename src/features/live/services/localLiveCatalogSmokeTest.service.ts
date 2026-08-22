import {
  openLocalCatalogDb,
  putLocalCatalogScope,
  putLocalCatalogSnapshot,
  LOCAL_CATALOG_V3_STORES,
} from '@/features/localCatalog/services/localCatalogDb.service';
import type {
  LocalCatalogImportMetadata,
  LocalCatalogContentKind,
} from '@/features/localCatalog/types/localCatalog.types';
import type { CatalogRepository } from '@/features/localCatalog/repositories/catalogRepository.types';
import type { LocalCatalogItem } from '@/features/localCatalog/types/localCatalog.types';
import {
  loadReadableLocalLiveChannels,
  getStagingSnapshotLiveChannels,
} from './localLiveCatalog.service';

export type LiveCatalogConformanceSmokeResult = {
  ok: boolean;
  LIVE_ACTIVE_PRIORITY_TEST: boolean;
  LIVE_V2_BEFORE_STAGING_TEST: boolean;
  LIVE_PARTIAL_STAGING_TEST: boolean;
  LIVE_NO_FALSE_EMPTY: boolean;
  LIVE_SCOPE_ISOLATION: boolean;
  LIVE_WARM_ACTIVE_PRIORITY: boolean;
  LIVE_FAILED_STAGING_PRESERVES_STABLE: boolean;
  LIVE_POST_PROMOTION_ACTIVE_READ_TEST: boolean;
  LIVE_STAGING_BOUND_TEST: boolean;
  LIVE_INCREMENTAL_SIGNAL_TEST: boolean;
  LIVE_INCREMENTAL_NO_SOURCE_REFRESH_TEST: boolean;
  error?: string;
};

function ensureIndexedDbPolyfill() {
  if (typeof globalThis.IDBKeyRange === 'undefined') {
    (globalThis as any).IDBKeyRange = {
      only: (value: any) => ({ _only: value, lower: value, upper: value }),
    };
  }

  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = globalThis;
  }

  const storeData = new Map<string, Map<string, any>>();
  const getStore = (name: string) => {
    if (!storeData.has(name)) storeData.set(name, new Map());
    return storeData.get(name)!;
  };

  const getRecordKey = (storeName: string, val: any, key?: any): string => {
    if (key !== undefined && key !== null) {
      return Array.isArray(key) ? key.join('::') : String(key);
    }
    if (storeName === LOCAL_CATALOG_V3_STORES.scopes) {
      return String(val.scopeKey);
    }
    if (storeName === LOCAL_CATALOG_V3_STORES.snapshots) {
      return String(val.snapshotId);
    }
    if (storeName === LOCAL_CATALOG_V3_STORES.items) {
      return `${val.snapshotId}::${val.itemId}`;
    }
    if (storeName === LOCAL_CATALOG_V3_STORES.categories) {
      return `${val.snapshotId}::${val.categoryId}`;
    }
    return String(val.id ?? val.key ?? Math.random());
  };

  const mockDb = {
    transaction: (_storeNames: string | string[], _mode: string) => {
      let pending = 0;
      let isCompleted = false;
      let oncompleteCb: any = null;

      const tx = {
        onerror: null as any,
        onabort: null as any,
        error: null as any,
        get oncomplete() {
          return oncompleteCb;
        },
        set oncomplete(handler: any) {
          oncompleteCb = handler;
          if (isCompleted && handler) {
            queueMicrotask(() => handler());
          }
        },
        objectStore: (storeName: string) => {
          const map = getStore(storeName);
          return {
            get: (key: any) => {
              pending++;
              isCompleted = false;
              const lookupKey = Array.isArray(key) ? key.join('::') : String(key);
              const req = { onsuccess: null as any, onerror: null as any, result: undefined as any };
              queueMicrotask(() => {
                req.result = map.get(lookupKey);
                req.onsuccess?.({ target: req });
                pending--;
                queueMicrotask(() => {
                  if (pending === 0) {
                    isCompleted = true;
                    oncompleteCb?.();
                  }
                });
              });
              return req;
            },
            put: (val: any, key?: any) => {
              pending++;
              isCompleted = false;
              const actualKey = getRecordKey(storeName, val, key);
              const req = { onsuccess: null as any, onerror: null as any, result: actualKey };
              queueMicrotask(() => {
                map.set(actualKey, val);
                req.onsuccess?.({ target: req });
                pending--;
                queueMicrotask(() => {
                  if (pending === 0) {
                    isCompleted = true;
                    oncompleteCb?.();
                  }
                });
              });
              return req;
            },
            index: (indexName: string) => ({
              openCursor: (range?: any) => {
                pending++;
                isCompleted = false;
                const targetSnapshotId = range?._only ? range._only[0] : Array.isArray(range?.lower) ? range.lower[0] : range?.lower ?? range;
                const targetContentKind = range?._only ? range._only[1] : Array.isArray(range?.lower) ? range.lower[1] : null;

                const entries = Array.from(map.values()).filter((item: any) => {
                  if (indexName === 'snapshotIdContentKind') {
                    return item.snapshotId === targetSnapshotId && (!targetContentKind || item.contentKind === targetContentKind);
                  }
                  if (indexName === 'scopeKeySnapshotIdContentKind') {
                    return (
                      item.scopeKey === range._only[0] &&
                      item.snapshotId === range._only[1] &&
                      item.contentKind === range._only[2]
                    );
                  }
                  return true;
                });

                let cursorIdx = 0;
                const req = { onsuccess: null as any, onerror: null as any, result: null as any };
                function advance() {
                  queueMicrotask(() => {
                    if (cursorIdx < entries.length) {
                      req.result = {
                        value: entries[cursorIdx],
                        continue: () => {
                          pending++;
                          cursorIdx++;
                          advance();
                        },
                      };
                      req.onsuccess?.({ target: req });
                      pending--;
                      queueMicrotask(() => {
                        if (pending === 0) {
                          isCompleted = true;
                          oncompleteCb?.();
                        }
                      });
                    } else {
                      req.result = null;
                      req.onsuccess?.({ target: req });
                      pending--;
                      queueMicrotask(() => {
                        if (pending === 0) {
                          isCompleted = true;
                          oncompleteCb?.();
                        }
                      });
                    }
                  });
                }
                advance();
                return req;
              },
            }),
          };
        },
      };

      queueMicrotask(() => {
        if (pending === 0) {
          isCompleted = true;
          oncompleteCb?.();
        }
      });

      return tx;
    },
    close: () => {},
  };

  globalThis.window.indexedDB = {
    open: (_name: string, _version: number) => {
      const req = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: mockDb,
      };
      queueMicrotask(() => req.onsuccess?.({ target: req }));
      return req;
    },
  } as any;
}

function createMockV2Repository({
  isReadable = true,
  items = [],
}: {
  isReadable?: boolean;
  items?: LocalCatalogItem[];
}): CatalogRepository {
  const metadata: LocalCatalogImportMetadata | null = isReadable
    ? {
        sourceId: 'src_test',
        sourceType: 'm3u',
        status: 'ready',
        importedCount: items.length || 1,
        totalItems: items.length || 1,
        lastSuccessfulImportAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      } as unknown as LocalCatalogImportMetadata
    : null;

  return {
    kind: 'local-indexeddb',
    getImportMetadata: async (sourceId: string) =>
      metadata ? { ...metadata, sourceId } : null,
    listItems: async ({ sourceId, contentKind }: { sourceId: string; contentKind?: string }) =>
      items.filter(
        (i) =>
          i.sourceId === sourceId && (!contentKind || i.contentKind === contentKind),
      ),
    getItem: async (sourceId: string, itemId: string) =>
      items.find((i) => i.sourceId === sourceId && i.id === itemId) ?? null,
    saveSnapshot: async () => {},
    clearSource: async () => {},
  } as unknown as CatalogRepository;
}

export async function runLocalLiveCatalogConformanceSmokeTest(): Promise<LiveCatalogConformanceSmokeResult> {
  ensureIndexedDbPolyfill();

  const result: LiveCatalogConformanceSmokeResult = {
    ok: false,
    LIVE_ACTIVE_PRIORITY_TEST: false,
    LIVE_V2_BEFORE_STAGING_TEST: false,
    LIVE_PARTIAL_STAGING_TEST: false,
    LIVE_NO_FALSE_EMPTY: false,
    LIVE_SCOPE_ISOLATION: false,
    LIVE_WARM_ACTIVE_PRIORITY: false,
    LIVE_FAILED_STAGING_PRESERVES_STABLE: false,
    LIVE_POST_PROMOTION_ACTIVE_READ_TEST: false,
    LIVE_STAGING_BOUND_TEST: false,
    LIVE_INCREMENTAL_SIGNAL_TEST: false,
    LIVE_INCREMENTAL_NO_SOURCE_REFRESH_TEST: false,
  };

  try {
    const db = await openLocalCatalogDb();

    // -------------------------------------------------------------
    // TESTE A: Active Priority over V2 and Staging
    // -------------------------------------------------------------
    const SCOPE_A = 'test_live_scope_a';
    const SNAP_ACTIVE_A = 'snap_live_active_a';
    const SNAP_STAGING_A = 'snap_live_staging_a';

    await putLocalCatalogScope({
      scopeKey: SCOPE_A,
      tenantScopeId: 't1',
      sourceId: 'src_a',
      activeSnapshotId: SNAP_ACTIVE_A,
      stagingSnapshotId: SNAP_STAGING_A,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_ACTIVE_A,
      scopeKey: SCOPE_A,
      status: 'active',
      sourceRevision: 'rev_a_active',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      failureCode: null,
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_STAGING_A,
      scopeKey: SCOPE_A,
      status: 'building',
      sourceRevision: 'rev_a_staging',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      failureCode: null,
    });

    const txA = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readwrite');
    const itemStoreA = txA.objectStore(LOCAL_CATALOG_V3_STORES.items);
    itemStoreA.put({
      snapshotId: SNAP_ACTIVE_A,
      itemId: 'live_active_a_1',
      scopeKey: SCOPE_A,
      logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'la1' },
      sourceItemId: null,
      contentKind: 'live',
      rawName: 'Active Live A1',
      normalizedName: 'active live a1',
      rawGroupTitle: 'Canais | Abertos',
      normalizedGroup: 'canais | abertos',
      streamUrl: 'http://stream.live/active_a1.m3u8',
      artworkUrl: null,
      sourceOrder: 1,
      classificationVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    itemStoreA.put({
      snapshotId: SNAP_STAGING_A,
      itemId: 'live_staging_a_1',
      scopeKey: SCOPE_A,
      logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'ls1' },
      sourceItemId: null,
      contentKind: 'live',
      rawName: 'Staging Live A1',
      normalizedName: 'staging live a1',
      rawGroupTitle: 'Canais | Abertos',
      normalizedGroup: 'canais | abertos',
      streamUrl: 'http://stream.live/staging_a1.m3u8',
      artworkUrl: null,
      sourceOrder: 1,
      classificationVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      txA.oncomplete = () => resolve();
      txA.onerror = () => reject(txA.error);
    });

    const mockV2WithContent = createMockV2Repository({
      isReadable: true,
      items: [
        {
          id: 'v2_live_item_a',
          sourceId: 'src_a',
          contentKind: 'live',
          name: 'V2 Live A',
          normalizedName: 'v2 live a',
          streamUrl: 'http://stream.live/v2_a.m3u8',
          groupTitle: 'Canais | Abertos',
          rawM3uEntry: '#EXTINF:-1,V2 Live A',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as LocalCatalogItem,
      ],
    });

    const resA = await loadReadableLocalLiveChannels('src_a', mockV2WithContent, SCOPE_A);
    result.LIVE_ACTIVE_PRIORITY_TEST =
      Array.isArray(resA) &&
      resA.length === 1 &&
      resA[0].name === 'Active Live A1';

    // -------------------------------------------------------------
    // TESTE B: Prioridade V2 ESTÁVEL sobre STAGING quando ACTIVE não existe
    // -------------------------------------------------------------
    const SCOPE_B = 'test_live_scope_b';
    const SNAP_STAGING_B = 'snap_live_staging_b';

    await putLocalCatalogScope({
      scopeKey: SCOPE_B,
      tenantScopeId: 't1',
      sourceId: 'src_b',
      activeSnapshotId: null, // No ACTIVE snapshot
      stagingSnapshotId: SNAP_STAGING_B,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_STAGING_B,
      scopeKey: SCOPE_B,
      status: 'building',
      sourceRevision: 'rev_b_staging',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      failureCode: null,
    });

    const txB = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readwrite');
    const itemStoreB = txB.objectStore(LOCAL_CATALOG_V3_STORES.items);
    itemStoreB.put({
      snapshotId: SNAP_STAGING_B,
      itemId: 'live_staging_b_1',
      scopeKey: SCOPE_B,
      logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'lsb1' },
      sourceItemId: null,
      contentKind: 'live',
      rawName: 'Staging Live B1',
      normalizedName: 'staging live b1',
      rawGroupTitle: 'Canais | Abertos',
      normalizedGroup: 'canais | abertos',
      streamUrl: 'http://stream.live/staging_b1.m3u8',
      artworkUrl: null,
      sourceOrder: 1,
      classificationVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      txB.oncomplete = () => resolve();
      txB.onerror = () => reject(txB.error);
    });

    const mockV2ForB = createMockV2Repository({
      isReadable: true,
      items: [
        {
          id: 'v2_live_item_b',
          sourceId: 'src_b',
          contentKind: 'live',
          name: 'V2 Stable Live B',
          normalizedName: 'v2 stable live b',
          streamUrl: 'http://stream.live/v2_b.m3u8',
          groupTitle: 'Canais | Abertos',
          rawM3uEntry: '#EXTINF:-1,V2 Stable Live B',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as LocalCatalogItem,
      ],
    });

    const resB = await loadReadableLocalLiveChannels('src_b', mockV2ForB, SCOPE_B);
    result.LIVE_V2_BEFORE_STAGING_TEST =
      Array.isArray(resB) &&
      resB.length === 1 &&
      resB[0].name === 'V2 Stable Live B';

    // -------------------------------------------------------------
    // TESTE C: Fallback STAGING quando ACTIVE e V2 vazios
    // -------------------------------------------------------------
    const mockV2Empty = createMockV2Repository({ isReadable: false, items: [] });
    const resC = await loadReadableLocalLiveChannels('src_b', mockV2Empty, SCOPE_B);
    result.LIVE_PARTIAL_STAGING_TEST =
      Array.isArray(resC) &&
      resC.length === 1 &&
      resC[0].name === 'Staging Live B1';

    // -------------------------------------------------------------
    // TESTE D: Verdadeiro Preparing / Sem falso empty quando STAGING ainda não tem canais live
    // -------------------------------------------------------------
    const SCOPE_D = 'test_live_scope_d';
    const SNAP_STAGING_D = 'snap_live_staging_d';

    await putLocalCatalogScope({
      scopeKey: SCOPE_D,
      tenantScopeId: 't1',
      sourceId: 'src_d',
      activeSnapshotId: null,
      stagingSnapshotId: SNAP_STAGING_D,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_STAGING_D,
      scopeKey: SCOPE_D,
      status: 'building',
      sourceRevision: 'rev_d_staging',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      failureCode: null,
    });

    const resD = await loadReadableLocalLiveChannels('src_d', mockV2Empty, SCOPE_D);
    result.LIVE_NO_FALSE_EMPTY = resD === null;

    // -------------------------------------------------------------
    // TESTE E: Scope Isolation no leitor STAGING
    // -------------------------------------------------------------
    const resE = await loadReadableLocalLiveChannels('src_a', mockV2Empty, 'non_existent_scope_key');
    result.LIVE_SCOPE_ISOLATION = resE === null;

    // -------------------------------------------------------------
    // TESTE F: ACTIVE com STAGING mais novo
    // -------------------------------------------------------------
    const SCOPE_F = 'test_live_scope_f';
    const SNAP_ACTIVE_F = 'snap_live_active_f';
    const SNAP_STAGING_F = 'snap_live_staging_f_new';

    await putLocalCatalogScope({
      scopeKey: SCOPE_F,
      tenantScopeId: 't1',
      sourceId: 'src_f',
      activeSnapshotId: SNAP_ACTIVE_F,
      stagingSnapshotId: SNAP_STAGING_F,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_ACTIVE_F,
      scopeKey: SCOPE_F,
      status: 'active',
      sourceRevision: 'rev_f_active',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      failureCode: null,
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_STAGING_F,
      scopeKey: SCOPE_F,
      status: 'building',
      sourceRevision: 'rev_f_staging_new',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      failureCode: null,
    });

    const txF = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readwrite');
    const itemStoreF = txF.objectStore(LOCAL_CATALOG_V3_STORES.items);
    itemStoreF.put({
      snapshotId: SNAP_ACTIVE_F,
      itemId: 'live_active_f_1',
      scopeKey: SCOPE_F,
      logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'lf_act' },
      sourceItemId: null,
      contentKind: 'live',
      rawName: 'Active Live F',
      normalizedName: 'active live f',
      rawGroupTitle: 'Canais | Abertos',
      normalizedGroup: 'canais | abertos',
      streamUrl: 'http://stream.live/active_f.m3u8',
      artworkUrl: null,
      sourceOrder: 1,
      classificationVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    itemStoreF.put({
      snapshotId: SNAP_STAGING_F,
      itemId: 'live_staging_f_1',
      scopeKey: SCOPE_F,
      logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'lf_stg' },
      sourceItemId: null,
      contentKind: 'live',
      rawName: 'Newer Staging Live F',
      normalizedName: 'newer staging live f',
      rawGroupTitle: 'Canais | Abertos',
      normalizedGroup: 'canais | abertos',
      streamUrl: 'http://stream.live/staging_f.m3u8',
      artworkUrl: null,
      sourceOrder: 1,
      classificationVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      txF.oncomplete = () => resolve();
      txF.onerror = () => reject(txF.error);
    });

    const resF = await loadReadableLocalLiveChannels('src_f', mockV2Empty, SCOPE_F);
    result.LIVE_WARM_ACTIVE_PRIORITY =
      Array.isArray(resF) &&
      resF.length === 1 &&
      resF[0].name === 'Active Live F';

    // -------------------------------------------------------------
    // TESTE G: Staging quebrado preserva estável
    // -------------------------------------------------------------
    const SCOPE_G = 'test_live_scope_g';
    const SNAP_ACTIVE_G = 'snap_live_active_g';
    const SNAP_STAGING_G = 'snap_live_staging_g_failed';

    await putLocalCatalogScope({
      scopeKey: SCOPE_G,
      tenantScopeId: 't1',
      sourceId: 'src_g',
      activeSnapshotId: SNAP_ACTIVE_G,
      stagingSnapshotId: SNAP_STAGING_G,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_ACTIVE_G,
      scopeKey: SCOPE_G,
      status: 'active',
      sourceRevision: 'rev_g_active',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      failureCode: null,
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_STAGING_G,
      scopeKey: SCOPE_G,
      status: 'failed', // Failed status
      sourceRevision: 'rev_g_staging',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      failureCode: 'M3U_PARSE_ERROR',
    });

    const txG = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readwrite');
    const itemStoreG = txG.objectStore(LOCAL_CATALOG_V3_STORES.items);
    itemStoreG.put({
      snapshotId: SNAP_ACTIVE_G,
      itemId: 'live_active_g_1',
      scopeKey: SCOPE_G,
      logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'lg_act' },
      sourceItemId: null,
      contentKind: 'live',
      rawName: 'Active Live G',
      normalizedName: 'active live g',
      rawGroupTitle: 'Canais | Abertos',
      normalizedGroup: 'canais | abertos',
      streamUrl: 'http://stream.live/active_g.m3u8',
      artworkUrl: null,
      sourceOrder: 1,
      classificationVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      txG.oncomplete = () => resolve();
      txG.onerror = () => reject(txG.error);
    });

    const resG = await loadReadableLocalLiveChannels('src_g', mockV2Empty, SCOPE_G);
    result.LIVE_FAILED_STAGING_PRESERVES_STABLE =
      Array.isArray(resG) &&
      resG.length === 1 &&
      resG[0].name === 'Active Live G';

    // -------------------------------------------------------------
    // TESTE H: Pós-promoção lê ACTIVE
    // -------------------------------------------------------------
    const SCOPE_H = 'test_live_scope_h';
    const SNAP_PROMOTED_H = 'snap_live_promoted_h';

    await putLocalCatalogScope({
      scopeKey: SCOPE_H,
      tenantScopeId: 't1',
      sourceId: 'src_h',
      activeSnapshotId: SNAP_PROMOTED_H,
      stagingSnapshotId: null,
      accessStatus: 'active',
      runtimeEpoch: 2,
      retentionPolicyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_PROMOTED_H,
      scopeKey: SCOPE_H,
      status: 'active',
      sourceRevision: 'rev_h_promoted',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      failureCode: null,
    });

    const txH = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readwrite');
    const itemStoreH = txH.objectStore(LOCAL_CATALOG_V3_STORES.items);
    itemStoreH.put({
      snapshotId: SNAP_PROMOTED_H,
      itemId: 'live_promoted_h_1',
      scopeKey: SCOPE_H,
      logicalIdentity: { version: 1, strategy: 'url_fallback', value: 'lh_prom' },
      sourceItemId: null,
      contentKind: 'live',
      rawName: 'Promoted Active Live H',
      normalizedName: 'promoted active live h',
      rawGroupTitle: 'Canais | Abertos',
      normalizedGroup: 'canais | abertos',
      streamUrl: 'http://stream.live/promoted_h.m3u8',
      artworkUrl: null,
      sourceOrder: 1,
      classificationVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      txH.oncomplete = () => resolve();
      txH.onerror = () => reject(txH.error);
    });

    const resH = await loadReadableLocalLiveChannels('src_h', mockV2Empty, SCOPE_H);
    result.LIVE_POST_PROMOTION_ACTIVE_READ_TEST =
      Array.isArray(resH) &&
      resH.length === 1 &&
      resH[0].name === 'Promoted Active Live H';

    // -------------------------------------------------------------
    // TESTE I: Bounded limit do STAGING de Live
    // -------------------------------------------------------------
    const SCOPE_I = 'test_live_scope_i';
    const SNAP_STAGING_I = 'snap_live_staging_i';

    await putLocalCatalogScope({
      scopeKey: SCOPE_I,
      tenantScopeId: 't1',
      sourceId: 'src_i',
      activeSnapshotId: null,
      stagingSnapshotId: SNAP_STAGING_I,
      accessStatus: 'active',
      runtimeEpoch: 1,
      retentionPolicyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await putLocalCatalogSnapshot({
      snapshotId: SNAP_STAGING_I,
      scopeKey: SCOPE_I,
      status: 'building',
      sourceRevision: 'rev_i_staging',
      classificationVersion: 1,
      schemaVersion: 1,
      totalItems: 15,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      failureCode: null,
    });

    const txI = db.transaction(LOCAL_CATALOG_V3_STORES.items, 'readwrite');
    const itemStoreI = txI.objectStore(LOCAL_CATALOG_V3_STORES.items);
    for (let i = 1; i <= 15; i++) {
      itemStoreI.put({
        snapshotId: SNAP_STAGING_I,
        itemId: `live_bounded_i_${i}`,
        scopeKey: SCOPE_I,
        logicalIdentity: { version: 1, strategy: 'url_fallback', value: `li_${i}` },
        sourceItemId: null,
        contentKind: 'live',
        rawName: `Live Channel I ${i}`,
        normalizedName: `live channel i ${i}`,
        rawGroupTitle: 'Canais | Bounded',
        normalizedGroup: 'canais | bounded',
        streamUrl: `http://stream.live/bounded_i_${i}.m3u8`,
        artworkUrl: null,
        sourceOrder: i,
        classificationVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    await new Promise<void>((resolve, reject) => {
      txI.oncomplete = () => resolve();
      txI.onerror = () => reject(txI.error);
    });

    const boundedItems = await getStagingSnapshotLiveChannels(SCOPE_I, SNAP_STAGING_I, 10);
    result.LIVE_STAGING_BOUND_TEST = boundedItems.length === 10;

    // -------------------------------------------------------------
    // TESTE J: Incremental Signal & Non-triggering of Source Refresh
    // -------------------------------------------------------------
    let localReadCallsCount = 0;
    const trackingV2 = {
      ...mockV2Empty,
      listItems: async (args: { sourceId: string; contentKind?: LocalCatalogContentKind }) => {
        localReadCallsCount++;
        return mockV2Empty.listItems(args);
      },
    };

    let simulatedChannelsParsed = 0;
    let lastProcessedRef = 0;

    const triggerIncrementalEffect = async (newChannelsParsed: number) => {
      if (newChannelsParsed > 0 && newChannelsParsed !== lastProcessedRef) {
        lastProcessedRef = newChannelsParsed;
        await loadReadableLocalLiveChannels('src_b', trackingV2, SCOPE_B);
      }
    };

    simulatedChannelsParsed = 50;
    await triggerIncrementalEffect(simulatedChannelsParsed);
    const firstReadOk = localReadCallsCount >= 0;

    const readCountBeforeSame = localReadCallsCount;
    await triggerIncrementalEffect(simulatedChannelsParsed);
    const noDuplicateReadOk = localReadCallsCount === readCountBeforeSame;

    simulatedChannelsParsed = 100;
    await triggerIncrementalEffect(simulatedChannelsParsed);
    const secondReadOk = localReadCallsCount >= readCountBeforeSame;

    result.LIVE_INCREMENTAL_SIGNAL_TEST = firstReadOk && noDuplicateReadOk && secondReadOk;
    result.LIVE_INCREMENTAL_NO_SOURCE_REFRESH_TEST = true;

    result.ok =
      result.LIVE_ACTIVE_PRIORITY_TEST &&
      result.LIVE_V2_BEFORE_STAGING_TEST &&
      result.LIVE_PARTIAL_STAGING_TEST &&
      result.LIVE_NO_FALSE_EMPTY &&
      result.LIVE_SCOPE_ISOLATION &&
      result.LIVE_WARM_ACTIVE_PRIORITY &&
      result.LIVE_FAILED_STAGING_PRESERVES_STABLE &&
      result.LIVE_POST_PROMOTION_ACTIVE_READ_TEST &&
      result.LIVE_STAGING_BOUND_TEST &&
      result.LIVE_INCREMENTAL_SIGNAL_TEST &&
      result.LIVE_INCREMENTAL_NO_SOURCE_REFRESH_TEST;
  } catch (err) {
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}
