import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/providers/AuthProvider';
import { AppShell } from '../../../components/layout/AppShell';
import { MediaCard } from '../../../components/media/MediaCard';
import { FOCUS_KEYS } from '@/lib/spatial/focusKeys';
import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';

import {
  getCatalogCategoryDefinition,
  type CatalogCategoryDefinition,
} from '../services/catalogCategoryGroups.service';
import {
  getCachedHomeVodCategoryItems,
  getCachedHomeVodSections,
  loadHomeVodCategoryItems,
  loadHomeVodSections,
  type HomeVodItem,
} from '../services/homeVod.service';
import {
  readCachedSeriesEpisodes,
  storeCachedSeriesEpisodes,
} from '../services/seriesEpisodesCache.service';
import {
  hasEpisodePlaybackProgress,
  type EpisodePlaybackProgressStatus,
} from '../services/episodePlaybackProgress.service';

const GRID_COLUMNS = 5;
const INITIAL_VISIBLE_ITEMS = 60;
const VISIBLE_ITEMS_INCREMENT = 40;
const CATEGORY_ITEM_LIMIT = 800;
const BOOTSTRAP_CATEGORY_ITEM_LIMIT = INITIAL_VISIBLE_ITEMS;
const CATEGORY_ITEM_FOCUS_PREFIX = 'category-grid-item';
const SERIES_DETAIL_HERO_FOCUS_KEY = 'series-detail-hero';
const SIMILAR_ITEM_FOCUS_PREFIX = 'series-similar-item';

type CatalogCategoryPageProps = {
  groupSlugOverride?: string;
};

function getCategoryItemFocusKey(categorySlug: string, index: number) {
  return `${CATEGORY_ITEM_FOCUS_PREFIX}-${categorySlug}-${index}`;
}

function getSimilarItemFocusKey(categorySlug: string, index: number) {
  return `${SIMILAR_ITEM_FOCUS_PREFIX}-${categorySlug}-${index}`;
}

function readInitialCategoryItems(
  category: { groupTitles: string[] } | null,
  seriesTmdbId: string | null,
  seriesTmdbTitle: string | null,
) {
  if (!category) {
    return [];
  }

  const storedActivation = getStoredLicenseActivation();
  const licenseCode = storedActivation?.licenseCode?.trim();

  if (!licenseCode) {
    return [];
  }

  const deviceIdentifier =
    storedActivation?.deviceIdentifier || getOrCreateDeviceIdentifier();

  const matchesSeries = (item: HomeVodItem) => {
    if (!seriesTmdbId && !seriesTmdbTitle) {
      return true;
    }

    if (seriesTmdbId && item.tmdbId && String(item.tmdbId) === seriesTmdbId) {
      return true;
    }

    if (
      seriesTmdbTitle &&
      item.tmdbTitle &&
      item.tmdbTitle.trim().toLowerCase() ===
        seriesTmdbTitle.trim().toLowerCase()
    ) {
      return true;
    }

    return false;
  };

  const specificCachedEpisodes = readCachedSeriesEpisodes({
    licenseCode,
    deviceIdentifier,
    groupTitles: category.groupTitles,
    tmdbId: seriesTmdbId,
    tmdbTitle: seriesTmdbTitle,
  });

  if (specificCachedEpisodes.length > 0) {
    return specificCachedEpisodes;
  }

  const cachedItems = getCachedHomeVodCategoryItems({
    licenseCode,
    deviceIdentifier,
    groupTitles: category.groupTitles,
    limit: BOOTSTRAP_CATEGORY_ITEM_LIMIT,
  });

  const filteredCategoryItems = (cachedItems ?? []).filter(matchesSeries);

  if (filteredCategoryItems.length > 0) {
    return filteredCategoryItems;
  }

  const cachedSections = getCachedHomeVodSections({
    licenseCode,
    deviceIdentifier,
  });

  const sectionItems = (cachedSections ?? [])
    .flatMap((section) => section.items)
    .filter((item) => {
      if (item.kind && item.kind !== 'series') {
        return false;
      }

      return matchesSeries(item);
    });

  return sectionItems;
}

function resolveVisibleCount(totalItems: number) {
  return Math.min(totalItems, INITIAL_VISIBLE_ITEMS);
}

function getSeriesCollectionKey(item: HomeVodItem) {
  return (
    item.seriesKey ||
    item.tmdbId ||
    item.tmdbTitle ||
    item.groupTitle ||
    item.title
  )
    .trim()
    .toLowerCase();
}

