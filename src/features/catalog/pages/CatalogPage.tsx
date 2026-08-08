import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Clapperboard, MonitorPlay, Tv } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';

import { useAuth } from '../../../app/providers/AuthProvider';
import { AppShell } from '../../../components/layout/AppShell';
import { CatalogHero } from '../../../components/media/CatalogHero';
import { MediaCard } from '../../../components/media/MediaCard';
import { FocusableButton } from '../../../components/tv/FocusableButton';
import { FocusableSection } from '../../../components/tv/FocusableSection';
import { useDeviceType } from '../../../hooks/useDeviceType';
import { useDeviceProfile } from '../../../platform/useDeviceProfile';
import { useCatalogGridNavigation } from '../../../hooks/useCatalogGridNavigation';
import { useRouteInitialFocus } from '../../../hooks/useRouteInitialFocus';
import {
  getCategoryItemFocusKey,
  getCategorySectionFocusKey,
  getCategorySeeAllFocusKey,
} from '../../../lib/spatial/categoryFocusKeys';
import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import { getCachedAppBootstrapResult } from '@/features/bootstrap/services/appBootstrap.service';
import { getHomeSectionSeeAllRoute } from '@/features/catalog/services/catalogCategoryGroups.service';
import {
  buildHomeDiscoverySectionKey,
  executeHomeDiscoveryPresentation,
  overlayStoredHomeDiscoverySnapshots,
  resolveHomeSectionContentKind,
} from '@/features/catalog/services/homeDiscoveryPresentation.service';
import {
  getHorizontalHeroArtworkCandidates,
  getHorizontalHeroArtworkCandidateRecords,
  resolveHomeHeroArtworkUrl,
} from '@/features/catalog/services/heroArtworkPolicy.service';
import {
  getOrCreateDiscoveryRuntimeContext,
  markDiscoveryRuntimeSurfaceInteracted,
  removeDiscoveryRuntimeSurfaceSnapshots,
  updateDiscoveryRuntimeSnapshotItemPayloads,
  type DiscoveryRuntimeAccessScope,
} from '@/features/catalog/services/discoveryRuntimePresentationStore.service';
import { enrichMovieHeroItems } from '@/features/catalog/services/movieHeroMetadata.service';
import { enrichSeriesHeroHighlights } from '@/features/catalog/services/seriesHeroTmdb.service';
import {
  createBoundedDiscoveryGenerationKey,
  moveDiscoveryHeroOutOfFirstSlot,
  resolveLocalCatalogDiscoverySnapshot,
} from '@/features/catalog/services/localCatalogDiscoverySnapshot.service';
import { useAutoRotatingHero } from '@/hooks/useAutoRotatingHero';
import { markDiscoveryPerformance } from '@/features/catalog/services/discoveryPerformance.service';

import {
  getCachedHomeVodSections,
  loadHomeVodSections,
  type LoadHomeVodInput,
  type HomeVodSection,
  type HomeVodItem,
} from '../services/homeVod.service';
import { usePlaylistRuntime } from '@/features/playlists/providers/PlaylistRuntimeProvider';
const INITIAL_TV_VISIBLE_SECTIONS = 1;
const INITIAL_TV_VISIBLE_ITEMS_PER_SECTION = 5;
const TV_REMAINING_SECTIONS_DELAY_MS = 1500;
const SECTION_LOADING_CARD_COUNT = 4;
type HomeCatalogStatus = 'loading' | 'content' | 'empty' | 'error';
const TOP_CATEGORY_ITEMS = [
  { label: 'Ao Vivo', path: '/live', Icon: Tv },
  { label: 'Filmes', path: '/category/filmes', Icon: Clapperboard },
  { label: 'S\u00e9ries', path: '/category/series', Icon: MonitorPlay },
] as const;

type CatalogPageItem = HomeVodItem;
type CatalogPageSection = HomeVodSection;
const EMPTY_CATALOG_SECTIONS: CatalogPageSection[] = [];

function resolveHomeSectionSeeAllRoute(section: CatalogPageSection) {
  const representativeItem = section.items.find(
    (item) =>
      (item.kind === 'movie' || item.kind === 'series') &&
      Boolean(item.groupTitle?.trim() || section.title.trim()),
  );

  return getHomeSectionSeeAllRoute({
    sectionId: section.id,
    title: section.title,
    kind: representativeItem?.kind,
    groupTitle: representativeItem?.groupTitle,
  });
}

function shouldShowSeeAll(section: CatalogPageSection) {
  return Boolean(resolveHomeSectionSeeAllRoute(section));
}

function createHomeMovieNavigationItem(
  item: CatalogPageItem,
  fallbackGroupTitle?: string,
): CatalogPageItem {
  return {
    ...item,
    groupTitle: item.groupTitle ?? fallbackGroupTitle,
    kind: item.kind ?? 'movie',
  };
}

function isFireStickUserAgent() {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  return (
    userAgent.includes('aft') ||
    userAgent.includes('fire tv') ||
    userAgent.includes('firetv')
  );
}

function mapHomeVodSectionsToCatalogSections(
  sections: HomeVodSection[],
): CatalogPageSection[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    eyebrow: section.eyebrow,
    description: section.description,
    items: section.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle,
      posterUrl: item.posterUrl,
      backdropUrl: item.backdropUrl,
      artworkCandidates: item.artworkCandidates,
      overview: item.overview,
      streamUrl: item.streamUrl,
      groupTitle: item.groupTitle,
      tmdbId: item.tmdbId,
      tmdbTitle: item.tmdbTitle,
      tmdbGenres: item.tmdbGenres,
      tmdbRating: item.tmdbRating,
      tmdbReleaseYear: item.tmdbReleaseYear,
      seriesKey: item.seriesKey,
      episodeCount: item.episodeCount,
      isSeriesCollection: item.isSeriesCollection,
    })),
  }));
}

