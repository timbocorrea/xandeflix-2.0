import { useEffect, useMemo, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useNavigate, useParams } from 'react-router-dom';

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
  loadHomeVodCategoryItems,
  type HomeVodItem,
} from '../services/homeVod.service';

const GRID_COLUMNS = 5;
const INITIAL_VISIBLE_ITEMS = 60;
const VISIBLE_ITEMS_INCREMENT = 40;
const CATEGORY_ITEM_LIMIT = 800;
const CATEGORY_ITEM_FOCUS_PREFIX = 'category-grid-item';

type CatalogCategoryPageProps = {
  groupSlugOverride?: string;
};

function getCategoryItemFocusKey(categorySlug: string, index: number) {
  return `${CATEGORY_ITEM_FOCUS_PREFIX}-${categorySlug}-${index}`;
}

function resolveVisibleCount(totalItems: number) {
  return Math.min(totalItems, INITIAL_VISIBLE_ITEMS);
}

export function CatalogCategoryPage({
  groupSlugOverride,
}: CatalogCategoryPageProps = {}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const category = useMemo<CatalogCategoryDefinition | null>(
    () =>
      getCatalogCategoryDefinition(groupSlugOverride ?? params.groupSlug),
    [groupSlugOverride, params.groupSlug],
  );
  const [items, setItems] = useState<HomeVodItem[]>([]);
  const [visibleItemCount, setVisibleItemCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCategoryItems() {
      setIsLoading(true);
      setErrorMessage(null);
      setItems([]);
      setVisibleItemCount(0);

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
        const nextItems = await loadHomeVodCategoryItems({
          licenseCode,
          deviceIdentifier,
          groupTitles: category.groupTitles,
          limit: CATEGORY_ITEM_LIMIT,
        });

        if (!isMounted) {
          return;
        }

        setItems(nextItems);
        setVisibleItemCount(resolveVisibleCount(nextItems.length));
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
  }, [category]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleItemCount),
    [items, visibleItemCount],
  );

  useEffect(() => {
    if (!category || visibleItems.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setFocus(getCategoryItemFocusKey(category.slug, 0));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [category, visibleItems.length]);

  useEffect(() => {
    function goBackToHome() {
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

        {isLoading ? (
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
                onEnterPress={() => {
                  spatialDebug('catalog-grid', 'Abrir categoria:', item.title);

                  if (!item.streamUrl) {
                    return;
                  }

                  const params = new URLSearchParams({
                    src: item.streamUrl,
                    title: item.title,
                  });

                  navigate(`/player?${params.toString()}`);
                }}
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
        )}
      </main>
    </AppShell>
  );
}