function dedupeSeriesCollections(items: HomeVodItem[]) {
  const byCollection = new Map<string, HomeVodItem>();

  for (const item of items) {
    const key = getSeriesCollectionKey(item);

    if (!key || byCollection.has(key)) {
      continue;
    }

    byCollection.set(key, {
      ...item,
      kind: 'series',
      isSeriesCollection: true,
    });
  }

  return Array.from(byCollection.values());
}

function getSeriesHeroItem(items: HomeVodItem[]) {
  return (
    items.find((item) => item.backdropUrl || item.posterUrl) ??
    items[0] ??
    null
  );
}

function SeriesCategoryHero({
  item,
  totalItems,
}: {
  item: HomeVodItem | null;
  totalItems: number;
}) {
  const backgroundUrl = item?.backdropUrl || item?.posterUrl || null;

  return (
    <section className="relative mb-7 min-h-[21rem] overflow-hidden rounded-[1rem] border border-white/10 bg-zinc-950 px-7 py-7 shadow-2xl">
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt={item?.title ?? 'Séries'}
          className="absolute inset-0 size-full object-cover opacity-35"
        />
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />

      <div className="relative z-10 flex min-h-[17rem] max-w-3xl flex-col justify-end">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.34em] text-xf-red">
          Catálogo
        </p>
        <h1 className="text-5xl font-black leading-none text-white drop-shadow-lg md:text-6xl">
          Séries
        </h1>
        <p className="mt-4 max-w-2xl text-lg font-semibold leading-snug text-zinc-200">
          Séries, novelas, doramas e temporadas liberadas para esta licença.
        </p>

        {item ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-[0.16em] text-zinc-300">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
              Destaque
            </span>
            <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1">
              {item.title}
            </span>
            <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1">
              {totalItems} títulos
            </span>
          </div>
        ) : (
          <div className="mt-5 inline-flex w-fit rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-zinc-300">
            Carregando séries...
          </div>
        )}
      </div>
    </section>
  );
}

function formatHeroRating(value?: string) {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return numericValue.toFixed(1);
}

const EPISODE_WINDOW_SIZE = 12;

function getEpisodeWindowStart(activeIndex: number, total: number) {
  if (total <= EPISODE_WINDOW_SIZE) {
    return 0;
  }

  const halfWindow = Math.floor(EPISODE_WINDOW_SIZE / 2);
  const desiredStart = Math.max(0, activeIndex - halfWindow);

  return Math.min(desiredStart, total - EPISODE_WINDOW_SIZE);
}






type SeriesDetailHeroFrameProps = {
  disabled: boolean;
  children: ReactNode;
  onEnterPress: () => void;
  onArrowPress: (direction: string) => boolean;
};