function getHomeVodLimitPerSection(isTv: boolean) {
  return isTv ? 15 : 20;
}

async function enrichHomeVodSectionsInBackground(
  sections: HomeVodSection[],
  sourceId: string | undefined,
  scope: DiscoveryRuntimeAccessScope | null,
  onEnriched: (enrichedSections: HomeVodSection[]) => void,
) {
  if (!sections || sections.length === 0 || !sourceId?.trim()) {
    return;
  }

  const allItems = sections.flatMap((sec) => sec.items);
  if (allItems.length === 0) {
    return;
  }

  const movieCandidates = allItems.filter(
    (item) => item.kind === 'movie' && (!item.backdropUrl || !item.overview),
  );
  const seriesCandidates = allItems.filter(
    (item) => item.kind === 'series' && (!item.backdropUrl || !item.overview),
  );

  if (movieCandidates.length === 0 && seriesCandidates.length === 0) {
    return;
  }

  try {
    const [enrichedMovies, enrichedSeries] = await Promise.all([
      movieCandidates.length > 0
        ? enrichMovieHeroItems(movieCandidates, { sourceId, limit: 12 }).catch(
            () => movieCandidates,
          )
        : Promise.resolve([]),
      seriesCandidates.length > 0
        ? enrichSeriesHeroHighlights(seriesCandidates, { sourceId }).catch(
            () => seriesCandidates,
          )
        : Promise.resolve([]),
    ]);

    const enrichedMap = new Map<string, HomeVodItem>();
    for (const item of [...enrichedMovies, ...enrichedSeries]) {
      enrichedMap.set(item.id, item);
    }

    if (enrichedMap.size === 0) {
      return;
    }

    const updatedSections = sections.map((sec) => ({
      ...sec,
      items: sec.items.map((item) => enrichedMap.get(item.id) ?? item),
    }));

    if (scope) {
      updateDiscoveryRuntimeSnapshotItemPayloads(
        scope,
        Array.from(enrichedMap.values()),
      );
    }

    onEnriched(updatedSections);
  } catch (err) {
    console.warn('[XANDEFLIX_HOME_BACKGROUND_ENRICHMENT_FAILED]', err);
  }
}

