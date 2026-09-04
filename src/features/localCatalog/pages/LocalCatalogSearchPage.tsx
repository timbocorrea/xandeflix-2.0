import {
  useEffect,
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { Search } from 'lucide-react';
import {
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { useAuth } from '@/app/providers/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { MediaCard } from '@/components/media/MediaCard';
import { FocusableButton } from '@/components/tv/FocusableButton';
import { FocusableSection } from '@/components/tv/FocusableSection';
import { usePlaylistRuntime } from '@/features/playlists/providers/PlaylistRuntimeProvider';
import { getSafeLocalCatalogArtworkUrl } from '../readModels/localCatalogHomeVodAdapter.service';
import {
  LOCAL_CATALOG_SEARCH_DEBOUNCE_MS,
  searchLocalCatalog,
  type LocalCatalogSearchPage,
  type LocalCatalogSearchResultItem,
} from '../readModels/localCatalogSearchReadModel.service';
import {
  buildLocalCatalogMovieDetailRoute,
  buildLocalCatalogSearchReturnTo,
  buildLocalCatalogSeriesDetailRoute,
  getLocalCatalogSearchResultFocusKey,
  LOCAL_CATALOG_SEARCH_INDEX_RETRY_FOCUS_KEY,
  LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY,
  LOCAL_CATALOG_SEARCH_QUERY_RETRY_FOCUS_KEY,
  createLocalCatalogSearchReturnCache,
  isLocalCatalogSearchReturnCacheMatch,
  replaceLocalCatalogSearchReturnCache,
  resolveLocalCatalogSearchNativeInputLifecycle,
  resolveLocalCatalogSearchViewState,
  resolveLocalCatalogSearchInputArrowPress,
  shouldInvalidateLocalCatalogSearchReturnCache,
  type LocalCatalogSearchNativeInputLifecycleEvent,
  type LocalCatalogSearchReturnCache,
} from '../lib/localCatalogSearchUiContract';

let localCatalogSearchReturnCache: LocalCatalogSearchReturnCache | null = null;

function getKindLabel(item: LocalCatalogSearchResultItem) {
  const labels = {
    movie: 'Filme',
    series: 'Série',
    series_episode: 'Episódio',
    live: 'Ao vivo',
    radio: 'Rádio',
    unknown: 'Conteúdo',
  } as const;

  return item.groupTitle
    ? `${labels[item.contentKind]} · ${item.groupTitle}`
    : labels[item.contentKind];
}

function getCardKind(
  item: LocalCatalogSearchResultItem,
): 'movie' | 'series' | 'unknown' {
  if (item.contentKind === 'movie' || item.contentKind === 'series') {
    return item.contentKind;
  }

  return 'unknown';
}

export default function LocalCatalogSearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { localCatalogScopeKey } = usePlaylistRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState<LocalCatalogSearchPage>(() => {
    if (
      isLocalCatalogSearchReturnCacheMatch({
        cache: localCatalogSearchReturnCache,
        scopeKey: localCatalogScopeKey,
        query: initialQuery,
      })
    ) {
      return localCatalogSearchReturnCache!.page;
    }

    return {
      status: 'empty_query',
      normalizedQuery: '',
      items: [],
      nextCursor: null,
    };
  });
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasLocalError, setHasLocalError] = useState(false);
  const [indexRefreshTick, setIndexRefreshTick] = useState(0);
  const requestIdRef = useRef(0);
  const inputElementRef = useRef<HTMLInputElement>(null);
  const focusNativeInputExplicitly = useCallback(() => {
    const lifecycle = resolveLocalCatalogSearchNativeInputLifecycle(
      'explicit_enter',
    );
    if (lifecycle.shouldFocusNativeInput) {
      inputElementRef.current?.focus();
    }
  }, []);
  const blurNativeInputForLifecycle = useCallback(
    (event: LocalCatalogSearchNativeInputLifecycleEvent) => {
      const lifecycle = resolveLocalCatalogSearchNativeInputLifecycle(event);
      if (lifecycle.shouldBlurNativeInput) {
        inputElementRef.current?.blur();
      }
    },
    [],
  );
  const {
    ref: inputFocusRef,
  } = useFocusable<object, HTMLInputElement>({
    focusKey: LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY,
    onEnterPress: focusNativeInputExplicitly,
    onArrowPress: (direction) => {
      const viewState = resolveLocalCatalogSearchViewState({
        query,
        isSearching,
        hasLocalError,
        status: page.status,
        itemCount: page.items.length,
        indexingInBackground: page.indexingInBackground,
      });
      const resolution = resolveLocalCatalogSearchInputArrowPress(
        direction,
        page.items.length > 0,
        {
          showIndexRetry: viewState.showIndexFailed,
          showQueryRetry: viewState.showError,
        },
      );

      if (!resolution.handled || !resolution.target) {
        return resolution.allowDefaultSpatialNavigation;
      }

      if (resolution.shouldBlurNativeInput) {
        blurNativeInputForLifecycle('arrow_down_exit');
      }
      setFocus(resolution.target);
      return resolution.allowDefaultSpatialNavigation;
    },
  });
  const setInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      inputElementRef.current = element;
      if (element) {
        inputFocusRef.current = element;
      }
    },
    [inputFocusRef],
  );

  useEffect(() => {
    setFocus(LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY);
    return () => blurNativeInputForLifecycle('unmount');
  }, [blurNativeInputForLifecycle]);

  useEffect(() => {
    if (
      isLocalCatalogSearchReturnCacheMatch({
        cache: localCatalogSearchReturnCache,
        scopeKey: localCatalogScopeKey,
        query,
      })
    ) {
      setPage(localCatalogSearchReturnCache!.page);
      setHasLocalError(false);
    }
  }, [localCatalogScopeKey, query]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (query.trim()) {
      nextParams.set('q', query);
    } else {
      nextParams.delete('q');
    }
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [query, searchParams, setSearchParams]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      const timeoutId = window.setTimeout(() => {
        setPage({
          status: 'empty_query',
          normalizedQuery: '',
          items: [],
          nextCursor: null,
        });
        setIsSearching(false);
        setHasLocalError(false);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (!localCatalogScopeKey) {
      const timeoutId = window.setTimeout(() => {
        console.info('[XANDEFLIX_SEARCH_SCOPE]', {
          present: false,
          unavailableReason: 'scope_missing',
        });
        setPage({
          status: 'unavailable',
          normalizedQuery: trimmedQuery,
          items: [],
          nextCursor: null,
        });
        setIsSearching(false);
        setHasLocalError(false);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      setIsSearching(true);
      setHasLocalError(false);
      const hasMatchingReturnCache = isLocalCatalogSearchReturnCacheMatch({
        cache: localCatalogSearchReturnCache,
        scopeKey: localCatalogScopeKey,
        query: trimmedQuery,
      });
      if (hasMatchingReturnCache) {
        setPage(localCatalogSearchReturnCache!.page);
      } else {
        setPage((current) => ({
          ...current,
          normalizedQuery: trimmedQuery,
          items: [],
          nextCursor: null,
        }));
      }
      void searchLocalCatalog({
        scopeKey: localCatalogScopeKey,
        query: trimmedQuery,
      })
        .then((result) => {
          if (requestIdRef.current === requestId) {
            const nextCache = createLocalCatalogSearchReturnCache({
              scopeKey: localCatalogScopeKey,
              query: trimmedQuery,
              page: result,
            });
            localCatalogSearchReturnCache = replaceLocalCatalogSearchReturnCache(
              localCatalogSearchReturnCache,
              nextCache ??
                (isLocalCatalogSearchReturnCacheMatch({
                  cache: localCatalogSearchReturnCache,
                  scopeKey: localCatalogScopeKey,
                  query: trimmedQuery,
                })
                  ? null
                  : localCatalogSearchReturnCache),
            );
            setPage(result);
          }
        })
        .catch(() => {
          if (requestIdRef.current === requestId) {
            setHasLocalError(true);
            if (
              shouldInvalidateLocalCatalogSearchReturnCache({
                cache: localCatalogSearchReturnCache,
                scopeKey: localCatalogScopeKey,
                query: trimmedQuery,
                hasError: true,
              })
            ) {
              localCatalogSearchReturnCache = replaceLocalCatalogSearchReturnCache(
                localCatalogSearchReturnCache,
                null,
              );
            }
            setPage((current) => ({
              ...current,
              items: [],
              nextCursor: null,
            }));
          }
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setIsSearching(false);
          }
        });
    }, LOCAL_CATALOG_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [indexRefreshTick, localCatalogScopeKey, query]);

  useEffect(() => {
    if (
      (page.status !== 'indexing' && !page.indexingInBackground) ||
      !query.trim()
    ) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setIndexRefreshTick((current) => current + 1);
    }, 1_000);
    return () => window.clearTimeout(timeoutId);
  }, [
    indexRefreshTick,
    page.indexingInBackground,
    page.status,
    query,
  ]);

  function openResult(item: LocalCatalogSearchResultItem) {
    blurNativeInputForLifecycle('open_result');
    const returnTo = buildLocalCatalogSearchReturnTo(
      location.pathname,
      location.search,
    );

    if (item.contentKind === 'movie') {
      navigate(buildLocalCatalogMovieDetailRoute(item), {
        state: {
          fromMoviesCategory: true,
          returnTo,
          selectedMovieItem: {
            id: item.id,
            title: item.title,
            groupTitle: item.groupTitle ?? undefined,
            subtitle: item.groupTitle ?? undefined,
            streamUrl: item.streamUrl,
            posterUrl: getSafeLocalCatalogArtworkUrl(item.artworkUrl),
            kind: 'movie',
          },
        },
      });
      return;
    }

    if (item.contentKind === 'series') {
      navigate(buildLocalCatalogSeriesDetailRoute(item), {
        state: {
          fromSeriesCategory: true,
          returnTo,
          selectedSeriesItem: {
            id: item.id,
            title: item.title,
            seriesKey: item.seriesKey,
            episodeCount: item.episodeCount,
            isSeriesCollection: item.isSeriesCollection,
            groupTitle: item.groupTitle ?? undefined,
            subtitle: item.groupTitle ?? undefined,
            posterUrl: getSafeLocalCatalogArtworkUrl(item.artworkUrl),
            kind: 'series',
          },
        },
      });
      return;
    }

    const params = new URLSearchParams({
      src: item.streamUrl,
      title: item.title,
      direct: '1',
    });
    if (item.contentKind === 'series_episode') {
      params.set('episodeId', item.id);
      if (item.groupTitle) params.set('seriesGroupTitle', item.groupTitle);
    }
    navigate(`/player?${params.toString()}`);
  }

  async function loadMore() {
    if (
      !localCatalogScopeKey ||
      !page.nextCursor ||
      isLoadingMore
    ) {
      return;
    }

    setIsLoadingMore(true);
    setHasLocalError(false);
    try {
      const nextPage = await searchLocalCatalog({
        scopeKey: localCatalogScopeKey,
        query,
        cursor: page.nextCursor,
      });
      setPage((current) => ({
        ...nextPage,
        items: [...current.items, ...nextPage.items],
      }));
      const combinedPage = {
        ...nextPage,
        items: [...page.items, ...nextPage.items],
      };
      const nextCache = createLocalCatalogSearchReturnCache({
        scopeKey: localCatalogScopeKey,
        query,
        page: combinedPage,
      });
      localCatalogSearchReturnCache = replaceLocalCatalogSearchReturnCache(
        localCatalogSearchReturnCache,
        nextCache,
      );
    } catch {
      setHasLocalError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

  function retryCurrentQuery() {
    setHasLocalError(false);
    setPage((current) => ({
      ...current,
      items: [],
      nextCursor: null,
    }));
    setIndexRefreshTick((current) => current + 1);
  }

  const viewState = resolveLocalCatalogSearchViewState({
    query,
    isSearching,
    hasLocalError,
    status: page.status,
    itemCount: page.items.length,
    indexingInBackground: page.indexingInBackground,
  });

  return (
    <AppShell
      onSignOut={() => {
        void signOut().finally(() => navigate('/login', { replace: true }));
      }}
    >
      <section className="mx-auto w-full max-w-7xl">
        <div className="pt-4 md:pt-8">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-xf-red">
            Catálogo deste dispositivo
          </p>
          <h1 className="mt-2 text-3xl font-black text-white md:text-5xl">
            Busca universal
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-xf-muted md:text-base">
            Encontre filmes, séries, episódios e canais já importados localmente.
          </p>
        </div>

        <div className="relative mt-6 max-w-3xl">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400"
            size={22}
          />
          <input
            ref={setInputRef}
            data-nav-id={LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            maxLength={120}
            aria-label="Buscar no catálogo local"
            placeholder="Digite para buscar"
            onChange={(event) => setQuery(event.target.value)}
            className="h-14 w-full rounded-2xl border border-white/15 bg-zinc-950 pl-12 pr-4 text-base font-semibold text-white outline-none transition focus:border-xf-red focus:ring-2 focus:ring-xf-red/40 md:h-16 md:text-lg"
          />
        </div>

        <div className="mt-8 min-h-52" aria-live="polite">
          {!query.trim() ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-xf-muted">
              Digite para buscar no catálogo local completo.
            </p>
          ) : null}

          {viewState.showSearching ? (
            <p className="text-sm font-semibold text-xf-muted">Buscando…</p>
          ) : null}

          {viewState.showIndexing ? (
            <p className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-6 text-sky-100">
              Preparando a busca local…
              {typeof page.indexedItems === 'number' &&
              typeof page.totalItems === 'number'
                ? ` Indexando ${page.indexedItems.toLocaleString('pt-BR')} de ${page.totalItems.toLocaleString('pt-BR')} itens.`
                : ''}
            </p>
          ) : null}

          {viewState.showIndexFailed ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-6 text-amber-100">
              <p>A preparação da busca local foi interrompida.</p>
              <FocusableButton
                focusKey={LOCAL_CATALOG_SEARCH_INDEX_RETRY_FOCUS_KEY}
                onClick={retryCurrentQuery}
                onEnterPress={retryCurrentQuery}
                onArrowPress={(direction) => {
                  if (direction === 'up') {
                    setFocus(LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY);
                    return false;
                  }
                  return true;
                }}
                className="mt-4 rounded-xl bg-white px-4 py-2 font-black text-black"
              >
                Retomar preparação
              </FocusableButton>
            </div>
          ) : null}

          {viewState.showUnavailable ? (
            <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-6 text-amber-100">
              O catálogo local ainda não está disponível para esta fonte.
            </p>
          ) : null}

          {viewState.showNoResults ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-xf-muted">
              Nenhum resultado encontrado.
            </p>
          ) : null}

          {viewState.showError ? (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-6 text-red-100">
              <p>Não foi possível consultar o catálogo local agora.</p>
              <FocusableButton
                focusKey={LOCAL_CATALOG_SEARCH_QUERY_RETRY_FOCUS_KEY}
                onClick={retryCurrentQuery}
                onEnterPress={retryCurrentQuery}
                onArrowPress={(direction) => {
                  if (direction === 'up') {
                    setFocus(LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY);
                    return false;
                  }
                  return true;
                }}
                className="mt-4 rounded-xl bg-white px-4 py-2 font-black text-black"
              >
                Tentar novamente
              </FocusableButton>
            </div>
          ) : null}

          {viewState.showResults ? (
            <FocusableSection
              focusKey="local-catalog-search-results"
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            >
              {page.items.map((item, index) => (
                <MediaCard
                  key={item.id}
                  index={index}
                  focusKey={getLocalCatalogSearchResultFocusKey(index)}
                  title={item.title}
                  subtitle={getKindLabel(item)}
                  posterUrl={getSafeLocalCatalogArtworkUrl(item.artworkUrl)}
                  kind={getCardKind(item)}
                  onEnterPress={() => openResult(item)}
                />
              ))}
            </FocusableSection>
          ) : null}

          {page.nextCursor ? (
            <div className="mt-8 flex justify-center">
              <FocusableButton
                focusKey="local-catalog-search-load-more"
                onClick={() => void loadMore()}
                onEnterPress={() => void loadMore()}
                className="rounded-xl bg-white px-5 py-3 font-black text-black"
              >
                {isLoadingMore ? 'Carregando…' : 'Carregar mais'}
              </FocusableButton>
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
