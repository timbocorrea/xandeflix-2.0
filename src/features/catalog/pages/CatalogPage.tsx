import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../../components/layout/AppShell';
import { CatalogHero } from '../../../components/media/CatalogHero';
import { MediaCard } from '../../../components/media/MediaCard';
import { FocusableButton } from '../../../components/tv/FocusableButton';
import { FocusableSection } from '../../../components/tv/FocusableSection';
import { useDeviceType } from '../../../hooks/useDeviceType';
import { useAuth } from '../../../app/providers/AuthProvider';
import { useRouteInitialFocus } from '../../../hooks/useRouteInitialFocus';
import { useCatalogGridNavigation } from '../../../hooks/useCatalogGridNavigation';
import { catalogSections } from '../data/catalogSections';
import {
  getCategoryItemFocusKey,
  getCategorySectionFocusKey,
  getCategorySeeAllFocusKey,
} from '../../../lib/spatial/categoryFocusKeys';
import { spatialDebug } from '@/lib/spatial/spatialDebug';

const INITIAL_TV_VISIBLE_SECTIONS = 1;
const INITIAL_TV_VISIBLE_ITEMS_PER_SECTION = 5;
const TV_REMAINING_SECTIONS_DELAY_MS = 1500;

function shouldShowSeeAll(section: unknown) {
  return Boolean(
    section &&
      typeof section === 'object' &&
      'showSeeAll' in section &&
      (section as { showSeeAll?: unknown }).showSeeAll,
  );
}

function getCatalogItemPosterUrl(item: unknown) {
  if (!item || typeof item !== 'object' || !('posterUrl' in item)) {
    return undefined;
  }

  const posterUrl = (item as { posterUrl?: unknown }).posterUrl;

  return typeof posterUrl === 'string' ? posterUrl : undefined;
}

export function CatalogPage() {
  const { signOut } = useAuth();
  const { isTv, isMobile } = useDeviceType();
  const resolvedCatalogSections = catalogSections;

  const [visibleSectionCount, setVisibleSectionCount] = useState(
    isTv ? INITIAL_TV_VISIBLE_SECTIONS : resolvedCatalogSections.length,
  );

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
  }, [isTv]);

  const visibleCatalogSections = useMemo(
    () => resolvedCatalogSections.slice(0, visibleSectionCount),
    [resolvedCatalogSections, visibleSectionCount],
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
    >
      <CatalogHero
        onSectionArrowPress={spatialNavigation.handleHeroSectionArrowPress}
        onPlayArrowPress={spatialNavigation.handleHeroPlayArrowPress}
        onInfoArrowPress={spatialNavigation.handleHeroInfoArrowPress}
      />

      {visibleCatalogSections.map((section, categoryIndex) => {
        const sectionItems =
          isTv &&
          visibleSectionCount < resolvedCatalogSections.length &&
          categoryIndex === 0
            ? section.items.slice(0, INITIAL_TV_VISIBLE_ITEMS_PER_SECTION)
            : section.items;

        const eyebrow =
          section.id === 'continue-watching'
            ? isMobile
              ? 'Mobile'
              : isTv
                ? 'TV Mode'
                : 'Web'
            : section.eyebrow;

        return (
          <FocusableSection
            key={section.id}
            focusKey={getCategorySectionFocusKey(section.id)}
            className="mb-12"
            onArrowPress={(direction) =>
              spatialNavigation.handleCategorySectionArrowPress(
                direction,
                categoryIndex,
              )
            }
          >
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-xf-red">
                  {eyebrow}
                </p>

                <h2 className="mt-1 text-2xl font-black text-white md:text-4xl">
                  {section.title}
                </h2>
              </div>

              {shouldShowSeeAll(section) && !isMobile && !isTv && (
                <FocusableButton
                  focusKey={getCategorySeeAllFocusKey(section.id)}
                  className="inline-flex rounded-full bg-xf-surface px-5 py-3 text-sm font-bold text-white"
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

            <div className="xf-carousel-row flex gap-4 overflow-x-auto overflow-y-visible pb-6 pr-8 scroll-smooth md:gap-5">
              {sectionItems.map((item, itemIndex) => (
                <MediaCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  posterUrl={getCatalogItemPosterUrl(item)}
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
          </FocusableSection>
        );
      })}
    </AppShell>
  );
}
