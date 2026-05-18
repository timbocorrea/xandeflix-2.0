import { useEffect, useMemo, useState } from 'react';

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
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';

import { catalogSections } from '../data/catalogSections';
import {
  loadHomeVodSections,
  type HomeVodSection,
} from '../services/homeVod.service';

const INITIAL_TV_VISIBLE_SECTIONS = 1;
const INITIAL_TV_VISIBLE_ITEMS_PER_SECTION = 5;
const TV_REMAINING_SECTIONS_DELAY_MS = 1500;
const SECTION_LOADING_CARD_COUNT = 4;

type CatalogPageSection = (typeof catalogSections)[number];

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
    showSeeAll: false,
    items: section.items.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      posterUrl: item.posterUrl,
    })),
  }));
}

export function CatalogPage() {
  const { signOut } = useAuth();
  const { isTv, isMobile } = useDeviceType();
  const [realCatalogSections, setRealCatalogSections] = useState<
    CatalogPageSection[] | null
  >(null);
  const [, setIsRealCatalogLoading] = useState(true);

  const resolvedCatalogSections = realCatalogSections?.length
    ? realCatalogSections
    : catalogSections;

  const [visibleSectionCount, setVisibleSectionCount] = useState(
    isTv ? INITIAL_TV_VISIBLE_SECTIONS : resolvedCatalogSections.length,
  );

  useEffect(() => {
    let isMounted = true;

    async function loadRealCatalog() {
      setIsRealCatalogLoading(true);

      try {
        const storedActivation = getStoredLicenseActivation();
        const licenseCode = storedActivation?.licenseCode?.trim();

        if (!licenseCode) {
          setRealCatalogSections(null);
          return;
        }

        const deviceIdentifier =
          storedActivation?.deviceIdentifier || getOrCreateDeviceIdentifier();

        const homeVodSections = await loadHomeVodSections({
          licenseCode,
          deviceIdentifier,
          limitPerSection: isTv ? 12 : 20,
        });

        if (!isMounted) {
          return;
        }

        const nextSections =
          mapHomeVodSectionsToCatalogSections(homeVodSections);

        setRealCatalogSections(nextSections.length > 0 ? nextSections : null);
      } catch (error) {
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
  }, [isTv]);

  useEffect(() => {
    if (!isTv) {
      setVisibleSectionCount(resolvedCatalogSections.length);
      return;
    }

    setVisibleSectionCount(INITIAL_TV_VISIBLE_SECTIONS);

    const timer = window.setTimeout(() => {
      setVisibleSectionCount(resolvedCatalogSections.length);
    }, TV_REMAINING_SECTIONS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isTv, resolvedCatalogSections.length]);

  const visibleCatalogSections = useMemo(
    () => resolvedCatalogSections.slice(0, visibleSectionCount),
    [resolvedCatalogSections, visibleSectionCount],
  );

  const isProgressiveLoading =
    isTv && visibleSectionCount < resolvedCatalogSections.length;
  const isCompactFireStickHero = useMemo(
    () => isTv && isFireStickUserAgent(),
    [isTv],
  );

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
          onSectionArrowPress={spatialNavigation.handleHeroSectionArrowPress}
          onPlayArrowPress={spatialNavigation.handleHeroPlayArrowPress}
          onInfoArrowPress={spatialNavigation.handleHeroInfoArrowPress}
          isCompactTvHero={isCompactFireStickHero}
        />

        {visibleCatalogSections.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-black/40 px-6 py-10 text-center">
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

                  {shouldShowSeeAll(section) && !isMobile && !isTv && (
                    <FocusableButton
                      focusKey={getCategorySeeAllFocusKey(section.id)}
                      className="inline-flex rounded-full border border-white/20 bg-xf-surface px-5 py-3 text-sm font-bold text-white"
                      onEnterPress={() => {
                        spatialDebug('catalog-grid', 'Ver tudo:', section.title);
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
                        index={itemIndex}
                        focusKey={getCategoryItemFocusKey(section.id, itemIndex)}
                        onEnterPress={() => {
                          spatialDebug('catalog-grid', 'Abrir item:', item.title);
                        }}
                        onArrowPress={(direction) =>
                          spatialNavigation.handleCategoryCardArrowPress(
                            direction,
                            categoryIndex,
                            itemIndex,
                          )
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-5">
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
          <section className="mb-8 rounded-2xl border border-white/10 bg-black/35 px-4 py-5 md:px-5 md:py-6">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.32em] text-zinc-300">
              Carregando mais secoes
            </p>

            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {Array.from({ length: SECTION_LOADING_CARD_COUNT }).map(
                (_, placeholderIndex) => (
                  <div
                    key={`catalog-loading-card-${placeholderIndex}`}
                    className="h-[14.5rem] w-[9.7rem] shrink-0 animate-pulse rounded-md border border-white/10 bg-white/5"
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