function SeriesDetailHeroFrame({
  disabled,
  children,
  onEnterPress,
  onArrowPress,
}: SeriesDetailHeroFrameProps) {
  const { ref, focused } = useFocusable({
    focusKey: SERIES_DETAIL_HERO_FOCUS_KEY,
    onEnterPress,
    onArrowPress,
    focusable: !disabled,
  });

  useEffect(() => {
    if (focused && ref.current instanceof HTMLElement) {
      ref.current.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [focused, ref]);

  return (
    <section
      ref={ref}
      role="button"
      tabIndex={-1}
      className={
        'relative mb-5 overflow-hidden rounded-[0.9rem] border bg-zinc-950 px-4 py-4 shadow-2xl outline-none transition md:px-5 md:py-4 ' +
        (focused
          ? 'border-xf-red shadow-[0_0_0_0.18rem_rgba(229,9,20,0.30)]'
          : 'border-white/10')
      }
    >
      {children}
    </section>
  );
}

type SimilarSeriesCardProps = {
  item: HomeVodItem;
  focusKey: string;
  onEnterPress: () => void;
  onArrowPress: (direction: string) => boolean;
};

function SimilarSeriesCard({
  item,
  focusKey,
  onEnterPress,
  onArrowPress,
}: SimilarSeriesCardProps) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress,
    onArrowPress,
  });

  useEffect(() => {
    if (focused && ref.current instanceof HTMLElement) {
      ref.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [focused, ref]);

  return (
    <button
      ref={ref}
      type="button"
      className={
        'block w-full overflow-hidden rounded-[0.48rem] border bg-white/[0.035] text-left transition ' +
        (focused
          ? 'border-xf-red shadow-[0_0_0_0.16rem_rgba(229,9,20,0.32)]'
          : 'border-white/10')
      }
      onClick={onEnterPress}
    >
      {item.posterUrl ? (
        <img
          src={item.posterUrl}
          alt={item.title}
          className="aspect-[2/3] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="aspect-[2/3] bg-zinc-900" />
      )}
    </button>
  );
}

type EpisodePlaybackStatus = EpisodePlaybackProgressStatus;

type EpisodeListRowProps = {
  index: number;
  title: string;
  playbackStatus?: EpisodePlaybackStatus;
  focusKey: string;
  onEnterPress: () => void;
  onArrowPress: (direction: string) => boolean;
};

function getEpisodePlaybackStatusLabel(status: EpisodePlaybackStatus) {
  if (status === 'played') {
    return 'Reproduzido anteriormente';
  }

  return 'Não iniciado';
}

function EpisodeListRow({
  index,
  title,
  playbackStatus = 'not-started',
  focusKey,
  onEnterPress,
  onArrowPress,
}: EpisodeListRowProps) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress,
    onArrowPress,
  });

  useEffect(() => {
    if (focused && ref.current instanceof HTMLElement) {
      ref.current.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [focused, ref]);

  const statusLabel = getEpisodePlaybackStatusLabel(playbackStatus);

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={-1}
      className={
        'grid grid-cols-[3.6rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[0.55rem] border px-3 py-2.5 transition ' +
        (focused
          ? 'border-xf-red bg-xf-red/15 shadow-[0_0_0_0.18rem_rgba(229,9,20,0.28)]'
          : 'border-white/10 bg-white/[0.035]')
      }
    >
      <div className="flex h-9 w-12 items-center justify-center rounded-[0.4rem] border border-white/10 bg-black/35 text-[0.68rem] font-black text-white">
        {String(index + 1).padStart(2, '0')}
      </div>

      <h3 className="min-w-0 line-clamp-1 text-sm font-black leading-tight text-white md:text-base">
        {title}
      </h3>

      <p className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[0.55rem] font-black uppercase tracking-[0.12em] text-zinc-300">
        {statusLabel}
      </p>
    </div>
  );
}

