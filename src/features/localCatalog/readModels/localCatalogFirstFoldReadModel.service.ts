import type {
  HomeVodItem,
  HomeVodSection,
} from '../../catalog/services/homeVod.service';
import { filterRenderableHomeVodSections } from '../../catalog/services/homeVodRenderability.service';
import { getCatalogCategoryDefinition } from '../../catalog/services/catalogCategoryGroups.service';
import type {
  LocalCatalogScope,
  LocalCatalogSnapshot,
  LocalCatalogSnapshotItem,
} from '../types/localCatalog.types';
import {
  LOCAL_CATALOG_V3_STORES,
  openLocalCatalogDb,
  getLocalCatalogScope,
} from '../services/localCatalogDb.service';
import {
  dedupeLocalCatalogGroupTitles,
  normalizeLocalCatalogGroupIdentity,
} from '../services/localCatalogGroupIdentity.service';
import {
  mapActiveSnapshotItemToLocalCatalogItem,
  mapLocalCatalogItemsToHomeVodItems,
  mapLocalCatalogSeriesItemsToHomeVodItems,
} from './localCatalogHomeVodAdapter.service';

export type ListStagingFirstFoldHomeVodSectionsInput = {
  scopeKey: string;
  snapshotId: string;
  sourceId?: string;
  maxSections?: number;
  itemsPerSection?: number;
  movieGroupTitles?: readonly string[];
  seriesGroupTitles?: readonly string[];
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('LOCAL_CATALOG_DB_REQUEST_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error('LOCAL_CATALOG_DB_TRANSACTION_ABORTED'));
    transaction.onerror = () => reject(new Error('LOCAL_CATALOG_DB_TRANSACTION_FAILED'));
  });
}

function normalizeCatalogGroup(value: string) {
  return normalizeLocalCatalogGroupIdentity(value);
}

async function validateStagingSnapshot(
  transaction: IDBTransaction,
  scopeKey: string,
  snapshotId: string,
): Promise<boolean> {
  const scope = (await requestResult(
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.scopes).get(scopeKey),
  )) as LocalCatalogScope | undefined;

  if (
    !scope ||
    scope.accessStatus !== 'active' ||
    scope.stagingSnapshotId !== snapshotId
  ) {
    return false;
  }

  const snapshot = (await requestResult(
    transaction.objectStore(LOCAL_CATALOG_V3_STORES.snapshots).get(snapshotId),
  )) as LocalCatalogSnapshot | undefined;

  if (
    !snapshot ||
    snapshot.scopeKey !== scopeKey ||
    snapshot.status !== 'building'
  ) {
    return false;
  }

  return true;
}

function readBoundedStagingItems(
  index: IDBIndex,
  range: IDBKeyRange,
  input: {
    snapshotId: string;
    scopeKey: string;
    contentKind: 'movie' | 'series' | 'series_episode';
    normalizedGroup?: string;
    limit: number;
  },
): Promise<LocalCatalogSnapshotItem[]> {
  return new Promise<LocalCatalogSnapshotItem[]>((resolve, reject) => {
    const items: LocalCatalogSnapshotItem[] = [];
    const request = index.openCursor(range);

    request.onerror = () => reject(new Error('LOCAL_CATALOG_DB_REQUEST_FAILED'));
    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor || items.length >= input.limit) {
        resolve(items);
        return;
      }

      const item = cursor.value as LocalCatalogSnapshotItem;

      if (
        item.snapshotId === input.snapshotId &&
        item.scopeKey === input.scopeKey &&
        item.contentKind === input.contentKind &&
        (!input.normalizedGroup || item.normalizedGroup === input.normalizedGroup)
      ) {
        items.push(item);
      }

      cursor.continue();
    };
  });
}

