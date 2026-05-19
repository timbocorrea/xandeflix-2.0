import { useEffect, useMemo, useState } from 'react';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';

import { useAuth } from '../../../app/providers/AuthProvider';
import { AppShell } from '../../../components/layout/AppShell';
import { MediaCard } from '../../../components/media/MediaCard';
import { getStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';
import { spatialDebug } from '@/lib/spatial/spatialDebug';

import {
  loadHomeVodSections,
  type HomeVodItem,
} from '../services/homeVod.service';

const GRID_COLUMNS = 5;
const LAUNCH_ITEM_FOCUS_PREFIX = 'launches-grid-item';

function getLaunchItemFocusKey(index: number) {
  return `${LAUNCH_ITEM_FOCUS_PREFIX}-${index}`;
}

function getLaunchItems(
  sections: Awaited<ReturnType<typeof loadHomeVodSections>>,
) {
  const launchesSection = sections.find(
    (section) => section.id === 'home-vod-launches',
  );

  return launchesSection?.items ?? [];
}

export function CatalogLaunchesPage() {
  const { signOut } = useAuth();
  const [items, setItems] = useState<HomeVodItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadLaunches() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const storedActivation = getStoredLicenseActivation();
        const licenseCode = storedActivation?.licenseCode?.trim();

        if (!licenseCode) {
          setItems([]);
          return;
        }

        const deviceIdentifier =
          storedActivation?.deviceIdentifier || getOrCreateDeviceIdentifier();

        const sections = await loadHomeVodSections({
          licenseCode,
          deviceIdentifier,
          limitPerSection: 200,
          launchesLimit: 200,
        });

        if (!isMounted) {
          return;
        }

        setItems(getLaunchItems(sections));
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar os lançamentos.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadLaunches();

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleItems = useMemo(() => items, [items]);

  useEffect(() => {
    if (visibleItems.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setFocus(getLaunchItemFocusKey(0));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [visibleItems.length]);

  function handleLaunchCardArrowPress(direction: string, index: number) {
    const isFirstColumn = index % GRID_COLUMNS === 0;
    const isLastColumn = index % GRID_COLUMNS === GRID_COLUMNS - 1;
    const previousRowIndex = index - GRID_COLUMNS;
    const nextRowIndex = index + GRID_COLUMNS;

    if (direction === 'left') {
      if (isFirstColumn) {
        return false;
      }

      setFocus(getLaunchItemFocusKey(index - 1));
      return false;
    }

    if (direction === 'right') {
      if (isLastColumn || index + 1 >= visibleItems.length) {
        return false;
      }

      setFocus(getLaunchItemFocusKey(index + 1));
      return false;
    }

    if (direction === 'up') {
      if (previousRowIndex < 0) {
        return false;
      }

      setFocus(getLaunchItemFocusKey(previousRowIndex));
      return false;
    }

    if (direction === 'down') {
      if (nextRowIndex >= visibleItems.length) {
        return false;
      }

      setFocus(getLaunchItemFocusKey(nextRowIndex));
      return false;
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
            Catálogo
          </p>
          <h1 className="mt-2 text-[1.7rem] font-black tracking-[-0.03em] text-white md:text-[2.35rem]">
            Lançamentos
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-zinc-300">
            Todos os conteúdos disponíveis na categoria Lançamentos da sua lista IPTV.
          </p>
        </header>

        {isLoading ? (
          <section className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-zinc-300">
              Carregando lançamentos...
            </p>
          </section>
        ) : errorMessage ? (
          <section className="rounded-[0.18rem] border border-red-500/30 bg-red-500/10 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-red-100">{errorMessage}</p>
          </section>
        ) : visibleItems.length === 0 ? (
          <section className="rounded-[0.18rem] border border-white/10 bg-black/40 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-zinc-300">
              Nenhum lançamento encontrado neste momento.
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
                index={index}
                focusKey={getLaunchItemFocusKey(index)}
                onEnterPress={() => {
                  spatialDebug('catalog-grid', 'Abrir lançamento:', item.title);
                }}
                onArrowPress={(direction: string) =>
                  handleLaunchCardArrowPress(direction, index)
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
