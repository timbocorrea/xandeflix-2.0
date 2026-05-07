import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
import { listCatalogChannelSections } from '../services/catalogChannels.service';
import type { CatalogSection } from '../types';
import {
  getCategoryItemFocusKey,
  getCategorySectionFocusKey,
  getCategorySeeAllFocusKey,
} from '../../../lib/spatial/categoryFocusKeys';
import { spatialDebug } from '@/lib/spatial/spatialDebug';

const INITIAL_TV_VISIBLE_SECTIONS = 1;
const INITIAL_TV_VISIBLE_ITEMS_PER_SECTION = 5;
const TV_REMAINING_SECTIONS_DELAY_MS = 1500;

export function CatalogPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isTv, isMobile } = useDeviceType();

  const [dynamicSections, setDynamicSections] =
    useState<CatalogSection[]>(catalogSections);
  const [visibleSectionCount, setVisibleSectionCount] = useState(
    isTv ? INITIAL_TV_VISIBLE_SECTIONS : catalogSections.length,
  );

  useEffect(() => {
    let isMounted = true;

    async function loadCatalogSections() {
      try {
        const channelSections = await listCatalogChannelSections();

        if (!isMounted) {
          return;
        }

        setDynamicSections(
          channelSections.length > 0 ? channelSections : catalogSections,
        );
      } catch {
        if (isMounted) {
          setDynamicSections(catalogSections);
        }
      }
    }

    void loadCatalogSections();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isTv) {
      setVisibleSectionCount(dynamicSections.length);
      return;
    }

    setVisibleSectionCount(INITIAL_TV_VISIBLE_SECTIONS);

    const timer = window.setTimeout(() => {
      setVisibleSectionCount(dynamicSections.length);
    }, TV_REMAINING_SECTIONS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isTv, dynamicSections.length]);

  const visibleCatalogSections = useMemo(
    () => dynamicSections.slice(0, visibleSectionCount),
    [dynamicSections, visibleSectionCount],
  );

  useRouteInitialFocus();

  const gridClassName = isTv
    ? 'grid-cols-5'
    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5';

  const columnsPerRow = isTv ? 5 : isMobile ? 2 : 5;

  const spatialNavigation = useCatalogGridNavigation({
    columnsPerRow,
    sections: dynamicSections,
  });

  return (
    <AppShell
      userEmail={user?.email}
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
          visibleSectionCount < dynamicSections.length &&
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

              {section.showSeeAll && !isMobile && !isTv && (
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

            <div className={`grid gap-4 md:gap-5 ${gridClassName}`}>
              {sectionItems.map((item, itemIndex) => (
                <MediaCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  index={itemIndex}
                  focusKey={getCategoryItemFocusKey(section.id, itemIndex)}
                  onEnterPress={() => {
                    spatialDebug('catalog-grid', 'Abrir item:', item.title);

                    if (item.streamUrl) {
                      const params = new URLSearchParams({
                        src: item.streamUrl,
                        title: item.title,
                      });

                      navigate(`/player?${params.toString()}`);
                    }
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