export async function listStagingFirstFoldHomeVodSections(
  input: ListStagingFirstFoldHomeVodSectionsInput,
): Promise<HomeVodSection[]> {
  const scopeKey = input.scopeKey?.trim();
  const snapshotId = input.snapshotId?.trim();
  const sourceId = input.sourceId?.trim() || 'default-source';
  const maxSections = Math.max(1, input.maxSections ?? 4);
  const itemsPerSection = Math.max(1, input.itemsPerSection ?? 20);

  if (!scopeKey || !snapshotId) {
    return [];
  }

  const db = await openLocalCatalogDb();

  try {
    const transaction = db.transaction(
      [
        LOCAL_CATALOG_V3_STORES.scopes,
        LOCAL_CATALOG_V3_STORES.snapshots,
        LOCAL_CATALOG_V3_STORES.items,
      ],
      'readonly',
    );
    const completed = transactionDone(transaction);

    const isValid = await validateStagingSnapshot(
      transaction,
      scopeKey,
      snapshotId,
    );

    if (!isValid) {
      await completed;
      return [];
    }

    const preferredGroups = [
      ...dedupeLocalCatalogGroupTitles(input.movieGroupTitles ?? []).map(
        (title) => ({
          title,
          contentKind: 'movie' as const,
        }),
      ),
      ...dedupeLocalCatalogGroupTitles(input.seriesGroupTitles ?? []).map(
        (title) => ({
          title,
          contentKind: 'series' as const,
        }),
      ),
    ];

    const store = transaction.objectStore(LOCAL_CATALOG_V3_STORES.items);
    const index = store.index('snapshotIdContentKindNormalizedGroup');
    const sections: HomeVodSection[] = [];
    const seenSectionKeys = new Set<string>();

    for (let i = 0; i < preferredGroups.length && sections.length < maxSections; i += 1) {
      const { title, contentKind } = preferredGroups[i];
      const normalizedGroup = normalizeCatalogGroup(title);
      const sectionKey = `${contentKind}::${normalizedGroup}`;

      if (seenSectionKeys.has(sectionKey)) {
        continue;
      }

      const requestedLimit =
        contentKind === 'series'
          ? Math.max(80, itemsPerSection * 4)
          : itemsPerSection;

      const rawItems = await readBoundedStagingItems(
        index,
        IDBKeyRange.only([snapshotId, contentKind, normalizedGroup]),
        {
          snapshotId,
          scopeKey,
          contentKind,
          normalizedGroup,
          limit: requestedLimit,
        },
      );

      if (contentKind === 'series' && rawItems.length < requestedLimit) {
        const episodeItems = await readBoundedStagingItems(
          index,
          IDBKeyRange.only([snapshotId, 'series_episode', normalizedGroup]),
          {
            snapshotId,
            scopeKey,
            contentKind: 'series_episode',
            normalizedGroup,
            limit: requestedLimit - rawItems.length,
          },
        );
        rawItems.push(...episodeItems);
      }

      if (rawItems.length > 0) {
        const localItems = rawItems.map((item) =>
          mapActiveSnapshotItemToLocalCatalogItem(item, sourceId),
        );
        const mappedItems: HomeVodItem[] =
          contentKind === 'series'
            ? mapLocalCatalogSeriesItemsToHomeVodItems(
                localItems,
                title,
                new Map(),
                itemsPerSection,
              )
            : mapLocalCatalogItemsToHomeVodItems(
                localItems,
                title,
                new Map(),
              );

        if (mappedItems.length > 0) {
          seenSectionKeys.add(sectionKey);
          sections.push({
            id: `home-staging-${contentKind}-${normalizedGroup}`,
            title,
            eyebrow: '',
            description:
              contentKind === 'series'
                ? 'Séries disponíveis no catálogo local autorizado.'
                : 'Conteúdos disponíveis no catálogo local autorizado.',
            items: mappedItems,
          });
        }
      }
    }

    // Se os grupos preferenciais não preencheram maxSections, busca outros itens VOD no staging:
    if (sections.length < maxSections) {
      const fallbackKinds: Array<'movie' | 'series'> = ['movie', 'series'];
      const kindIndex = store.index('snapshotIdContentKind');

      for (const contentKind of fallbackKinds) {
        if (sections.length >= maxSections) break;

        const rawFallbackItems = await readBoundedStagingItems(
          kindIndex,
          IDBKeyRange.only([snapshotId, contentKind]),
          {
            snapshotId,
            scopeKey,
            contentKind,
            limit: itemsPerSection * 4,
          },
        );

        if (rawFallbackItems.length > 0) {
          // Agrupa por rawGroupTitle
          const byGroup = new Map<string, LocalCatalogSnapshotItem[]>();
          for (const item of rawFallbackItems) {
            const groupName = item.rawGroupTitle?.trim() || (contentKind === 'series' ? 'Séries' : 'Filmes');
            const groupList = byGroup.get(groupName) ?? [];
            groupList.push(item);
            byGroup.set(groupName, groupList);
          }

          for (const [groupTitle, groupItems] of byGroup.entries()) {
            if (sections.length >= maxSections) break;

            const normalizedGroup = normalizeCatalogGroup(groupTitle);
            const sectionKey = `${contentKind}::${normalizedGroup}`;

            if (seenSectionKeys.has(sectionKey)) {
              continue;
            }

            const localItems = groupItems.map((item) =>
              mapActiveSnapshotItemToLocalCatalogItem(item, sourceId),
            );
            const mappedItems: HomeVodItem[] =
              contentKind === 'series'
                ? mapLocalCatalogSeriesItemsToHomeVodItems(
                    localItems,
                    groupTitle,
                    new Map(),
                    itemsPerSection,
                  )
                : mapLocalCatalogItemsToHomeVodItems(
                    localItems,
                    groupTitle,
                    new Map(),
                  );

            if (mappedItems.length > 0) {
              seenSectionKeys.add(sectionKey);
              sections.push({
                id: `home-staging-fallback-${contentKind}-${normalizedGroup}`,
                title: groupTitle,
                eyebrow: '',
                description:
                  contentKind === 'series'
                    ? 'Séries disponíveis no catálogo local autorizado.'
                    : 'Conteúdos disponíveis no catálogo local autorizado.',
                items: mappedItems,
              });
            }
          }
        }
      }
    }

    await completed;
    return filterRenderableHomeVodSections(sections);
  } finally {
    db.close();
  }
}

