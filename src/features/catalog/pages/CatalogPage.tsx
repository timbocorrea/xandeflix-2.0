import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';

import { useAuth } from '../../../app/providers/AuthProvider';
import { AppShell } from '../../../components/layout/AppShell';
import { CatalogHero } from '../../../components/media/CatalogHero';
import { MediaCard } from '../../../components/media/MediaCard';
import { FocusableButton } from '../../../components/tv/FocusableButton';
import { FocusableSection } from '../../../components/tv/FocusableSection';
import { useDeviceType } from '../../../hooks/useDeviceType';
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
import { getSlugByGroupTitle } from '@/features/catalog/services/catalogCategoryGroups.service';

import { catalogSections } from '../data/catalogSections';
import {
  getCachedHomeVodSections,
  loadHomeVodSections,
  type LoadHomeVodInput,
  type HomeVodSection,
} from '../services/homeVod.service';
import { CATALOG_WARMUP_REFRESH_EVENT } from '../services/catalogWarmup.service';

const INITIAL_TV_VISIBLE_SECTIONS = 1;
const INITIAL_TV_VISIBLE_ITEMS_PER_SECTION = 5;
const TV_REMAINING_SECTIONS_DELAY_MS = 1500;
const SECTION_LOADING_CARD_COUNT = 4;
const WARMUP_HOME_REFRESH_DEBOUNCE_MS = 2000;

type CatalogPageItem = (typeof catalogSections)[number]['items'][number] & {
  streamUrl?: string;
  kind?: 'movie' | 'series' | 'unknown';
  groupTitle?: string;
  tmdbId?: string;
  tmdbTitle?: string;
  seriesKey?: string;
  episodeCount?: number;
  isSeriesCollection?: boolean;
};

type CatalogPageSection = Omit<(typeof catalogSections)[number], 'items'> & {
  items: CatalogPageItem[];
};

function shouldShowSeeAll(section: { showSeeAll?: boolean }) {
  return Boolean(section.showSeeAll);
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
    showSeeAll:
      section.id === 'home-vod-launches' ||
      section.id.startsWith('home-vod-movie-category-'),
    items: section.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle,
      posterUrl: item.posterUrl,
      backdropUrl: item.backdropUrl,
      overview: item.overview,
      streamUrl: item.streamUrl,
      groupTitle: item.groupTitle,
      tmdbId: item.tmdbId,
      tmdbTitle: item.tmdbTitle,
      seriesKey: item.seriesKey,
      episodeCount: item.episodeCount,
      isSeriesCollection: item.isSeriesCollection,
    })),
  }));
}

