import type {
  HomeVodItem,
  HomeVodKind,
  HomeVodSection,
} from '../../catalog/services/homeVod.service';
import type {
  LocalCatalogItem,
  LocalTmdbMetadata,
} from '../types/localCatalog.types';
import { localCatalogRepository } from '../repositories/localCatalogRepository.service';
import type { CatalogRepository } from '../repositories/catalogRepository.types';
import { listLocalCatalogCategories } from '../services/localCatalogCategoryIndex.service';
import { isLocalCatalogReadable } from '../services/localCatalogReadability.service';
import { resolveLocalCatalogArtwork } from '../services/localCatalogArtwork.service';
import {
  dedupeLocalCatalogGroupTitles,
  normalizeLocalCatalogGroupIdentity,
} from '../services/localCatalogGroupIdentity.service';
import {
  getSeriesCollectionKey,
  normalizeSeriesCollectionTitle,
} from '../services/localCatalogSeriesIdentity.service';
import {
  listActiveLocalCatalogSnapshotCategories,
  listActiveLocalCatalogSnapshotItems,
} from './localCatalogActiveSnapshotReadModel.service';
import type { LocalCatalogSnapshotItem } from '../types/localCatalog.types';

function normalizeOptionalText(value?: string | null) {
  const normalizedValue = value?.trim();
  return normalizedValue || undefined;
}

function normalizeCatalogGroup(value: string) {
  return normalizeLocalCatalogGroupIdentity(value);
}

