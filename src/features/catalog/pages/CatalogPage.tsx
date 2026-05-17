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
import {
  getCatalogBackdropUrl,
  getCatalogOverview,
  getCatalogPosterUrl,
} from '@/features/catalog/lib/catalogVisuals';
import { buildCatalogSectionsFromIptvChannels } from '@/features/catalog/lib/iptvChannelsToCatalog';
import { prepareHomePlaylist } from '@/features/catalog/services/prepareHomePlaylist.service';
import { enrichCatalogSectionsWithTmdb } from '@/features/catalog/services/tmdbCatalog.service';
import { usePlaylistRuntime } from '@/features/playlists/providers/PlaylistRuntimeProvider';
import type { CatalogItem, CatalogSection } from '@/features/catalog/types';

import { catalogSections } from '../data/catalogSections';

const INITIAL_TV_VISIBLE_SECTIONS = 1;
const INITIAL_TV_VISIBLE_ITEMS_PER_SECTION = 5;
const TV_REMAINING_SECTIONS_DELAY_MS = 1500;
const SECTION_LOADING_CARD_COUNT = 4;

function shouldShowSeeAll(section: { showSeeAll?: boolean }) {
  return Boolean(section.showSeeAll);
}

function getFirstFeaturedItem(items: CatalogItem[]) {
  return (
    items.find((item) => getCatalogBackdropUrl(item) || getCatalogPosterUrl(item)) ||
    items[0] ||
    null
  );
}

function hasCatalogVisual(item: CatalogItem) {
  return Boolean(getCatalogBackdropUrl(item) || getCatalogPosterUrl(item));
}

function keepSectionsWithVisualItems(sections: CatalogSection[]) {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(hasCatalogVisual),
    }))
    .filter((section) => section.items.length > 0);
}

function findCatalogItemById(sections: CatalogSection[], itemId: string | null) {
  if (!itemId) {
    return null;
  }

  for (const section of sections) {
    const item = section.items.find((sectionItem) => sectionItem.id === itemId);

    if (item) {
      return item;
    }
  }

  return null;
}