function getHomeVodLimitPerSection(isTv: boolean) {
  return isTv ? 15 : 20;
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

function createHomeVodLoadInput(
  limitPerSection: number,
): LoadHomeVodInput | null {
  const storedActivation = getStoredLicenseActivation();

  if (!storedActivation) {
    return null;
  }

  const licenseCode = storedActivation.licenseCode.trim();

  return {
    licenseCode,
    deviceIdentifier: storedActivation.deviceIdentifier,
    limitPerSection,
  };
}

function createInitialHomeCatalogState(isTv: boolean) {
  const limitPerSection = getHomeVodLimitPerSection(isTv);
  const loadInput = createHomeVodLoadInput(limitPerSection);
  const cachedSections = loadInput ? getCachedHomeVodSections(loadInput) : null;
  const cachedBootstrap = loadInput ? getCachedAppBootstrapResult() : null;
  const bootstrapSections =
    cachedBootstrap &&
    cachedBootstrap.licenseCode.trim().toUpperCase() ===
      loadInput?.licenseCode.trim().toUpperCase() &&
    cachedBootstrap.deviceIdentifier === loadInput.deviceIdentifier
      ? cachedBootstrap.homeSections
      : null;
  const safeCachedSections = filterRenderableVodHomeSections(cachedSections);
  const safeBootstrapSections = filterRenderableVodHomeSections(bootstrapSections);

  const sections = safeCachedSections.length
    ? mapHomeVodSectionsToCatalogSections(safeCachedSections)
    : safeBootstrapSections.length
      ? mapHomeVodSectionsToCatalogSections(safeBootstrapSections)
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
  const { signOut } = useAuth();
  const { isTv, isMobile } = useDeviceType();
  const [initialHomeCatalogState] = useState(() =>
    createInitialHomeCatalogState(isTv),
  );
  const [realCatalogSections, setRealCatalogSections] = useState<
    CatalogPageSection[] | null
  >(initialHomeCatalogState.sections);
  const [isRealCatalogLoading, setIsRealCatalogLoading] = useState(
    !initialHomeCatalogState.sections?.length,
  );
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const homeVodLimitPerSection = getHomeVodLimitPerSection(isTv);
  const wasInitialCatalogHydratedFromCache =
    initialHomeCatalogState.wasHydratedFromCache &&
    initialHomeCatalogState.limitPerSection === homeVodLimitPerSection;

  const resolvedCatalogSections = realCatalogSections?.length
    ? realCatalogSections
    : catalogSections;

  const [visibleSectionCount, setVisibleSectionCount] = useState(
    isTv && !wasInitialCatalogHydratedFromCache
      ? INITIAL_TV_VISIBLE_SECTIONS
      : resolvedCatalogSections.length,
  );

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

    async function loadRealCatalog() {
      setIsRealCatalogLoading(true);

      const timeoutId = window.setTimeout(() => {
        if (isMounted && !realCatalogSections?.length) {
          setIsRealCatalogLoading(false);
          spatialDebug(
            'catalog-grid',
            'Timeout de 3s atingido. Continuando carregamento em background com fallback catalogSections.'
          );
        }
      }, 3000);

      try {
        const homeVodLoadInput =
          initialHomeCatalogState.limitPerSection === homeVodLimitPerSection
            ? initialHomeCatalogState.loadInput
            : createHomeVodLoadInput(homeVodLimitPerSection);

        if (!homeVodLoadInput) {
          window.clearTimeout(timeoutId);
          setRealCatalogSections(null);
          return;
        }

        const homeVodSections = await loadHomeVodSections({
          ...homeVodLoadInput,
          limitPerSection: homeVodLimitPerSection,
          preferFresh: true,
        });

        window.clearTimeout(timeoutId);

        if (!isMounted) {
          return;
        }

        const safeHomeVodSections =
          filterRenderableVodHomeSections(homeVodSections);
        const nextSections =
          mapHomeVodSectionsToCatalogSections(safeHomeVodSections);

        setRealCatalogSections(nextSections.length > 0 ? nextSections : null);
      } catch (error) {
        window.clearTimeout(timeoutId);
        spatialDebug(
          'catalog-grid',
          'Falha ao carregar Home VOD real:',
          error instanceof Error ? error.message : String(error),
        );

        if (isMounted) {
          setRealCatalogSections(null);
        }
      } finally {
        if (isMounted) {
          setIsRealCatalogLoading(false);
        }
      }
    }

    void loadRealCatalog();

    return () => {
      isMounted = false;
    };
  }, [homeVodLimitPerSection, initialHomeCatalogState]);

  useEffect(() => {
    let isMounted = true;
    let refreshTimeoutId: number | null = null;

    async function refreshHomeAfterWarmup() {
      const homeVodLoadInput =
        initialHomeCatalogState.limitPerSection === homeVodLimitPerSection
          ? initialHomeCatalogState.loadInput
          : createHomeVodLoadInput(homeVodLimitPerSection);

      if (!homeVodLoadInput) {
        return;
      }

      try {
        const homeVodSections = await loadHomeVodSections({
          ...homeVodLoadInput,
          limitPerSection: homeVodLimitPerSection,
          preferFresh: true,
        });

        if (!isMounted) {
          return;
        }

        const safeHomeVodSections =
          filterRenderableVodHomeSections(homeVodSections);
        const nextSections =
          mapHomeVodSectionsToCatalogSections(safeHomeVodSections);

        setRealCatalogSections(nextSections.length > 0 ? nextSections : null);
      } catch (error) {
        spatialDebug(
          'catalog-grid',
          'Falha ao atualizar Home apos warmup TMDB:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    function handleWarmupRefresh() {
      if (refreshTimeoutId !== null) {
        window.clearTimeout(refreshTimeoutId);
      }

      refreshTimeoutId = window.setTimeout(() => {
        refreshTimeoutId = null;
        void refreshHomeAfterWarmup();
      }, WARMUP_HOME_REFRESH_DEBOUNCE_MS);
    }

    window.addEventListener(CATALOG_WARMUP_REFRESH_EVENT, handleWarmupRefresh);

    return () => {
      isMounted = false;
      window.removeEventListener(
        CATALOG_WARMUP_REFRESH_EVENT,
        handleWarmupRefresh,
      );

      if (refreshTimeoutId !== null) {
        window.clearTimeout(refreshTimeoutId);
      }
    };
  }, [homeVodLimitPerSection, initialHomeCatalogState]);

  useEffect(() => {
    if (!isTv) {
      setVisibleSectionCount(resolvedCatalogSections.length);
      return;
    }

    if (wasInitialCatalogHydratedFromCache) {
      setVisibleSectionCount(resolvedCatalogSections.length);
      return;
    }

    setVisibleSectionCount(INITIAL_TV_VISIBLE_SECTIONS);

    const timer = window.setTimeout(() => {
      setVisibleSectionCount(resolvedCatalogSections.length);
    }, TV_REMAINING_SECTIONS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    isTv,
    resolvedCatalogSections.length,
    wasInitialCatalogHydratedFromCache,
  ]);

  const visibleCatalogSections = useMemo(
    () => resolvedCatalogSections.slice(0, visibleSectionCount),
    [resolvedCatalogSections, visibleSectionCount],
  );

  const isProgressiveLoading =
    isTv && visibleSectionCount < resolvedCatalogSections.length;

  const shouldShowInitialCatalogLoading =
    isRealCatalogLoading &&
    !resolvedCatalogSections.length &&
    !realCatalogSections?.length;
  const isCompactFireStickHero = useMemo(
    () => isTv && isFireStickUserAgent(),
    [isTv],
  );

  const heroItems = useMemo(() => {
    const uniqueItems = new Map<string, CatalogPageSection['items'][number]>();

    for (const section of resolvedCatalogSections) {
      for (const item of section.items) {
        if (!item.title) {
          continue;
        }

        if (!uniqueItems.has(item.id)) {
          uniqueItems.set(item.id, item);
        }
      }
    }

    return Array.from(uniqueItems.values())
      .sort((firstItem, secondItem) => {
        return Number(Boolean(secondItem.backdropUrl)) - Number(Boolean(firstItem.backdropUrl));
      })
      .slice(0, 5);
  }, [resolvedCatalogSections]);

  useEffect(() => {
    setActiveHeroIndex(0);
  }, [heroItems.length]);

  useEffect(() => {
    if (heroItems.length <= 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActiveHeroIndex((currentIndex) => {
        return (currentIndex + 1) % heroItems.length;
      });
    }, 9000);

    return () => window.clearTimeout(timer);
  }, [activeHeroIndex, heroItems.length]);

  const heroItem = heroItems[activeHeroIndex] ?? null;

  function handlePreviousHeroItem() {
    if (heroItems.length <= 1) {
      return;
    }

    setActiveHeroIndex((currentIndex) => {
      return (currentIndex - 1 + heroItems.length) % heroItems.length;
    });
  }

  function handleNextHeroItem() {
    if (heroItems.length <= 1) {
      return;
    }

    setActiveHeroIndex((currentIndex) => {
      return (currentIndex + 1) % heroItems.length;
    });
  }

  useRouteInitialFocus();

  const spatialNavigation = useCatalogGridNavigation({
    sections: resolvedCatalogSections,
  });
  return (
    <AppShell
      onSignOut={() => void signOut()}
      headerNavigation={{
        onSearchArrowPress: spatialNavigation.handleHeaderSearchArrowPress,
        onProfileArrowPress: spatialNavigation.handleHeaderProfileArrowPress,
        onLogoutArrowPress: spatialNavigation.handleHeaderLogoutArrowPress,
      }}
      mainClassName="xf-tv-safe-main px-3 pb-24 md:px-7 md:pb-9 lg:px-8 xl:px-10"
    >
      <section className="mx-auto w-full max-w-[1920px]">

        <CatalogHero
          title={heroItem?.title}
          description={
            heroItem?.overview ??
            heroItem?.subtitle ??
            'Conteudos recomendados para sua licenca.'
          }
          posterUrl={heroItem?.backdropUrl ?? heroItem?.posterUrl}
          onSectionArrowPress={spatialNavigation.handleHeroSectionArrowPress}
          onPlayArrowPress={spatialNavigation.handleHeroPlayArrowPress}
          onInfoArrowPress={spatialNavigation.handleHeroInfoArrowPress}
          isCompactTvHero={isCompactFireStickHero}

          heroIndex={activeHeroIndex}

          heroTotal={heroItems.length}

          onPreviousHeroItem={handlePreviousHeroItem}

          onNextHeroItem={handleNextHeroItem}
        />

        {shouldShowInitialCatalogLoading ? (
          <section className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-8">
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
        ) : visibleCatalogSections.length === 0 ? (
          <section className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-10 text-center">
            <p className="text-[0.72rem] font-black uppercase tracking-[0.26em] text-xf-red">
              Catalogo indisponivel
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              Nenhuma secao foi carregada para a Home neste momento.
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
                className="mb-6 border-0 bg-transparent px-0 py-0"
                onArrowPress={(direction) =>
                  spatialNavigation.handleCategorySectionArrowPress(
                    direction,
                    categoryIndex,
                  )
                }
              >
                <div className="mb-2 flex items-end justify-between gap-4 px-0.5">
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

                  {shouldShowSeeAll(section) && !isMobile && (
                    <FocusableButton
                      focusKey={getCategorySeeAllFocusKey(section.id)}
                      className="inline-flex rounded-full border border-white/20 bg-xf-surface px-5 py-3 text-sm font-bold text-white"
                      onClick={() => {
                        spatialDebug('catalog-grid', 'Ver tudo:', section.title);

                        if (section.id === 'home-vod-launches') {
                          navigate('/launches');
                        } else if (section.id.startsWith('home-vod-movie-category-')) {
                          const slug = getSlugByGroupTitle(section.title);
                          navigate(`/category/${slug}`);
                        }
                      }}
                      onEnterPress={() => {
                        spatialDebug('catalog-grid', 'Ver tudo:', section.title);

                        if (section.id === 'home-vod-launches') {
                          navigate('/launches');
                        } else if (section.id.startsWith('home-vod-movie-category-')) {
                          const slug = getSlugByGroupTitle(section.title);
                          navigate(`/category/${slug}`);
                        }
                      }}
                      onArrowPress={(direction) =>
                        spatialNavigation.handleCategorySeeAllArrowPress(
                          direction,
                          categoryIndex,
                        )
                      }
                    >
                      Ver tudo
                    </FocusableButton>
                  )}
                </div>

                {sectionItems.length > 0 ? (
                  <div className="xf-carousel-row flex gap-2 overflow-x-auto overflow-y-visible pb-6 pr-10 scroll-auto md:gap-2.5 lg:gap-3">
                    {sectionItems.map((item, itemIndex) => (
                      <MediaCard
                        key={item.id}
                        title={item.title}
                        subtitle={item.subtitle}
                        posterUrl={item.posterUrl}
                        eagerLoad={true}
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

                          const itemStreamUrl =
                            'streamUrl' in catalogItem && typeof catalogItem.streamUrl === 'string'
                              ? catalogItem.streamUrl
                              : undefined;

                          if (!itemStreamUrl) {
                            return;
                          }

                          const params = new URLSearchParams({
                            src: itemStreamUrl,
                            title: catalogItem.title,
                          });

                          params.set('direct', '1');

                          navigate(`/player?${params.toString()}`);
                        }}
                        onArrowPress={(direction) => {
                          const isLaunchesSection =
                            section.id === 'home-vod-launches';
                          const isLastVisibleLaunchCard =
                            itemIndex === sectionItems.length - 1;

                          if (
                            isLaunchesSection &&
                            direction === 'right' &&
                            isLastVisibleLaunchCard
                          ) {
                            setFocus(getCategorySeeAllFocusKey(section.id));
                            return false;
                          }

                          if (isLaunchesSection && direction === 'up') {
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