export function CatalogCategoryPage({
  groupSlugOverride,
}: CatalogCategoryPageProps = {}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const seriesGroupTitle = searchParams.get('groupTitle')?.trim() || null;
  const seriesTitle = searchParams.get('title')?.trim() || null;
  const seriesTmdbId = searchParams.get('tmdbId')?.trim() || null;
  const seriesTmdbTitle = searchParams.get('tmdbTitle')?.trim() || null;
  const isSeriesDetailPage = Boolean(
    seriesGroupTitle &&
      ((groupSlugOverride ?? params.groupSlug) === 'series-detail' ||
        seriesTmdbId ||
        seriesTmdbTitle),
  );

  const category = useMemo<CatalogCategoryDefinition | null>(() => {
    const definition = getCatalogCategoryDefinition(
      groupSlugOverride ?? params.groupSlug,
    );

    if (definition) {
      return definition;
    }

    if (!seriesGroupTitle) {
      return null;
    }

    return {
      slug: groupSlugOverride ?? params.groupSlug ?? 'series-detail',
      title: seriesTitle ?? seriesGroupTitle,
      description: 'Episodios disponiveis desta serie/novela.',
      groupTitles: [seriesGroupTitle],
      path: '/category/series-detail',
    } as CatalogCategoryDefinition;
  }, [groupSlugOverride, params.groupSlug, seriesGroupTitle, seriesTitle]);
  const initialItems = useMemo(
    () => readInitialCategoryItems(category, seriesTmdbId, seriesTmdbTitle),
    [category, seriesTmdbId, seriesTmdbTitle],
  );

  const [items, setItems] = useState<HomeVodItem[]>(initialItems);
  const [visibleItemCount, setVisibleItemCount] = useState(
    resolveVisibleCount(initialItems.length),
  );
  const [episodeFocusIndex, setEpisodeFocusIndex] = useState(0);
  const [similarItems, setSimilarItems] = useState<HomeVodItem[]>([]);
  const [isLoading, setIsLoading] = useState(initialItems.length === 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentSeriesIdentity = useMemo(
    () =>
      [
        seriesGroupTitle ?? '',
        seriesTmdbId ?? '',
        seriesTmdbTitle ?? '',
        seriesTitle ?? '',
      ].join('::'),
    [seriesGroupTitle, seriesTmdbId, seriesTmdbTitle, seriesTitle],
  );

  function pickSimilarCollectionsFromSections(
    sections: { items: HomeVodItem[] }[],
    currentHeroItem: HomeVodItem | null,
  ) {
    if (!currentHeroItem) {
      return [];
    }

    const heroKey =
      currentHeroItem.tmdbId ||
      currentHeroItem.tmdbTitle ||
      currentHeroItem.title;

    const byCollection = new Map<string, HomeVodItem>();

    for (const section of sections) {
      for (const item of section.items) {
        if (!item.posterUrl) {
          continue;
        }

        const key = item.tmdbId || item.tmdbTitle || item.title;

        if (!key || key === heroKey || byCollection.has(key)) {
          continue;
        }

        if (item.kind && item.kind !== 'series') {
          continue;
        }

        byCollection.set(key, item);
      }
    }

    return Array.from(byCollection.values()).slice(0, 8);
  }

  function filterSeriesEpisodes(nextItems: HomeVodItem[]) {
    if (!seriesTmdbId && !seriesTmdbTitle) {
      return nextItems;
    }

    return nextItems.filter((item) => {
      if (seriesTmdbId && item.tmdbId && String(item.tmdbId) === seriesTmdbId) {
        return true;
      }

      if (
        seriesTmdbTitle &&
        item.tmdbTitle &&
        item.tmdbTitle.trim().toLowerCase() ===
          seriesTmdbTitle.trim().toLowerCase()
      ) {
        return true;
      }

      return false;
    });
  }

  useEffect(() => {
    let isMounted = true;

    async function loadCategoryItems() {
      setIsLoading(items.length === 0);
      setErrorMessage(null);

      if (!category) {
        setErrorMessage('Categoria nao encontrada.');
        setIsLoading(false);
        return;
      }

      try {
        const storedActivation = getStoredLicenseActivation();
        const licenseCode = storedActivation?.licenseCode?.trim();

        if (!licenseCode) {
          setItems([]);
          return;
        }

        const deviceIdentifier =
          storedActivation?.deviceIdentifier || getOrCreateDeviceIdentifier();

        const cachedItems = getCachedHomeVodCategoryItems({
          licenseCode,
          deviceIdentifier,
          groupTitles: category.groupTitles,
          limit: BOOTSTRAP_CATEGORY_ITEM_LIMIT,
        });

        if (cachedItems?.length) {
          const filteredCachedItems = filterSeriesEpisodes(cachedItems);
          const nextCachedItems =
            category.slug === 'series'
              ? dedupeSeriesCollections(filteredCachedItems)
              : filteredCachedItems;

          setItems(nextCachedItems);
          setVisibleItemCount(resolveVisibleCount(nextCachedItems.length));
          setIsLoading(nextCachedItems.length === 0);
        } else if (items.length === 0) {
          setItems([]);
          setVisibleItemCount(0);
        }

        const nextItems = await loadHomeVodCategoryItems({
          licenseCode,
          deviceIdentifier,
          groupTitles: category.groupTitles,
          limit: CATEGORY_ITEM_LIMIT,
        });

        if (!isMounted) {
          return;
        }

        const filteredNextItems = filterSeriesEpisodes(nextItems);

        const nextCategoryItems =
          category.slug === 'series'
            ? dedupeSeriesCollections(filteredNextItems)
            : filteredNextItems;

        if (isSeriesDetailPage) {
          storeCachedSeriesEpisodes(
            {
              licenseCode,
              deviceIdentifier,
              groupTitles: category.groupTitles,
              tmdbId: seriesTmdbId,
              tmdbTitle: seriesTmdbTitle,
            },
            filteredNextItems,
          );
        }

        setItems((currentItems) => {
          if (nextCategoryItems.length === 0 && currentItems.length > 0) {
            return currentItems;
          }

          return nextCategoryItems;
        });
        setVisibleItemCount((currentCount) => {
          if (nextCategoryItems.length === 0 && items.length > 0) {
            return currentCount;
          }

          return resolveVisibleCount(nextCategoryItems.length);
        });
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Nao foi possivel carregar esta categoria.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCategoryItems();

    return () => {
      isMounted = false;
    };
  }, [category, items.length, seriesTmdbId, seriesTmdbTitle]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleItemCount),
    [items, visibleItemCount],
  );

  const heroItem = isSeriesDetailPage ? items[0] ?? visibleItems[0] : null;

  useEffect(() => {
    if (!isSeriesDetailPage) {
      return;
    }

    void loadSimilarCollections(heroItem);
  }, [heroItem, isSeriesDetailPage]);

  const episodeWindowStart = isSeriesDetailPage
    ? getEpisodeWindowStart(episodeFocusIndex, items.length)
    : 0;

  const episodeWindowItems = isSeriesDetailPage
    ? items.slice(episodeWindowStart, episodeWindowStart + EPISODE_WINDOW_SIZE)
    : visibleItems;

  const isSeriesCategoryPage = !isSeriesDetailPage && category?.slug === 'series';
  const seriesHeroItem = isSeriesCategoryPage ? getSeriesHeroItem(items) : null;




  useEffect(() => {
    if (!category || visibleItems.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (isSeriesDetailPage) {
        setFocus(SERIES_DETAIL_HERO_FOCUS_KEY);
        return;
      }

      setFocus(getCategoryItemFocusKey(category.slug, 0));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [category, currentSeriesIdentity, isSeriesDetailPage, visibleItems.length]);

  useEffect(() => {
    function goBackToHome() {
      const navigationState = location.state as
        | { fromSeriesDetail?: boolean; returnTo?: string }
        | null;

      if (
        isSeriesDetailPage &&
        navigationState?.fromSeriesDetail &&
        navigationState.returnTo
      ) {
        navigate(navigationState.returnTo, { replace: true });
        return;
      }

      if (isSeriesDetailPage && window.history.length > 1) {
        navigate(-1);
        return;
      }

      navigate('/');
    }

    function handleBackNavigation(event: KeyboardEvent) {
      if (
        event.key !== 'Backspace' &&
        event.key !== 'Escape' &&
        event.key !== 'BrowserBack'
      ) {
        return;
      }

      event.preventDefault();
      goBackToHome();
    }

    window.addEventListener('keydown', handleBackNavigation);

    const capacitorBackButtonListener = CapacitorApp.addListener(
      'backButton',
      () => {
        goBackToHome();
      },
    );

    return () => {
      window.removeEventListener('keydown', handleBackNavigation);
      void capacitorBackButtonListener.then((listener) => listener.remove());
    };
  }, [navigate]);

  function resolveEpisodeTitle(item: HomeVodItem, index: number) {
    return item.episodeTitle || item.title || `Episodio ${index + 1}`;
  }

  function resolveEpisodePlaybackStatus(
    item: HomeVodItem,
    index: number,
  ): EpisodePlaybackStatus {
    const episodeTitle = resolveEpisodeTitle(item, index);

    return hasEpisodePlaybackProgress({
      episodeId: item.id,
      streamUrl: item.streamUrl,
      title: episodeTitle,
      seriesTitle,
      seriesGroupTitle,
      seriesTmdbId,
      seriesTmdbTitle,
      episodeIndex: index,
    })
      ? 'played'
      : 'not-started';
  }

  async function loadSimilarCollections(currentHeroItem: HomeVodItem | null) {
    if (!currentHeroItem) {
      setSimilarItems([]);
      return;
    }

    try {
      const activation = getStoredLicenseActivation();
      const deviceIdentifier = getOrCreateDeviceIdentifier();

      if (!activation?.licenseCode || !deviceIdentifier) {
        setSimilarItems([]);
        return;
      }

      const input = {
        licenseCode: activation.licenseCode,
        deviceIdentifier,
      };

      const cachedSections = getCachedHomeVodSections(input) ?? [];
      const cachedSimilarItems = pickSimilarCollectionsFromSections(
        cachedSections,
        currentHeroItem,
      );

      if (cachedSimilarItems.length > 0) {
        setSimilarItems(cachedSimilarItems);
      }

      const loadedSections = await loadHomeVodSections(input);
      const loadedSimilarItems = pickSimilarCollectionsFromSections(
        loadedSections,
        currentHeroItem,
      );

      setSimilarItems(loadedSimilarItems);
    } catch (error) {
      console.warn('[XANDEFLIX_SERIES_SIMILAR_ERROR]', error);
      setSimilarItems([]);
    }
  }

  function openSimilarItem(item: HomeVodItem) {
    if (!item.groupTitle) {
      return;
    }

    const params = new URLSearchParams({
      groupTitle: item.groupTitle,
      title: item.tmdbTitle ?? item.title,
    });

    if (item.tmdbId) {
      params.set('tmdbId', item.tmdbId);
    }

    if (item.tmdbTitle) {
      params.set('tmdbTitle', item.tmdbTitle);
    }

    navigate(`/category/series-detail?${params.toString()}`, {
      state: {
        fromSeriesDetail: true,
        returnTo: `${location.pathname}${location.search}`,
      },
    });
  }

  function handleSimilarCardArrowPress(direction: string, index: number) {
    if (!category) {
      return false;
    }

    const similarColumns = 3;
    const isFirstColumn = index % similarColumns === 0;
    const isLastColumn = index % similarColumns === similarColumns - 1;
    const lastIndex = similarItems.length - 1;

    if (direction === 'left') {
      if (!isFirstColumn) {
        setFocus(getSimilarItemFocusKey(category.slug, index - 1));
        return false;
      }

      const previousRowLastIndex = index - 1;

      if (previousRowLastIndex >= 0) {
        setFocus(getSimilarItemFocusKey(category.slug, previousRowLastIndex));
        return false;
      }

      const safeEpisodeIndex = Math.min(
        Math.max(episodeFocusIndex, episodeWindowStart),
        Math.max(
          episodeWindowStart,
          episodeWindowStart + episodeWindowItems.length - 1,
        ),
      );

      setEpisodeFocusIndex(safeEpisodeIndex);
      setFocus(getCategoryItemFocusKey(category.slug, safeEpisodeIndex));
      return false;
    }

    if (direction === 'right') {
      if (!isLastColumn) {
        const nextIndex = Math.min(index + 1, lastIndex);

        if (nextIndex !== index) {
          setFocus(getSimilarItemFocusKey(category.slug, nextIndex));
        }

        return false;
      }

      const nextRowFirstIndex = index + 1;

      if (nextRowFirstIndex <= lastIndex) {
        setFocus(getSimilarItemFocusKey(category.slug, nextRowFirstIndex));
      }

      return false;
    }

    if (direction === 'up') {
      const previousRowIndex = index - similarColumns;

      if (previousRowIndex >= 0) {
        setFocus(getSimilarItemFocusKey(category.slug, previousRowIndex));
        return false;
      }

      setFocus(SERIES_DETAIL_HERO_FOCUS_KEY);
      return false;
    }

    if (direction === 'down') {
      const nextRowIndex = index + similarColumns;

      if (nextRowIndex <= lastIndex) {
        setFocus(getSimilarItemFocusKey(category.slug, nextRowIndex));
      }

      return false;
    }

    return false;
  }

  function openEpisode(item: HomeVodItem, index: number) {
    spatialDebug('catalog-grid', 'Abrir episodio:', item.title);

    if (!item.streamUrl) {
      return;
    }

    const episodeTitle = resolveEpisodeTitle(item, index);

    const params = new URLSearchParams({
      src: item.streamUrl,
      title: episodeTitle,
      episodeId: item.id,
      episodeIndex: String(index),
    });

    if (seriesTitle) {
      params.set('seriesTitle', seriesTitle);
    }

    if (seriesGroupTitle) {
      params.set('seriesGroupTitle', seriesGroupTitle);
    }

    if (seriesTmdbId) {
      params.set('seriesTmdbId', seriesTmdbId);
    }

    if (seriesTmdbTitle) {
      params.set('seriesTmdbTitle', seriesTmdbTitle);
    }

    navigate(`/player?${params.toString()}`);
  }

  function handleSeriesHeroArrowPress(direction: string) {
    if (!category) {
      return false;
    }

    if (direction === 'down' && items.length > 0) {
      setEpisodeFocusIndex(0);
      setFocus(getCategoryItemFocusKey(category.slug, 0));
      return false;
    }

    if (direction === 'left') {
      setFocus(FOCUS_KEYS.SIDEBAR_HOME);
      return false;
    }

    return false;
  }

  function revealMoreItems(targetIndex: number) {
    if (!category || targetIndex >= items.length) {
      return false;
    }

    if (targetIndex >= visibleItemCount) {
      setVisibleItemCount((currentCount) =>
        Math.min(
          items.length,
          Math.max(targetIndex + 1, currentCount + VISIBLE_ITEMS_INCREMENT),
        ),
      );
    }

    window.setTimeout(() => {
      setFocus(getCategoryItemFocusKey(category.slug, targetIndex));
    }, 0);

    return false;
  }

  function handleCategoryCardArrowPress(direction: string, index: number) {
    if (!category) {
      return false;
    }

    if (isSeriesDetailPage) {
      if (direction === 'left') {
        setFocus(FOCUS_KEYS.SIDEBAR_HOME);
        return false;
      }

      if (direction === 'up') {
        if (index === 0) {
          setEpisodeFocusIndex(0);
          setFocus(SERIES_DETAIL_HERO_FOCUS_KEY);
          return false;
        }

        const previousIndex = index - 1;
        setEpisodeFocusIndex(previousIndex);
        setFocus(getCategoryItemFocusKey(category.slug, previousIndex));
        return false;
      }

      if (direction === 'right' && similarItems.length > 0) {
        setFocus(getSimilarItemFocusKey(category.slug, 0));
        return false;
      }

      if (direction === 'down') {
        const nextIndex = index + 1;

        if (nextIndex >= items.length) {
          return false;
        }

        setEpisodeFocusIndex(nextIndex);
        setFocus(getCategoryItemFocusKey(category.slug, nextIndex));
        return false;
      }

      return false;
    }

    const isFirstColumn = index % GRID_COLUMNS === 0;
    const isLastColumn = index % GRID_COLUMNS === GRID_COLUMNS - 1;
    const previousRowIndex = index - GRID_COLUMNS;
    const nextRowIndex = index + GRID_COLUMNS;

    if (direction === 'left') {
      if (isFirstColumn) {
        setFocus(FOCUS_KEYS.SIDEBAR_HOME);
        return false;
      }

      setFocus(getCategoryItemFocusKey(category.slug, index - 1));
      return false;
    }

    if (direction === 'right') {
      const nextIndex = index + 1;

      if (isLastColumn || nextIndex >= items.length) {
        return false;
      }

      return revealMoreItems(nextIndex);
    }

    if (direction === 'up') {
      if (previousRowIndex < 0) {
        return false;
      }

      setFocus(getCategoryItemFocusKey(category.slug, previousRowIndex));
      return false;
    }

    if (direction === 'down') {
      if (nextRowIndex >= items.length) {
        return false;
      }

      return revealMoreItems(nextRowIndex);
    }

    return false;
  }

  return (
    <AppShell
      onSignOut={() => void signOut()}
      mainClassName="xf-tv-safe-main px-3 pb-24 md:px-7 md:pb-9 lg:px-8 xl:px-10"
    >
      <main className="mx-auto w-full max-w-[1920px]">
        {isSeriesDetailPage && heroItem ? (
          <SeriesDetailHeroFrame
            disabled={items.length === 0}
            onEnterPress={() => {
              if (items[0]) {
                openEpisode(items[0], 0);
              }
            }}
            onArrowPress={handleSeriesHeroArrowPress}
          >
            <div
              className="absolute inset-0 bg-cover bg-center opacity-35 blur-[1px]"
              style={{
                backgroundImage: heroItem.backdropUrl || heroItem.posterUrl
                  ? `linear-gradient(90deg, rgba(0,0,0,0.92), rgba(0,0,0,0.62), rgba(0,0,0,0.88)), url(${heroItem.backdropUrl ?? heroItem.posterUrl})`
                  : undefined,
              }}
            />
            <div className="relative grid gap-4 md:grid-cols-[9.5rem_1fr] md:items-center">
              <div className="overflow-hidden rounded-[0.65rem] border border-white/10 bg-white/5 shadow-xl">
                {heroItem.posterUrl ? (
                  <img
                    src={heroItem.posterUrl}
                    alt={category?.title ?? heroItem.title}
                    className="aspect-[2/3] h-full w-full object-cover"
                    loading="eager"
                  />
                ) : (
                  <div className="aspect-[2/3] bg-zinc-900" />
                )}
              </div>

              <div className="max-w-4xl pb-1">
                <p className="text-[0.58rem] font-black uppercase tracking-[0.28em] text-xf-red">
                  Serie / Novela
                </p>
                <h1 className="mt-1 text-[1.25rem] font-black tracking-[-0.04em] text-white md:text-[1.65rem]">
                  {category?.title ?? heroItem.title}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.68rem] font-bold text-zinc-200">
                  {heroItem.tmdbReleaseYear ? (
                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1">
                      {heroItem.tmdbReleaseYear}
                    </span>
                  ) : null}

                  {heroItem.tmdbRating ? (
                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1">
                      Nota {formatHeroRating(heroItem.tmdbRating)}
                    </span>
                  ) : null}

                  {heroItem.tmdbGenres ? (
                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1">
                      {heroItem.tmdbGenres}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 max-w-3xl line-clamp-3 text-[0.78rem] font-semibold leading-relaxed text-zinc-200 md:text-sm">
                  {heroItem.overview ??
                    category?.description ??
                    'Episodios disponiveis para esta serie/novela.'}
                </p>

                <div className="mt-3 rounded-[0.6rem] border border-white/10 bg-black/25 px-3 py-2">
                  <p className="text-[0.58rem] font-black uppercase tracking-[0.22em] text-xf-red">
                    Elenco
                  </p>
                  <p className="mt-1 line-clamp-1 text-[0.72rem] font-semibold text-zinc-200">
                    Informacao de elenco indisponivel nesta fonte.
                  </p>
                </div>
              </div>
            </div>
          </SeriesDetailHeroFrame>
        ) : (
          <>
            {isSeriesCategoryPage ? (
              <SeriesCategoryHero
                item={seriesHeroItem}
                totalItems={items.length}
              />
            ) : (
              <header className="mb-6">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.32em] text-xf-red">
                  Catalogo
                </p>
                <h1 className="mt-2 text-[1.7rem] font-black tracking-[-0.03em] text-white md:text-[2.35rem]">
                  {category?.title ?? 'Categoria'}
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-semibold text-zinc-300">
                  {category?.description ??
                    'Categoria indisponivel neste momento.'}
                </p>
              </header>
            )}
          </>
        )}

        {isLoading && visibleItems.length === 0 ? (
          <section className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-zinc-300">
              Carregando categoria...
            </p>
          </section>
        ) : errorMessage ? (
          <section className="rounded-[0.18rem] border border-red-500/30 bg-red-500/10 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-red-100">{errorMessage}</p>
          </section>
        ) : visibleItems.length === 0 ? (
          <section className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-zinc-300">
              Nenhum conteudo encontrado nesta categoria.
            </p>
          </section>
        ) : (
          isSeriesDetailPage ? (
            <section className="flex w-full flex-nowrap items-start gap-4 pb-12">
              <div className="min-w-0">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <h2 className="text-lg font-black tracking-[-0.03em] text-white">
                    Episodios
                    <span className="ml-2 text-sm font-bold text-zinc-400">
                      {items.length}
                    </span>
                  </h2>

                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                    {items.length > 0
                      ? `${episodeWindowStart + 1}-${Math.min(
                          episodeWindowStart + EPISODE_WINDOW_SIZE,
                          items.length,
                        )} de ${items.length}`
                      : '0 de 0'}
                  </p>
                </div>

                <div className="h-[58vh] overflow-hidden rounded-[0.75rem] border border-white/5 bg-black/10 p-2">
                  <div className="space-y-2">
                    {episodeWindowItems.map((item, windowIndex) => {
                      const absoluteIndex = episodeWindowStart + windowIndex;

                      return (
                        <EpisodeListRow
                          key={item.id}
                          index={absoluteIndex}
                          title={resolveEpisodeTitle(item, absoluteIndex)}
                          playbackStatus={resolveEpisodePlaybackStatus(
                            item,
                            absoluteIndex,
                          )}
                          focusKey={getCategoryItemFocusKey(
                            category?.slug ?? 'category',
                            absoluteIndex,
                          )}
                          onEnterPress={() => openEpisode(item, absoluteIndex)}
                          onArrowPress={(direction: string) =>
                            handleCategoryCardArrowPress(
                              direction,
                              absoluteIndex,
                            )
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <aside className="w-[24rem] shrink-0 self-start">
                <h2 className="mb-4 text-lg font-black tracking-[-0.03em] text-white">
                  Semelhantes
                </h2>

                {similarItems.length > 0 ? (
                  <div className="grid w-full grid-cols-3 gap-2">
                    {similarItems.map((item, index) => (
                      <SimilarSeriesCard
                        key={item.id}
                        item={item}
                        focusKey={getSimilarItemFocusKey(
                          category?.slug ?? 'series-detail',
                          index,
                        )}
                        onEnterPress={() => openSimilarItem(item)}
                        onArrowPress={(direction: string) =>
                          handleSimilarCardArrowPress(direction, index)
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[0.65rem] border border-white/10 bg-white/[0.035] px-4 py-5">
                    <p className="text-sm font-semibold text-zinc-400">
                      Sem sugestoes semelhantes nesta fonte.
                    </p>
                  </div>
                )}
              </aside>
            </section>
          ) : (
            <section className="grid grid-cols-5 gap-3 pb-12">
              {visibleItems.map((item, index) => (
                <MediaCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  posterUrl={item.posterUrl}
                  eagerLoad={index < 12}
                  index={index}
                  focusKey={getCategoryItemFocusKey(
                    category?.slug ?? 'category',
                    index,
                  )}
                  onEnterPress={() => openEpisode(item, index)}
                  onArrowPress={(direction: string) =>
                    handleCategoryCardArrowPress(direction, index)
                  }
                  focusScrollOptions={{
                    behavior: 'auto',
                    block: 'center',
                    inline: 'nearest',
                  }}
                />
              ))}
            </section>
          )
        )}
      </main>
    </AppShell>
  );
}