export function CatalogPage() {
  const { signOut } = useAuth();
  const { isTv, isMobile } = useDeviceType();
  const {
    channels,
    status: playlistStatus,
    loadFromSource,
    loadFromChannels,
  } = usePlaylistRuntime();
  const [tmdbCatalogSections, setTmdbCatalogSections] = useState<
    CatalogSection[]
  >([]);
  const [tmdbStatus, setTmdbStatus] = useState<'idle' | 'loading' | 'ready'>(
    'idle',
  );
  const [featuredItemId, setFeaturedItemId] = useState<string | null>(null);
  const [homePlaylistFailed, setHomePlaylistFailed] = useState(false);

  const rawCatalogSections = useMemo(
    () => buildCatalogSectionsFromIptvChannels(channels),
    [channels],
  );
  const isPlaylistSettled =
    playlistStatus === 'ready' ||
    playlistStatus === 'empty' ||
    playlistStatus === 'error';
  const enrichedCatalogSections =
    tmdbCatalogSections.length > 0 ? tmdbCatalogSections : rawCatalogSections;
  const visualCatalogSections = useMemo(
    () => keepSectionsWithVisualItems(enrichedCatalogSections),
    [enrichedCatalogSections],
  );
  const realCatalogSections =
    isPlaylistSettled && tmdbStatus !== 'loading' ? visualCatalogSections : [];

  const hasRealCatalogSections = realCatalogSections.length > 0;
  const isPlaylistRuntimeLoading = playlistStatus === 'loading';
  const isPlaylistRuntimeEmpty = channels.length === 0 && !hasRealCatalogSections;
  const shouldUseDemoCatalogSections =
    !hasRealCatalogSections &&
    !isPlaylistRuntimeLoading &&
    (playlistStatus === 'error' || homePlaylistFailed);

  const resolvedCatalogSections = shouldUseDemoCatalogSections
    ? catalogSections
    : realCatalogSections;

  const [visibleSectionCount, setVisibleSectionCount] = useState(
    isTv ? INITIAL_TV_VISIBLE_SECTIONS : resolvedCatalogSections.length,
  );

  useEffect(() => {
    let cancelled = false;

    if (rawCatalogSections.length === 0) {
      setTmdbCatalogSections([]);
      setTmdbStatus('idle');
      return () => {
        cancelled = true;
      };
    }

    if (!isPlaylistSettled) {
      setTmdbStatus('loading');
      return () => {
        cancelled = true;
      };
    }

    setTmdbStatus('loading');

    void enrichCatalogSectionsWithTmdb(rawCatalogSections)
      .then((enrichedSections) => {
        if (cancelled) {
          return;
        }

        setTmdbCatalogSections(enrichedSections);
        setTmdbStatus('ready');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        spatialDebug(
          'catalog-grid',
          'Falha ao enriquecer catalogo com TMDB:',
          error instanceof Error ? error.message : error,
        );
        setTmdbCatalogSections(rawCatalogSections);
        setTmdbStatus('ready');
      });

    return () => {
      cancelled = true;
    };
  }, [isPlaylistSettled, rawCatalogSections]);

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

  useEffect(() => {
    if (homePlaylistFailed) {
      return;
    }

    if (channels.length > 0) {
      return;
    }

    if (playlistStatus === 'loading' || playlistStatus === 'ready') {
      return;
    }

    void prepareHomePlaylist({
      currentChannelsCount: channels.length,
      currentStatus: playlistStatus,
      loadFromSource,
      loadFromChannels,
      allowDirectFallback: false,
    }).catch((error) => {
      setHomePlaylistFailed(true);
      spatialDebug(
        'catalog-grid',
        'Falha ao carregar lista autorizada para a Home:',
        error instanceof Error ? error.message : error,
      );
    });
  }, [
    channels.length,
    homePlaylistFailed,
    playlistStatus,
    loadFromChannels,
    loadFromSource,
  ]);

  const visibleCatalogSections = useMemo(
    () => resolvedCatalogSections.slice(0, visibleSectionCount),
    [resolvedCatalogSections, visibleSectionCount],
  );
  const featuredSection = useMemo(
    () => resolvedCatalogSections.find((section) => section.items.length > 0) ?? null,
    [resolvedCatalogSections],
  );
  const firstFeaturedItem = useMemo(
    () => (featuredSection ? getFirstFeaturedItem(featuredSection.items) : null),
    [featuredSection],
  );

  useEffect(() => {
    if (!firstFeaturedItem) {
      setFeaturedItemId(null);
      return;
    }

    setFeaturedItemId((currentItemId) => {
      if (findCatalogItemById(resolvedCatalogSections, currentItemId)) {
        return currentItemId;
      }

      return firstFeaturedItem.id;
    });
  }, [firstFeaturedItem, resolvedCatalogSections]);

  const featuredItem = useMemo(
    () =>
      findCatalogItemById(resolvedCatalogSections, featuredItemId) ??
      firstFeaturedItem,
    [featuredItemId, firstFeaturedItem, resolvedCatalogSections],
  );
  const totalVisibleItems = useMemo(
    () =>
      visibleCatalogSections.reduce((total, section) => total + section.items.length, 0),
    [visibleCatalogSections],
  );

  const isProgressiveLoading =
    isTv && visibleSectionCount < resolvedCatalogSections.length;

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
      mainClassName="px-4 pb-28 md:px-8 md:pb-10 lg:px-10"
    >
      <section className="mx-auto w-full max-w-[1680px]">
        <CatalogHero
          title={featuredItem?.title}
          description={featuredSection?.description}
          overview={featuredItem ? getCatalogOverview(featuredItem) : undefined}
          posterUrl={featuredItem ? getCatalogPosterUrl(featuredItem) : undefined}
          backdropUrl={featuredItem ? getCatalogBackdropUrl(featuredItem) : undefined}
          year={featuredItem?.year}
          rating={featuredItem?.rating}
          genres={featuredItem?.genres}
          mediaType={featuredItem?.mediaType}
          eyebrow={featuredSection?.eyebrow || 'Inicio'}
          stats={[
            {
              label: 'Secoes',
              value: String(visibleCatalogSections.length),
            },
            {
              label: 'Titulos',
              value: String(totalVisibleItems),
            },
            {
              label: 'Origem',
              value: hasRealCatalogSections
                ? 'Lista IPTV'
                : shouldUseDemoCatalogSections
                  ? 'Demo local'
                  : 'Carregando',
            },
            {
              label: 'Status',
              value: hasRealCatalogSections
                ? tmdbStatus === 'loading'
                  ? 'Buscando TMDB'
                  : 'Conteudo real'
                : playlistStatus,
            },
          ]}
          onSectionArrowPress={spatialNavigation.handleHeroSectionArrowPress}
          onPlayArrowPress={spatialNavigation.handleHeroPlayArrowPress}
          onInfoArrowPress={spatialNavigation.handleHeroInfoArrowPress}
        />

        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 md:px-5">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.26em] text-zinc-300">
            {hasRealCatalogSections
              ? 'Catalogo da sua lista'
              : shouldUseDemoCatalogSections
                ? 'Catalogo premium'
                : 'Atualizando sua lista'}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {shouldUseDemoCatalogSections
              ? 'Nao foi possivel carregar sua lista agora. Exibindo vitrine local temporaria.'
              : hasRealCatalogSections
                ? 'Conteudo carregado da lista IPTV autorizada para esta licenca.'
                : 'Carregando conteudos da sua lista IPTV autorizada...'}
          </p>
        </div>

        {visibleCatalogSections.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-black/40 px-6 py-10 text-center">
            <p className="text-[0.72rem] font-black uppercase tracking-[0.26em] text-xf-red">
              {isPlaylistRuntimeLoading || isPlaylistRuntimeEmpty
                ? 'Carregando sua lista'
                : 'Catalogo indisponivel'}
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              {isPlaylistRuntimeLoading || isPlaylistRuntimeEmpty
                ? 'A Home esta buscando conteudos reais da sua lista autorizada.'
                : 'Nenhuma secao foi carregada para a Home neste momento.'}
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

            return (
              <FocusableSection
                key={section.id}
                focusKey={getCategorySectionFocusKey(section.id)}
                className="mb-10 rounded-2xl border border-white/10 bg-black/45 px-4 py-5 md:px-5 md:py-6"
                onArrowPress={(direction) =>
                  spatialNavigation.handleCategorySectionArrowPress(
                    direction,
                    categoryIndex,
                  )
                }
              >
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.32em] text-xf-red">
                      {sectionEyebrow}
                    </p>

                    <h2 className="mt-2 text-2xl font-black text-white md:text-4xl">
                      {section.title}
                    </h2>

                    <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                      {section.description ||
                        'Selecao pronta para navegacao rapida na tela principal.'}
                    </p>
                  </div>

                  <div className="hidden rounded-xl border border-white/15 bg-white/5 px-3 py-2 md:block">
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      Itens visiveis
                    </p>
                    <p className="text-lg font-black text-white">
                      {sectionItems.length}
                    </p>
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
                  <div className="xf-carousel-row flex gap-4 overflow-x-auto overflow-y-visible pb-6 pr-8 scroll-smooth md:gap-5">
                    {sectionItems.map((item, itemIndex) => (
                      <MediaCard
                        key={item.id}
                        title={item.title}
                        subtitle={item.subtitle || getCatalogOverview(item)}
                        posterUrl={getCatalogPosterUrl(item)}
                        year={item.year}
                        rating={item.rating}
                        genres={item.genres}
                        mediaType={item.mediaType}
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
                    className="h-[16rem] w-[11rem] shrink-0 animate-pulse rounded-2xl border border-white/10 bg-white/5"
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