function normalizeHomeSectionTitle(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isRenderableVodHomeSection(section: HomeVodSection) {
  const normalizedTitle = normalizeHomeSectionTitle(section.title);

  if (
    normalizedTitle.startsWith('canais') ||
    normalizedTitle.startsWith('canal') ||
    normalizedTitle.includes('ao vivo')
  ) {
    return false;
  }

  return section.items.length > 0;
}

function filterRenderableVodHomeSections(sections?: HomeVodSection[] | null) {
  return sections?.filter(isRenderableVodHomeSection) ?? [];
}

function buildMobileHomeHeroMetadata(item?: CatalogPageItem) {
  const genres = Array.isArray(item?.tmdbGenres)
    ? item.tmdbGenres.join(', ')
    : item?.tmdbGenres
        ?.split(',')
        .map((genre) => genre.trim())
        .filter(Boolean)
        .join(', ');
  const rawRating = item?.tmdbRating?.trim();
  const numericRating = Number(rawRating);
  const rating = rawRating
    ? Number.isFinite(numericRating)
      ? numericRating.toFixed(1)
      : rawRating
    : null;

  return [
    genres,
    item?.tmdbReleaseYear,
    rating ? `★ ${rating}` : null,
  ]
    .filter(Boolean)
    .join(' • ');
}

function createHomeVodLoadInput(
  limitPerSection: number,
  sourceId?: string,
  sourceType?: 'm3u' | 'xtream' | 'manual' | 'unknown',
  scopeKey?: string,
): LoadHomeVodInput | null {
  const storedActivation = getStoredLicenseActivation();

  if (!storedActivation) {
    return null;
  }

  const licenseCode = storedActivation.licenseCode.trim();

  return {
    licenseCode,
    deviceIdentifier: storedActivation.deviceIdentifier,
    sourceId,
    scopeKey,
    sourceType,
    limitPerSection,
  };
}

function createInitialHomeCatalogState(
  isTv: boolean,
  sourceId?: string,
  sourceType?: 'm3u' | 'xtream' | 'manual' | 'unknown',
  scopeKey?: string,
) {
  const limitPerSection = getHomeVodLimitPerSection(isTv);
  const loadInput = createHomeVodLoadInput(
    limitPerSection,
    sourceId,
    sourceType,
    scopeKey,
  );
  const cachedSections = loadInput ? getCachedHomeVodSections(loadInput) : null;
  const cachedBootstrap = loadInput ? getCachedAppBootstrapResult() : null;
  const bootstrapSections =
    cachedBootstrap &&
    cachedBootstrap.licenseCode.trim().toUpperCase() ===
      loadInput?.licenseCode.trim().toUpperCase() &&
    cachedBootstrap.deviceIdentifier === loadInput.deviceIdentifier &&
    cachedBootstrap.sourceId === loadInput.sourceId
      ? cachedBootstrap.homeSections
      : null;
  const safeCachedSections = filterRenderableVodHomeSections(cachedSections);
  const safeBootstrapSections = filterRenderableVodHomeSections(bootstrapSections);
  const rawSections = safeCachedSections.length
    ? safeCachedSections
    : safeBootstrapSections.length
      ? safeBootstrapSections
      : null;

  const discoveryScope: DiscoveryRuntimeAccessScope | null = loadInput?.sourceId?.trim()
    ? {
        licenseCode: loadInput.licenseCode,
        deviceIdentifier: loadInput.deviceIdentifier,
        sourceId: loadInput.sourceId.trim(),
      }
    : null;

  if (discoveryScope) {
    getOrCreateDiscoveryRuntimeContext(discoveryScope);
  }

  const overlaySections = discoveryScope && rawSections
    ? overlayStoredHomeDiscoverySnapshots({ scope: discoveryScope, sections: rawSections })
    : rawSections;

  const sections = overlaySections?.length
    ? mapHomeVodSectionsToCatalogSections(overlaySections)
    : null;

  return {
    limitPerSection,
    loadInput,
    sections: sections?.length ? sections : null,
    wasHydratedFromCache: Boolean(sections?.length),
  };
}

export function CatalogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const {
    source: playlistSource,
    status: playlistStatus,
    localCatalogScopeKey,
    localCatalogGenerationId,
    refreshFromSourceInBackground,
  } = usePlaylistRuntime();
  const deviceProfile = useDeviceProfile();
  const { isTv: legacyIsTv, isMobile } = useDeviceType();
  const isTabletPortraitTouch =
    deviceProfile.formFactor === 'tablet' &&
    deviceProfile.inputMode === 'touch' &&
    deviceProfile.viewportHeight >= deviceProfile.viewportWidth;
  const isTv =
    !isTabletPortraitTouch &&
    (deviceProfile.formFactor === 'tv' || legacyIsTv);
  const shouldShowTopCategoryChips = isMobile || isTabletPortraitTouch;

  useEffect(() => {
    if (location.pathname !== '/') {
      return;
    }

    let isActive = true;
    let backButtonListener: { remove: () => Promise<void> } | null = null;

    void CapacitorApp.addListener('backButton', () => {
      if (isActive && window.location.pathname === '/') {
        void CapacitorApp.exitApp();
      }
    }).then((listener) => {
      if (!isActive) {
        void listener.remove();
        return;
      }
      backButtonListener = listener;
    });

    return () => {
      isActive = false;
      if (backButtonListener) {
        void backButtonListener.remove();
      }
    };
  }, [location.pathname]);

  const [initialHomeCatalogState] = useState(() =>
    createInitialHomeCatalogState(
      isTv,
      playlistSource?.sourceId,
      playlistSource?.sourceType,
      localCatalogScopeKey ?? undefined,
    ),
  );
  const [realCatalogSections, setRealCatalogSections] = useState<
    CatalogPageSection[] | null
  >(initialHomeCatalogState.sections);
  const [homeCatalogStatus, setHomeCatalogStatus] = useState<HomeCatalogStatus>(
    initialHomeCatalogState.sections?.length ? 'content' : 'loading',
  );
  const [homeCatalogErrorMessage, setHomeCatalogErrorMessage] = useState<
    string | null
  >(null);
  const [homeCatalogRetryKey, setHomeCatalogRetryKey] = useState(0);
  const realCatalogSectionsRef = useRef(realCatalogSections);
  realCatalogSectionsRef.current = realCatalogSections;
  const homeVodLimitPerSection = getHomeVodLimitPerSection(isTv);
  const wasInitialCatalogHydratedFromCache =
    initialHomeCatalogState.wasHydratedFromCache &&
    initialHomeCatalogState.limitPerSection === homeVodLimitPerSection;

  const loadInput = initialHomeCatalogState.loadInput;
  const currentHomeDiscoveryScope: DiscoveryRuntimeAccessScope | null = useMemo(
    () =>
      loadInput?.licenseCode &&
      loadInput?.deviceIdentifier &&
      playlistSource?.sourceId?.trim()
        ? {
            licenseCode: loadInput.licenseCode,
            deviceIdentifier: loadInput.deviceIdentifier,
            sourceId: playlistSource.sourceId.trim(),
          }
        : null,
    [
      loadInput?.deviceIdentifier,
      loadInput?.licenseCode,
      playlistSource?.sourceId,
    ],
  );

  useLayoutEffect(() => {
    if (currentHomeDiscoveryScope) {
      getOrCreateDiscoveryRuntimeContext(currentHomeDiscoveryScope);
    }
  }, [currentHomeDiscoveryScope]);

  const localCatalogSections = realCatalogSections ?? EMPTY_CATALOG_SECTIONS;

  const discoveryGenerationKey = useMemo(
    () =>
      createBoundedDiscoveryGenerationKey({
        sourceId: playlistSource?.sourceId ?? 'local-source',
        activeGenerationId: localCatalogGenerationId,
        candidates: localCatalogSections.flatMap((section) => section.items),
      }),
    [
      localCatalogSections,
      localCatalogGenerationId,
      playlistSource?.sourceId,
    ],
  );
  const latestHomeDiscoveryGenerationRef = useRef(discoveryGenerationKey);
  latestHomeDiscoveryGenerationRef.current = discoveryGenerationKey;

  useEffect(() => {
    const generationAtEntry = latestHomeDiscoveryGenerationRef.current;

    return () => {
      if (
        currentHomeDiscoveryScope &&
        latestHomeDiscoveryGenerationRef.current !== generationAtEntry
      ) {
        removeDiscoveryRuntimeSurfaceSnapshots(
          currentHomeDiscoveryScope,
          'home',
        );
      }
    };
  }, [currentHomeDiscoveryScope]);

  const resolvedCatalogSections = useMemo(() => {
    if (!currentHomeDiscoveryScope) {
      return localCatalogSections;
    }

    return localCatalogSections.map((section) => {
      const contentKind = resolveHomeSectionContentKind(section.title);
      const sectionKey = contentKind
        ? buildHomeDiscoverySectionKey(contentKind, section.title)
        : `row:${section.id}`;
      const snapshot = resolveLocalCatalogDiscoverySnapshot({
        scope: currentHomeDiscoveryScope,
        surfaceKey: 'home',
        sectionKey,
        generationKey: discoveryGenerationKey,
        candidates: section.items,
        slotCount: section.items.length,
        historyKind: 'CATEGORY_DISCOVERY_WINDOW',
        historyItemCount: Math.min(5, section.items.length),
        isArtworkReady: (item) =>
          Boolean(item.backdropUrl?.trim() || item.posterUrl?.trim()),
      });

      return {
        ...section,
        items: snapshot.items,
      };
    });
  }, [
    localCatalogSections,
    currentHomeDiscoveryScope,
    discoveryGenerationKey,
  ]);
  const heroItems = useMemo(() => {
    const uniqueItems = new Map<string, CatalogPageSection['items'][number]>();

    for (const section of resolvedCatalogSections) {
      for (const item of section.items) {
        if (item.title && !uniqueItems.has(item.id)) {
          uniqueItems.set(item.id, item);
        }
      }
    }

    const candidates = Array.from(uniqueItems.values());

    if (!currentHomeDiscoveryScope) {
      return candidates.slice(0, 5);
    }

    const heroArtworkMode = isMobile ? 'mobile' : 'horizontal';

    return resolveLocalCatalogDiscoverySnapshot({
      scope: currentHomeDiscoveryScope,
      surfaceKey: 'home',
      sectionKey: 'hero',
      generationKey: discoveryGenerationKey,
      candidates,
      slotCount: Math.min(5, candidates.length),
      historyKind: 'HOME_HERO',
      isArtworkReady: (item) =>
        heroArtworkMode === 'mobile'
          ? Boolean(resolveHomeHeroArtworkUrl(item, 'mobile'))
          : getHorizontalHeroArtworkCandidates(item).length > 0,
    }).items;
  }, [
    currentHomeDiscoveryScope,
    discoveryGenerationKey,
    isMobile,
    resolvedCatalogSections,
  ]);
  const heroRotation = useAutoRotatingHero({
    poolIds: heroItems.map((item) => item.id),
    heroSelector: '[data-xf-hero="catalog"]',
  });
  const activeHeroIndex = heroRotation.activeIndex;
  const heroItem = heroItems[activeHeroIndex] ?? null;
  const displayCatalogSections = useMemo(
    () =>
      moveDiscoveryHeroOutOfFirstSlot(
        resolvedCatalogSections,
        heroItems.map((item) => item.id),
      ),
    [heroItems, resolvedCatalogSections],
  );

  const [visibleSectionCount, setVisibleSectionCount] = useState(
    isTv && !wasInitialCatalogHydratedFromCache
      ? INITIAL_TV_VISIBLE_SECTIONS
      : displayCatalogSections.length,
  );

  useLayoutEffect(() => {
    markDiscoveryPerformance('discovery_snapshot_ready');
    markDiscoveryPerformance('home_shell_render');
  }, []);

  // Preload seguro das imagens do catálogo da Home em background
  const preloadUrls = useMemo(() => {
    if (!realCatalogSections) {
      return [];
    }

    const urls = new Set<string>();
    for (const section of realCatalogSections) {
      for (const item of section.items) {
        if (item.posterUrl) {
          urls.add(item.posterUrl);
        }
        if (item.backdropUrl) {
          urls.add(item.backdropUrl);
        }
      }
    }

    return Array.from(urls).slice(0, 300);
  }, [realCatalogSections]);

  useEffect(() => {
    if (preloadUrls.length === 0) {
      return;
    }

    let isCancelled = false;
    const schedulePreload = () => {
      const scheduler =
        typeof window !== 'undefined' && 'requestIdleCallback' in window
          ? (window as any).requestIdleCallback
          : (cb: () => void) => window.setTimeout(cb, 100);

      scheduler(() => {
        if (isCancelled) return;
        for (const url of preloadUrls) {
          if (isCancelled) break;
          const img = new Image();
          img.src = url;
        }
      });
    };

    schedulePreload();

    return () => {
      isCancelled = true;
    };
  }, [preloadUrls]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: number | null = null;

    function clearCatalogTimeout() {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    function commitCatalogSections(nextSections: CatalogPageSection[]) {
      if (!isMounted || nextSections.length === 0) {
        return;
      }

      realCatalogSectionsRef.current = nextSections;
      setRealCatalogSections(nextSections);
      setHomeCatalogStatus('content');
      setHomeCatalogErrorMessage(null);
    }

    async function loadRealCatalog() {
      const hasUsableCatalog = Boolean(realCatalogSectionsRef.current?.length);

      if (!hasUsableCatalog) {
        setHomeCatalogStatus('loading');
        setHomeCatalogErrorMessage(null);
      }

      try {
        const homeVodLoadInput = createHomeVodLoadInput(
          homeVodLimitPerSection,
          playlistSource?.sourceId,
          playlistSource?.sourceType,
          localCatalogScopeKey ?? undefined,
        );

        if (!homeVodLoadInput) {
          if (!hasUsableCatalog) {
            setHomeCatalogStatus('error');
            setHomeCatalogErrorMessage(
              'Nao foi possivel preparar o catalogo local desta licenca.',
            );
          }
          return;
        }

        if (!homeVodLoadInput.sourceId?.trim()) {
          if (playlistStatus === 'empty') {
            realCatalogSectionsRef.current = [];
            setRealCatalogSections([]);
            setHomeCatalogStatus('empty');
          } else if (hasUsableCatalog) {
            setHomeCatalogStatus('content');
          } else if (playlistStatus === 'error') {
            setHomeCatalogStatus('error');
            setHomeCatalogErrorMessage(
              'Nao foi possivel acessar o catalogo local agora.',
            );
          } else if (
            playlistStatus !== 'idle' &&
            playlistStatus !== 'loading'
          ) {
            setHomeCatalogStatus('error');
            setHomeCatalogErrorMessage(
              'A fonte local autorizada nao esta disponivel agora.',
            );
          }
          return;
        }

        timeoutId = window.setTimeout(() => {
          if (isMounted && !realCatalogSectionsRef.current?.length) {
            setHomeCatalogStatus('error');
            setHomeCatalogErrorMessage(
              'O catalogo local demorou para responder. Tente novamente.',
            );
            spatialDebug('catalog-grid', 'HOME_LOCAL_CATALOG_READ_TIMEOUT');
          }
        }, 3000);

        const homeVodSections = await loadHomeVodSections({
          ...homeVodLoadInput,
          sourceId: playlistSource?.sourceId,
          sourceType: playlistSource?.sourceType,
          scopeKey: localCatalogScopeKey ?? undefined,
          limitPerSection: homeVodLimitPerSection,
          preferFresh: true,
          propagateReadError: true,
        });

        clearCatalogTimeout();

        if (!isMounted) {
          return;
        }

        const safeHomeVodSections =
          filterRenderableVodHomeSections(homeVodSections);

        const discoveryScope: DiscoveryRuntimeAccessScope | null = homeVodLoadInput?.sourceId?.trim()
          ? {
              licenseCode: homeVodLoadInput.licenseCode,
              deviceIdentifier: homeVodLoadInput.deviceIdentifier,
              sourceId: homeVodLoadInput.sourceId.trim(),
            }
          : null;

        const overlaySections = discoveryScope
          ? overlayStoredHomeDiscoverySnapshots({
              scope: discoveryScope,
              sections: safeHomeVodSections,
            })
          : safeHomeVodSections;

        const nextSections =
          mapHomeVodSectionsToCatalogSections(overlaySections);

        if (nextSections.length > 0) {
          commitCatalogSections(nextSections);
        } else if (playlistStatus === 'loading' || playlistStatus === 'idle') {
          if (realCatalogSectionsRef.current?.length) {
            setHomeCatalogStatus('content');
            setHomeCatalogErrorMessage(null);
          } else {
            setHomeCatalogStatus('loading');
          }
        } else if (playlistStatus === 'error') {
          if (realCatalogSectionsRef.current?.length) {
            setHomeCatalogStatus('content');
            setHomeCatalogErrorMessage(null);
          } else {
            setHomeCatalogStatus('error');
            setHomeCatalogErrorMessage(
              'Nao foi possivel acessar o catalogo local agora.',
            );
          }
        } else {
          realCatalogSectionsRef.current = [];
          setRealCatalogSections([]);
          setHomeCatalogStatus('empty');
          setHomeCatalogErrorMessage(null);
        }

        void enrichHomeVodSectionsInBackground(
          overlaySections,
          playlistSource?.sourceId,
          discoveryScope,
          (enrichedSections) => {
            commitCatalogSections(
              mapHomeVodSectionsToCatalogSections(enrichedSections),
            );
          },
        );

        if (playlistStatus === 'ready' && discoveryScope && safeHomeVodSections.length > 0) {
          void executeHomeDiscoveryPresentation({
            scope: discoveryScope,
            sections: safeHomeVodSections,
          })
            .then((discoverySections) => {
              if (!isMounted || !discoverySections || discoverySections.length === 0) {
                return;
              }
              const finalSections =
                mapHomeVodSectionsToCatalogSections(discoverySections);
              commitCatalogSections(finalSections);

              void enrichHomeVodSectionsInBackground(
                discoverySections,
                playlistSource?.sourceId,
                discoveryScope,
                (enrichedSections) => {
                  commitCatalogSections(
                    mapHomeVodSectionsToCatalogSections(enrichedSections),
                  );
                },
              );
            })
            .catch((err) => {
              console.warn('[XANDEFLIX_HOME_DISCOVERY_BACKGROUND_ERROR]', {
                errorName: err instanceof Error ? err.name : 'UnknownError',
              });
            });
        }
      } catch (error) {
        clearCatalogTimeout();
        spatialDebug(
          'catalog-grid',
          'HOME_LOCAL_CATALOG_READ_FAILED',
          error instanceof Error ? error.name : 'UnknownError',
        );

        if (isMounted) {
          if (realCatalogSectionsRef.current?.length) {
            setHomeCatalogStatus('content');
            setHomeCatalogErrorMessage(null);
          } else {
            setHomeCatalogStatus('error');
            setHomeCatalogErrorMessage(
              'Nao foi possivel carregar o catalogo local. Tente novamente.',
            );
          }
        }
      } finally {
        clearCatalogTimeout();
      }
    }

    void loadRealCatalog();

    let progressiveIntervalId: number | null = null;

    if (
      (!realCatalogSectionsRef.current || realCatalogSectionsRef.current.length === 0) &&
      (playlistStatus === 'loading' || playlistStatus === 'ready')
    ) {
      progressiveIntervalId = window.setInterval(() => {
        if (
          isMounted &&
          (!realCatalogSectionsRef.current || realCatalogSectionsRef.current.length === 0)
        ) {
          setHomeCatalogRetryKey((current) => current + 1);
        } else if (progressiveIntervalId !== null) {
          window.clearInterval(progressiveIntervalId);
          progressiveIntervalId = null;
        }
      }, 1000);
    }

    return () => {
      isMounted = false;
      clearCatalogTimeout();
      if (progressiveIntervalId !== null) {
        window.clearInterval(progressiveIntervalId);
      }
    };
  }, [
    homeVodLimitPerSection,
    playlistSource?.sourceId,
    playlistSource?.sourceType,
    playlistStatus,
    localCatalogScopeKey,
    homeCatalogRetryKey,
  ]);

  useEffect(() => {
    if (
      !playlistSource?.sourceId?.trim() ||
      !localCatalogScopeKey ||
      !resolvedCatalogSections.length
    ) {
      return;
    }

    let canceled = false;
    let timeoutId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => {
        if (!canceled) {
          void refreshFromSourceInBackground('home_interactive');
        }
      }, 0);
    });

    return () => {
      canceled = true;
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    localCatalogScopeKey,
    playlistSource?.sourceId,
    refreshFromSourceInBackground,
    resolvedCatalogSections.length,
  ]);



  useEffect(() => {
    if (!isTv) {
      setVisibleSectionCount(displayCatalogSections.length);
      return;
    }

    if (wasInitialCatalogHydratedFromCache) {
      setVisibleSectionCount(displayCatalogSections.length);
      return;
    }

    setVisibleSectionCount(INITIAL_TV_VISIBLE_SECTIONS);

    const timer = window.setTimeout(() => {
      setVisibleSectionCount(displayCatalogSections.length);
    }, TV_REMAINING_SECTIONS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    isTv,
    displayCatalogSections.length,
    wasInitialCatalogHydratedFromCache,
  ]);

  const visibleCatalogSections = useMemo(
    () => displayCatalogSections.slice(0, visibleSectionCount),
    [displayCatalogSections, visibleSectionCount],
  );

  const isProgressiveLoading =
    isTv && visibleSectionCount < displayCatalogSections.length;

  const shouldShowInitialCatalogLoading =
    homeCatalogStatus === 'loading' && !displayCatalogSections.length;
  const shouldShowHomeCatalogError =
    homeCatalogStatus === 'error' && !displayCatalogSections.length;
  const shouldShowHomeCatalogEmpty =
    homeCatalogStatus === 'empty' && !displayCatalogSections.length;
  const isCompactFireStickHero = useMemo(
    () => isTv && isFireStickUserAgent(),
    [isTv],
  );

  function handlePreviousHeroItem() {
    heroRotation.previous();
  }

  function handleNextHeroItem() {
    heroRotation.next();
  }

  function retryHomeCatalog() {
    setHomeCatalogRetryKey((currentKey) => currentKey + 1);
  }

  useRouteInitialFocus();

  const spatialNavigation = useCatalogGridNavigation({
    sections: displayCatalogSections,
  });

  function openHomeMovieDetail(
    item: CatalogPageItem | null | undefined,
    fallbackGroupTitle?: string,
    seedItems: CatalogPageItem[] = [],
  ) {
    if (!item) {
      return;
    }

    const params = new URLSearchParams({
      title: item.tmdbTitle ?? item.title,
    });

    if (item.tmdbId) {
      params.set('tmdbId', item.tmdbId);
    }

    if (item.tmdbTitle) {
      params.set('tmdbTitle', item.tmdbTitle);
    }

    const groupTitle = item.groupTitle ?? fallbackGroupTitle;
    if (groupTitle) {
      params.set('groupTitle', groupTitle);
    }

    const selectedMovieKey = item.tmdbId || item.tmdbTitle || item.title || item.id;
    const seenMovieKeys = new Set<string>();
    const movieSimilarSeedItems: CatalogPageItem[] = [];

    for (const candidate of [item, ...seedItems]) {
      const candidateKey =
        candidate.tmdbId || candidate.tmdbTitle || candidate.title || candidate.id;

      if (!candidateKey || candidateKey === selectedMovieKey || seenMovieKeys.has(candidateKey)) {
        continue;
      }

      seenMovieKeys.add(candidateKey);
      movieSimilarSeedItems.push(
        createHomeMovieNavigationItem(candidate, candidate.groupTitle ?? fallbackGroupTitle),
      );
    }

    navigate(`/category/movie-detail?${params.toString()}`, {
      state: {
        fromMoviesCategory: true,
        returnTo: `${location.pathname}${location.search}`,
        selectedMovieItem: createHomeMovieNavigationItem(item, groupTitle),
        movieSimilarSeedItems,
      },
    });
  }

  function openHomeSectionSeeAll(section: CatalogPageSection) {
    const route = resolveHomeSectionSeeAllRoute(section);

    if (!route) {
      return;
    }

    spatialDebug('catalog-grid', 'Ver tudo:', section.title);
    navigate(route, {
      state: {
        fromCatalogSeeAll: true,
        returnTo: `${location.pathname}${location.search}`,
      },
    });
  }

  function openHomeMoviePlayer(
    item: CatalogPageItem | null | undefined,
    fallbackGroupTitle?: string,
    seedItems: CatalogPageItem[] = [],
  ) {
    if (!item) {
      return;
    }

    if (!item.streamUrl) {
      openHomeMovieDetail(item, fallbackGroupTitle, seedItems);
      return;
    }

    const params = new URLSearchParams({
      src: item.streamUrl,
      title: item.tmdbTitle ?? item.title,
    });

    params.set('episodeId', item.id);
    params.set('direct', '1');

    navigate(`/player?${params.toString()}`);
  }

  return (
    <AppShell
      onSignOut={() => {
        void signOut()
          .catch(() => undefined)
          .finally(() => {
            navigate('/login', { replace: true });
          });
      }}
      headerNavigation={{
        onSearchArrowPress: spatialNavigation.handleHeaderSearchArrowPress,
        onProfileArrowPress: spatialNavigation.handleHeaderProfileArrowPress,
        onLogoutArrowPress: spatialNavigation.handleHeaderLogoutArrowPress,
      }}
      mainClassName="xf-tv-safe-main px-3 pb-24 md:px-7 md:pb-9 lg:px-8 xl:px-10"
    >
      <section
        className="mx-auto w-full max-w-[1920px]"
        onPointerDownCapture={() => {
          if (currentHomeDiscoveryScope) {
            markDiscoveryRuntimeSurfaceInteracted(currentHomeDiscoveryScope, 'home');
          }
        }}
        onKeyDownCapture={(event) => {
          const isTargetKey = [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'Enter',
          ].includes(event.key);

          if (isTargetKey && currentHomeDiscoveryScope) {
            markDiscoveryRuntimeSurfaceInteracted(currentHomeDiscoveryScope, 'home');
          }
        }}
      >
        <style>{`

          .xf-app[data-device-form-factor="tablet"] [data-xf-home-section-header="true"] button {
            min-height: 2.25rem;
            padding-left: 0.95rem;
            padding-right: 0.95rem;
            padding-top: 0.45rem;
            padding-bottom: 0.45rem;
            font-size: 0.78rem !important;
            line-height: 1;
          }

          .xf-app[data-device-form-factor="mobile"] [data-xf-home-section-header="true"] {
            margin-bottom: 0 !important;
          }

          .xf-app[data-device-form-factor="mobile"] [data-xf-home-section-title="true"] {
            line-height: 1;
          }
        `}</style>

        {shouldShowTopCategoryChips ? (
          <nav
            data-xf-mobile-home-top-chips="true"
            aria-label="Navegação rápida"
            className="mb-3 flex w-full items-center justify-center gap-2 px-1 pb-1"
          >
            {TOP_CATEGORY_ITEMS.map(({ label, path, Icon }) => (
              <button
                key={path}
                type="button"
                className="inline-flex h-10 flex-1 min-w-[6.85rem] max-w-[8.65rem] items-center justify-center gap-1 rounded-xl border border-white/30 bg-black/55 px-2 text-[0.78rem] font-bold text-white backdrop-blur-md transition-colors active:bg-white/20 md:min-w-[8.25rem] md:max-w-[8.85rem] md:gap-2 md:text-[0.88rem]"
                onClick={() => navigate(path)}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap leading-none">{label}</span>
              </button>
            ))}
          </nav>
        ) : null}

        {heroItem ? (
          <CatalogHero
          itemId={heroItem.id}
          title={heroItem.title}
          description={
            heroItem?.overview ??
            heroItem?.subtitle ??
            'Conteudos recomendados para sua licenca.'
          }
          metadata={isMobile ? buildMobileHomeHeroMetadata(heroItem) : undefined}
          backgroundUrl={resolveHomeHeroArtworkUrl(heroItem, isMobile ? 'mobile' : 'horizontal')}
          artworkCandidates={isMobile ? undefined : getHorizontalHeroArtworkCandidateRecords(heroItem)}
          onSectionArrowPress={spatialNavigation.handleHeroSectionArrowPress}
          onPlayArrowPress={spatialNavigation.handleHeroPlayArrowPress}
          onInfoArrowPress={spatialNavigation.handleHeroInfoArrowPress}
          onPlayPress={() =>
            openHomeMoviePlayer(
              heroItem,
              heroItem?.groupTitle,
              displayCatalogSections.flatMap((section) => section.items as CatalogPageItem[]),
            )
          }
          onInfoPress={() =>
            openHomeMovieDetail(
              heroItem,
              heroItem?.groupTitle,
              displayCatalogSections.flatMap((section) => section.items as CatalogPageItem[]),
            )
          }
          isCompactTvHero={isCompactFireStickHero}

          heroIndex={activeHeroIndex}

          heroTotal={heroItems.length}

          onPreviousHeroItem={handlePreviousHeroItem}

          onNextHeroItem={handleNextHeroItem}
          />
        ) : null}

        {shouldShowInitialCatalogLoading ? (
          <section
            data-xf-home-catalog-state="loading"
            className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-8"
          >
            <p className="text-[0.72rem] font-black uppercase tracking-[0.26em] text-xf-red">
              Carregando catalogo
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              Preparando filmes e series autorizados para a Home.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {Array.from({ length: SECTION_LOADING_CARD_COUNT }).map(
                (_, placeholderIndex) => (
                  <div
                    key={`initial-catalog-loading-${placeholderIndex}`}
                    className="h-32 rounded-[0.18rem] border border-white/5 bg-white/[0.06]"
                  />
                ),
              )}
            </div>
          </section>
        ) : shouldShowHomeCatalogError ? (
          <section
            data-xf-home-catalog-state="error"
            className="rounded-[0.18rem] border border-red-500/30 bg-black/40 px-6 py-10 text-center"
          >
            <p className="text-[0.72rem] font-black uppercase tracking-[0.26em] text-xf-red">
              Catalogo indisponivel
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              {homeCatalogErrorMessage ??
                'Nao foi possivel carregar o catalogo local.'}
            </p>
            <FocusableButton
              focusKey="home-catalog-retry"
              onClick={retryHomeCatalog}
              onEnterPress={retryHomeCatalog}
              className="mt-5 rounded-[0.18rem] bg-xf-red px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white"
            >
              Tentar novamente
            </FocusableButton>
          </section>
        ) : shouldShowHomeCatalogEmpty ? (
          <section
            data-xf-home-catalog-state="empty"
            className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-10 text-center"
          >
            <p className="text-[0.72rem] font-black uppercase tracking-[0.26em] text-xf-red">
              Catalogo vazio
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              Nenhum conteudo foi encontrado no catalogo local.
            </p>
          </section>
        ) : (
          visibleCatalogSections.map((section, categoryIndex) => {
            const sectionItems =
              isTv &&
              isProgressiveLoading &&
              categoryIndex === 0
                ? section.items.slice(0, INITIAL_TV_VISIBLE_ITEMS_PER_SECTION)
                : section.items;

            const sectionEyebrow =
              section.id === 'continue-watching'
                ? isMobile
                  ? 'Mobile'
                  : isTv
                    ? 'TV mode'
                    : 'Web'
                : section.eyebrow;
            const shouldShowSectionEyebrow =
              Boolean(sectionEyebrow) &&
              sectionEyebrow.toLowerCase() !== 'vod autorizado';

            return (
              <FocusableSection
                key={section.id}
                focusKey={getCategorySectionFocusKey(section.id)}
                focusScrollOptions={{
                  block: 'center',
                  inline: 'nearest',
                  behavior: 'auto',
                }}
                className="mb-2 border-0 bg-transparent px-0 py-0"
                onArrowPress={(direction) =>
                  spatialNavigation.handleCategorySectionArrowPress(
                    direction,
                    categoryIndex,
                  )
                }
              >
                <div data-xf-home-section-header="true"
                  className="mb-0.5 flex items-end justify-between gap-4 px-0.5">
                  <div className="min-w-0">
                    {shouldShowSectionEyebrow ? (
                      <p
                        data-xf-home-section-eyebrow="true"
                        className="text-[0.68rem] font-black uppercase tracking-[0.32em] text-xf-red"
                      >
                        {sectionEyebrow}
                      </p>
                    ) : null}

                    <h2
                      data-xf-home-section-title="true"
                      className={`${shouldShowSectionEyebrow ? 'mt-2 ' : ''}text-[1.05rem] font-black tracking-[-0.02em] text-white md:text-[1.55rem] lg:text-[1.7rem]`}
                    >
                      {section.title}
                    </h2>

                  </div>

                  {shouldShowSeeAll(section) && (
                    <FocusableButton
                      focusKey={getCategorySeeAllFocusKey(section.id)}
                      className="shrink-0 rounded-full border border-white/20 bg-white/[0.06] px-2.5 py-1 font-black uppercase tracking-[0.06em] text-zinc-300 transition duration-100 data-[focused=true]:border-white data-[focused=true]:bg-white data-[focused=true]:text-black"
                      style={{ fontSize: isMobile ? '0.62rem' : '0.58rem', lineHeight: 1 }}
                      onClick={() => openHomeSectionSeeAll(section)}
                      onEnterPress={() => openHomeSectionSeeAll(section)}
                      onArrowPress={(direction) =>
                        spatialNavigation.handleCategorySeeAllArrowPress(
                          direction,
                          categoryIndex,
                        )
                      }
                    >
                      Ver todos
                    </FocusableButton>
                  )}
                </div>

                {sectionItems.length > 0 ? (
                  <div className="xf-carousel-row flex gap-[0.2rem] overflow-x-auto overflow-y-visible pb-0 pr-10 scroll-auto md:gap-[0.25rem] lg:gap-1.5">
                    {sectionItems.map((item, itemIndex) => (
                      <MediaCard
                        key={item.id}
                        title={item.title}
                        subtitle={item.subtitle}
                        posterUrl={item.posterUrl}
                        eagerLoad={true}
                        performanceSurface={
                          categoryIndex === 0 && itemIndex === 0
                            ? 'home'
                            : undefined
                        }
                        hideTextOverlay
                        sizeScale="large"
                        index={itemIndex}
                        focusKey={getCategoryItemFocusKey(section.id, itemIndex)}
                        onEnterPress={() => {
                          const catalogItem = item as CatalogPageItem;

                          if (
                            catalogItem.isSeriesCollection ||
                            catalogItem.kind === 'series' ||
                            catalogItem.seriesKey
                          ) {
                            const params = new URLSearchParams({
                              title: catalogItem.title,
                              groupTitle: catalogItem.groupTitle ?? section.title,
                            });

                            if (catalogItem.tmdbId) {
                              params.set('tmdbId', catalogItem.tmdbId);
                            }

                            if (catalogItem.tmdbTitle) {
                              params.set('tmdbTitle', catalogItem.tmdbTitle);
                            }

                            navigate(`/category/series-detail?${params.toString()}`);
                            return;
                          }

                          openHomeMovieDetail(catalogItem, section.title, section.items as CatalogPageItem[]);
                        }}
                        onArrowPress={(direction) => {
                          const isLastVisibleCard =
                            itemIndex === sectionItems.length - 1;

                          if (
                            direction === 'right' &&
                            shouldShowSeeAll(section) &&
                            isLastVisibleCard
                          ) {
                            setFocus(getCategorySeeAllFocusKey(section.id));
                            return false;
                          }

                          if (
                            direction === 'up' &&
                            shouldShowSeeAll(section) &&
                            isLastVisibleCard
                          ) {
                            setFocus(getCategorySeeAllFocusKey(section.id));
                            return false;
                          }

                          return spatialNavigation.handleCategoryCardArrowPress(
                            direction,
                            categoryIndex,
                            itemIndex,
                          );
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[0.18rem] border border-white/10 bg-black/40 px-4 py-5">
                    <p className="text-sm font-semibold text-zinc-300">
                      Esta secao esta vazia no momento.
                    </p>
                  </div>
                )}
              </FocusableSection>
            );
          })
        )}

        {isProgressiveLoading ? (
          <section className="mb-8 rounded-[0.18rem] border border-white/10 bg-black/35 px-4 py-5 md:px-5 md:py-6">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.32em] text-zinc-300">
              Carregando mais secoes
            </p>

            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {Array.from({ length: SECTION_LOADING_CARD_COUNT }).map(
                (_, placeholderIndex) => (
                  <div
                    key={`catalog-loading-card-${placeholderIndex}`}
                    className="h-[14.5rem] w-[9.7rem] shrink-0 animate-pulse rounded-[0.18rem] border border-white/10 bg-white/5"
                  />
                ),
              )}
            </div>
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}