export function mapActiveSnapshotItemToLocalCatalogItem(
  item: LocalCatalogSnapshotItem,
  sourceId: string,
): LocalCatalogItem {
  return {
    id: item.itemId,
    sourceId,
    sourceType: 'm3u',
    name: item.rawName,
    rawName: item.rawName,
    normalizedName: item.normalizedName,
    groupTitle: item.rawGroupTitle,
    normalizedGroup: item.normalizedGroup,
    contentKind:
      item.contentKind === 'series_episode' ? 'series' : item.contentKind,
    streamUrl: item.streamUrl,
    tvgLogo: item.artworkUrl ?? null,
    classificationVersion: item.classificationVersion,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function listActiveSnapshotGroupItems(input: {
  scopeKey: string;
  sourceId: string;
  contentKind: 'movie' | 'series';
  normalizedGroup: string;
  limit: number;
}) {
  const primary = await listActiveLocalCatalogSnapshotItems({
    scopeKey: input.scopeKey,
    contentKind: input.contentKind,
    normalizedGroup: input.normalizedGroup,
    limit: input.limit,
  });
  const rawItems = [...(primary?.items ?? [])];

  if (input.contentKind === 'series' && rawItems.length < input.limit) {
    const episodes = await listActiveLocalCatalogSnapshotItems({
      scopeKey: input.scopeKey,
      contentKind: 'series_episode',
      normalizedGroup: input.normalizedGroup,
      limit: input.limit - rawItems.length,
    });
    rawItems.push(...(episodes?.items ?? []));
  }

  return rawItems.map((item) =>
    mapActiveSnapshotItemToLocalCatalogItem(item, input.sourceId),
  );
}

export function getSafeLocalCatalogArtworkUrl(value?: string | null) {
  const candidate = normalizeOptionalText(value);

  if (!candidate) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(candidate);

    if (
      (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return undefined;
    }

    return candidate;
  } catch {
    return undefined;
  }
}

function toHomeVodKind(item: LocalCatalogItem): HomeVodKind {
  if (item.contentKind === 'movie' || item.contentKind === 'series') {
    return item.contentKind;
  }

  return 'unknown';
}

export function mapLocalCatalogItemToHomeVodItem(
  item: LocalCatalogItem,
  groupTitleOverride?: string,
  tmdbMetadata?: LocalTmdbMetadata,
): HomeVodItem {
  const originalGroupTitle = normalizeOptionalText(item.groupTitle);
  const groupTitle =
    normalizeOptionalText(groupTitleOverride) ?? originalGroupTitle;
  const title =
    normalizeOptionalText(item.rawName) ??
    normalizeOptionalText(item.name) ??
    normalizeOptionalText(item.tvgName) ??
    item.id;
  const artwork = resolveLocalCatalogArtwork(item, tmdbMetadata);

  return {
    id: item.id,
    title,
    subtitle: groupTitle,
    overview: normalizeOptionalText(tmdbMetadata?.overview),
    posterUrl: artwork.posterUrl,
    backdropUrl: artwork.backdropUrl,
    artworkCandidates: artwork.posterCandidates,
    streamUrl: normalizeOptionalText(item.streamUrl),
    groupTitle,
    tmdbId:
      tmdbMetadata?.tmdbId !== undefined &&
      tmdbMetadata.tmdbId !== null
        ? String(tmdbMetadata.tmdbId)
        : undefined,
    tmdbTitle: normalizeOptionalText(tmdbMetadata?.title),
    kind: toHomeVodKind(item),
  };
}

export function mapLocalCatalogItemsToHomeVodItems(
  items: readonly LocalCatalogItem[],
  groupTitleOverride?: string,
  tmdbMetadataBySourceItemId: ReadonlyMap<string, LocalTmdbMetadata> =
    new Map(),
) {
  return items.map((item) =>
    mapLocalCatalogItemToHomeVodItem(
      item,
      groupTitleOverride,
      tmdbMetadataBySourceItemId.get(item.id),
    ),
  );
}

function getLocalCatalogSeriesRepresentativeScore(
  item: LocalCatalogItem,
  tmdbMetadata?: LocalTmdbMetadata | null,
): number {
  let score = 0;
  const artwork = resolveLocalCatalogArtwork(item, tmdbMetadata);

  if (artwork.posterUrl) score += 1000;
  if (artwork.backdropUrl) score += 600;
  if (tmdbMetadata?.overview || tmdbMetadata?.title) score += 300;
  if (tmdbMetadata?.tmdbId) score += 100;
  if (item.tvgLogo?.trim()) score += 50;

  return score;
}

export function mapLocalCatalogSeriesItemsToHomeVodItems(
  items: readonly LocalCatalogItem[],
  groupTitleOverride?: string,
  tmdbMetadataBySourceItemId: ReadonlyMap<string, LocalTmdbMetadata> = new Map(),
  limit: number = 20,
): HomeVodItem[] {
  const collections = new Map<string, LocalCatalogItem[]>();

  for (const item of items) {
    const key = getSeriesCollectionKey(item);
    const existing = collections.get(key);
    if (existing) {
      existing.push(item);
    } else {
      collections.set(key, [item]);
    }
  }

  const result: HomeVodItem[] = [];

  for (const [key, groupItems] of collections.entries()) {
    if (groupItems.length === 0) continue;

    let bestItem = groupItems[0];
    let bestScore = getLocalCatalogSeriesRepresentativeScore(
      bestItem,
      tmdbMetadataBySourceItemId.get(bestItem.id),
    );

    for (let index = 1; index < groupItems.length; index += 1) {
      const currentItem = groupItems[index];
      const currentScore = getLocalCatalogSeriesRepresentativeScore(
        currentItem,
        tmdbMetadataBySourceItemId.get(currentItem.id),
      );
      if (currentScore > bestScore) {
        bestItem = currentItem;
        bestScore = currentScore;
      }
    }

    let tmdb = tmdbMetadataBySourceItemId.get(bestItem.id);

    let inheritedTvgLogo = bestItem.tvgLogo;
    if (!inheritedTvgLogo?.trim()) {
      for (const item of groupItems) {
        if (item.tvgLogo?.trim()) {
          inheritedTvgLogo = item.tvgLogo;
          break;
        }
      }
    }

    if (!tmdb) {
      for (const item of groupItems) {
        const itemTmdb = tmdbMetadataBySourceItemId.get(item.id);
        if (itemTmdb?.posterPath || itemTmdb?.backdropPath || itemTmdb?.tmdbId) {
          tmdb = itemTmdb;
          break;
        }
      }
    }

    const effectiveItem: LocalCatalogItem =
      inheritedTvgLogo !== bestItem.tvgLogo
        ? { ...bestItem, tvgLogo: inheritedTvgLogo }
        : bestItem;

    const mappedItem = mapLocalCatalogItemToHomeVodItem(
      effectiveItem,
      groupTitleOverride,
      tmdb,
    );

    const cleanTitle =
      normalizeSeriesCollectionTitle(bestItem.name || bestItem.rawName) ||
      mappedItem.title;

    result.push({
      ...mappedItem,
      title: cleanTitle,
      seriesKey: key,
      isSeriesCollection: true,
      episodeCount: groupItems.length,
    });

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

async function loadBoundedTmdbMetadata(
  items: readonly LocalCatalogItem[],
  repository: CatalogRepository,
) {
  if (!repository.getTmdbMetadataBySourceItemIds || items.length === 0) {
    return new Map<string, LocalTmdbMetadata>();
  }

  return repository.getTmdbMetadataBySourceItemIds(
    items.map((item) => item.id),
  );
}

export async function loadLocalCatalogHomeVodSections(
  {
    sourceId: rawSourceId,
    scopeKey: rawScopeKey,
    maxSections = 8,
    itemsPerSection = 20,
    movieGroupTitles = [],
    seriesGroupTitles = [],
    skipTmdbMetadata = false,
    allowLegacyFallback = true,
  }: {
    sourceId: string;
    scopeKey?: string;
    maxSections?: number;
    itemsPerSection?: number;
    movieGroupTitles?: readonly string[];
    seriesGroupTitles?: readonly string[];
    skipTmdbMetadata?: boolean;
    allowLegacyFallback?: boolean;
  },
  repository: CatalogRepository = localCatalogRepository,
): Promise<HomeVodSection[]> {
  const sourceId = rawSourceId.trim();
  const scopeKey = rawScopeKey?.trim();

  if (!sourceId) {
    return [];
  }

  if (scopeKey) {
    const preferredGroups = [
      ...dedupeLocalCatalogGroupTitles(movieGroupTitles).map((title) => ({
        title,
        contentKind: 'movie' as const,
      })),
      ...dedupeLocalCatalogGroupTitles(seriesGroupTitles).map((title) => ({
        title,
        contentKind: 'series' as const,
      })),
    ].slice(0, Math.max(1, maxSections));
    const activeCategories = await listActiveLocalCatalogSnapshotCategories({
      scopeKey,
      contentKinds: ['movie', 'series', 'series_episode'],
    }).catch(() => null);

    if (activeCategories) {
      const categoryByIdentity = new Map(
        activeCategories.categories.map((category) => [
          `${category.contentKind === 'series_episode' ? 'series' : category.contentKind}:${normalizeCatalogGroup(category.normalizedTitle)}`,
          category,
        ]),
      );
      const selectedGroups = preferredGroups.length > 0
        ? preferredGroups
        : activeCategories.categories
            .map((category) => ({
              title: category.title,
              contentKind:
                category.contentKind === 'series' ||
                category.contentKind === 'series_episode'
                  ? ('series' as const)
                  : ('movie' as const),
            }))
            .slice(0, Math.max(1, maxSections));
      const activeSections = await Promise.all(
        selectedGroups.map(async ({ title, contentKind }, index) => {
          const normalizedGroup = normalizeCatalogGroup(title);
          const category = categoryByIdentity.get(
            `${contentKind}:${normalizedGroup}`,
          );
          const requestedLimit =
            contentKind === 'series'
              ? Math.max(80, itemsPerSection * 4)
              : itemsPerSection;
          const items = await listActiveSnapshotGroupItems({
            scopeKey,
            sourceId,
            contentKind,
            normalizedGroup,
            limit: requestedLimit,
          });
          const tmdbMetadata = skipTmdbMetadata
            ? new Map<string, LocalTmdbMetadata>()
            : await loadBoundedTmdbMetadata(items, repository);
          const displayTitle = category?.title ?? title;

          return {
            id: `home-active-${contentKind}-${index}`,
            title: displayTitle,
            eyebrow: '',
            description:
              contentKind === 'series'
                ? 'Séries disponíveis no catálogo local autorizado.'
                : 'Conteúdos disponíveis no catálogo local autorizado.',
            items:
              contentKind === 'series'
                ? mapLocalCatalogSeriesItemsToHomeVodItems(
                    items,
                    displayTitle,
                    tmdbMetadata,
                    itemsPerSection,
                  )
                : mapLocalCatalogItemsToHomeVodItems(
                    items,
                    displayTitle,
                    tmdbMetadata,
                  ),
          } satisfies HomeVodSection;
        }),
      );
      const renderableActiveSections = activeSections.filter(
        (section) => section.items.length > 0,
      );

      if (renderableActiveSections.length > 0) {
        return renderableActiveSections;
      }
    }

    if (!allowLegacyFallback) {
      return [];
    }
  }

  const metadata = await repository.getImportMetadata(sourceId);

  if (!isLocalCatalogReadable(metadata)) {
    return [];
  }

  async function loadPreferredSections(
    groupTitles: readonly string[],
    contentKind: 'movie' | 'series',
    limit: number,
  ) {
    const sections: HomeVodSection[] = [];
    const uniqueGroupTitles = dedupeLocalCatalogGroupTitles(groupTitles);

    await Promise.all(uniqueGroupTitles.slice(0, limit).map(async (groupTitle) => {
      const isSeries = contentKind === 'series';
      const items = await repository.listItems({
        sourceId,
        contentKind,
        normalizedGroup: normalizeCatalogGroup(groupTitle),
        limit: isSeries ? Math.max(80, itemsPerSection * 4) : itemsPerSection,
      });

      if (items.length === 0) {
        return;
      }
      const tmdbMetadata = skipTmdbMetadata
        ? new Map<string, LocalTmdbMetadata>()
        : await loadBoundedTmdbMetadata(items, repository);

      sections.push({
        id: `home-local-${contentKind}-${sections.length}`,
        title: groupTitle,
        eyebrow: '',
        description:
          contentKind === 'series'
            ? 'Séries disponíveis no catálogo local autorizado.'
            : 'Conteúdos disponíveis no catálogo local autorizado.',
        items: isSeries
          ? mapLocalCatalogSeriesItemsToHomeVodItems(
              items,
              groupTitle,
              tmdbMetadata,
              itemsPerSection,
            )
          : mapLocalCatalogItemsToHomeVodItems(
              items,
              groupTitle,
              tmdbMetadata,
            ),
      });
    }));

    return sections.sort(
      (first, second) =>
        uniqueGroupTitles.indexOf(first.title) -
        uniqueGroupTitles.indexOf(second.title),
    );
  }

  if (movieGroupTitles.length > 0 || seriesGroupTitles.length > 0) {
    const [movieSections, seriesSections] = await Promise.all([
      loadPreferredSections(movieGroupTitles, 'movie', Math.max(0, maxSections)),
      loadPreferredSections(seriesGroupTitles, 'series', Math.max(0, maxSections)),
    ]);

    return [...movieSections, ...seriesSections].slice(0, maxSections);
  }

  const [movieCategories, seriesCategories, unknownCategories] =
    await Promise.all([
      listLocalCatalogCategories(
        { sourceId, contentKind: 'movie' },
        repository,
      ),
      listLocalCatalogCategories(
        { sourceId, contentKind: 'series' },
        repository,
      ),
      listLocalCatalogCategories(
        { sourceId, contentKind: 'unknown' },
        repository,
      ),
    ]);
  const seriesSectionLimit =
    maxSections > 1 ? Math.min(seriesCategories.length, maxSections) : 0;
  const unknownSectionLimit =
    unknownCategories.length > 0 && maxSections > 2 ? 1 : 0;
  const movieSectionLimit = Math.max(
    0,
    maxSections - seriesSectionLimit - unknownSectionLimit,
  );
  const selectedMovieCategories = movieCategories.slice(
    0,
    movieSectionLimit,
  );
  const movieSections = await Promise.all(
    selectedMovieCategories.map(async (category) => {
      const items = await repository.listItems({
        sourceId,
        contentKind: 'movie',
        normalizedGroup: category.isUncategorized
          ? undefined
          : category.normalizedTitle,
        uncategorizedOnly: category.isUncategorized,
        limit: itemsPerSection,
      });
      const tmdbMetadata = skipTmdbMetadata
        ? new Map<string, LocalTmdbMetadata>()
        : await loadBoundedTmdbMetadata(items, repository);

      return {
        id: `home-local-${category.id}`,
        title: category.title,
        eyebrow: '',
        description: 'Conteúdos disponíveis no catálogo local autorizado.',
        items: mapLocalCatalogItemsToHomeVodItems(
          items,
          category.title,
          tmdbMetadata,
        ),
      } satisfies HomeVodSection;
    }),
  );
  const sections = movieSections.filter((section) => section.items.length > 0);

  const selectedSeriesCategories = seriesCategories.slice(
    0,
    seriesSectionLimit,
  );
  const seriesSections = await Promise.all(
    selectedSeriesCategories.map(async (category) => {
      const items = await repository.listItems({
        sourceId,
        contentKind: 'series',
        normalizedGroup: category.isUncategorized
          ? undefined
          : category.normalizedTitle,
        uncategorizedOnly: category.isUncategorized,
        limit: Math.max(80, itemsPerSection * 4),
      });
      const tmdbMetadata = skipTmdbMetadata
        ? new Map<string, LocalTmdbMetadata>()
        : await loadBoundedTmdbMetadata(items, repository);

      return {
        id: `home-local-series-${category.id}`,
        title: category.title,
        eyebrow: '',
        description: 'Séries disponíveis no catálogo local autorizado.',
        items: mapLocalCatalogSeriesItemsToHomeVodItems(
          items,
          category.title,
          tmdbMetadata,
          itemsPerSection,
        ),
      } satisfies HomeVodSection;
    }),
  );

  sections.push(
    ...seriesSections.filter((section) => section.items.length > 0),
  );

  if (
    unknownSectionLimit > 0 &&
    unknownCategories.length > 0 &&
    sections.length < maxSections
  ) {
    const unknownItems = await repository.listItems({
      sourceId,
      contentKind: 'unknown',
      limit: itemsPerSection,
    });

    if (unknownItems.length > 0) {
      sections.push({
        id: 'home-local-unknown',
        title: 'Não classificados',
        eyebrow: '',
        description: 'Itens preservados sem classificação conclusiva.',
        items: mapLocalCatalogItemsToHomeVodItems(
          unknownItems,
          'Não classificados',
        ),
      });
    }
  }

  return sections;
}

export async function loadLocalCatalogHomeVodCategoryItems(
  {
    sourceId: rawSourceId,
    scopeKey: rawScopeKey,
    groupTitles,
    contentKinds,
    limit = 800,
  }: {
    sourceId: string;
    scopeKey?: string;
    groupTitles: readonly string[];
    contentKinds: ReadonlyArray<'movie' | 'series'>;
    limit?: number;
  },
  repository: CatalogRepository = localCatalogRepository,
): Promise<HomeVodItem[]> {
  const sourceId = rawSourceId.trim();
  const scopeKey = rawScopeKey?.trim();
  const normalizedGroupTitles = dedupeLocalCatalogGroupTitles(groupTitles);

  if (
    !sourceId ||
    normalizedGroupTitles.length === 0 ||
    contentKinds.length === 0 ||
    limit <= 0
  ) {
    return [];
  }

  if (scopeKey) {
    const perGroupLimit = Math.max(
      1,
      Math.ceil(limit / (normalizedGroupTitles.length * contentKinds.length)),
    );
    const activeGroups = await Promise.all(
      contentKinds.flatMap((contentKind) =>
        normalizedGroupTitles.map(async (groupTitle) => {
          const items = await listActiveSnapshotGroupItems({
            scopeKey,
            sourceId,
            contentKind,
            normalizedGroup: normalizeCatalogGroup(groupTitle),
            limit:
              contentKind === 'series'
                ? Math.max(120, perGroupLimit * 4)
                : perGroupLimit,
          });
          const tmdbMetadata = await loadBoundedTmdbMetadata(items, repository);

          return contentKind === 'series'
            ? mapLocalCatalogSeriesItemsToHomeVodItems(
                items,
                groupTitle,
                tmdbMetadata,
                perGroupLimit,
              )
            : mapLocalCatalogItemsToHomeVodItems(
                items,
                groupTitle,
                tmdbMetadata,
              );
        }),
      ),
    );
    const activeItems = new Map<string, HomeVodItem>();

    for (const item of activeGroups.flat()) {
      if (!activeItems.has(item.id)) {
        activeItems.set(item.id, item);
      }
    }

    if (activeItems.size > 0) {
      return Array.from(activeItems.values())
        .sort((first, second) =>
          first.title.localeCompare(second.title, 'pt-BR', {
            sensitivity: 'base',
          }),
        )
        .slice(0, limit);
    }
  }

  const metadata = await repository.getImportMetadata(sourceId);

  if (!isLocalCatalogReadable(metadata)) {
    return [];
  }

  const perGroupLimit = Math.max(
    1,
    Math.ceil(limit / (normalizedGroupTitles.length * contentKinds.length)),
  );
  const groupedItems = await Promise.all(
    contentKinds.flatMap((contentKind) =>
      normalizedGroupTitles.map(async (groupTitle) => {
        const isSeries = contentKind === 'series';
        const items = await repository.listItems({
          sourceId,
          contentKind,
          normalizedGroup: normalizeCatalogGroup(groupTitle),
          limit: isSeries ? Math.max(120, perGroupLimit * 4) : perGroupLimit,
        });
        const tmdbMetadata = await loadBoundedTmdbMetadata(
          items,
          repository,
        );

        return isSeries
          ? mapLocalCatalogSeriesItemsToHomeVodItems(
              items,
              groupTitle,
              tmdbMetadata,
              perGroupLimit,
            )
          : mapLocalCatalogItemsToHomeVodItems(
              items,
              groupTitle,
              tmdbMetadata,
            );
      }),
    ),
  );
  const uniqueItems = new Map<string, HomeVodItem>();

  for (const item of groupedItems.flat()) {
    if (!uniqueItems.has(item.id)) {
      uniqueItems.set(item.id, item);
    }
  }

  return Array.from(uniqueItems.values())
    .sort((first, second) =>
      first.title.localeCompare(second.title, 'pt-BR', {
        sensitivity: 'base',
      }),
    )
    .slice(0, limit);
}