export async function loadLocalStagingHomeVodSections({
  sourceId: rawSourceId,
  scopeKey: rawScopeKey,
  maxSections = 6,
  itemsPerSection = 20,
  movieGroupTitles,
  seriesGroupTitles,
}: {
  sourceId: string;
  scopeKey: string;
  maxSections?: number;
  itemsPerSection?: number;
  movieGroupTitles?: readonly string[];
  seriesGroupTitles?: readonly string[];
}): Promise<HomeVodSection[]> {
  const sourceId = rawSourceId.trim();
  const scopeKey = rawScopeKey.trim();

  if (!sourceId || !scopeKey) {
    return [];
  }

  const scope = await getLocalCatalogScope(scopeKey).catch(() => null);

  if (
    !scope ||
    scope.accessStatus !== 'active' ||
    scope.sourceId !== sourceId ||
    !scope.stagingSnapshotId
  ) {
    return [];
  }

  const resolvedMovieGroupTitles =
    movieGroupTitles ??
    getCatalogCategoryDefinition('filmes')?.groupTitles ??
    [];
  const resolvedSeriesGroupTitles =
    seriesGroupTitles ??
    getCatalogCategoryDefinition('series')?.groupTitles ??
    [];

  const sections = await listStagingFirstFoldHomeVodSections({
    scopeKey,
    snapshotId: scope.stagingSnapshotId,
    sourceId,
    maxSections,
    itemsPerSection,
    movieGroupTitles: resolvedMovieGroupTitles,
    seriesGroupTitles: resolvedSeriesGroupTitles,
  });

  return filterRenderableHomeVodSections(sections);
}
