import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { Search, LoaderCircle } from 'lucide-react';
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
  buildLocalCatalogSearchReturnTo,
  buildLocalCatalogSeriesDetailRoute,
  getLocalCatalogSearchResultFocusKey,
  LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY,
  resolveLocalCatalogSearchInputArrowTarget,
} from '../lib/localCatalogSearchUiContract';
import {
  ensureLegacyLocalCatalogSearchIndex,
  getLegacyLocalCatalogSearchIndexState,
} from '../services/localCatalogSearchIndex.service';
import {
  LOCAL_CATALOG_SEARCHING_MESSAGE,
  LOCAL_CATALOG_MISSING_CONTENT_MESSAGE,
  LOCAL_CATALOG_RELATED_RESULTS_HEADING,
  resolveLocalCatalogSearchArtworkUx,
  resolveLocalCatalogSearchUxRules,
} from '../lib/localCatalogSearchUxRules';

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

function getSearchCardPosterUrl(item: LocalCatalogSearchResultItem) {
  return resolveLocalCatalogSearchArtworkUx(
    getSafeLocalCatalogArtworkUrl(item.artworkUrl),
  ).posterUrl;
}

export default function LocalCatalogSearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { localCatalogScopeKey } = usePlaylistRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [page, setPage] = useState<LocalCatalogSearchPage>({
    status: 'empty_query',
    normalizedQuery: '',
    items: [],
    nextCursor: null,
  });
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasLocalError, setHasLocalError] = useState(false);
  const [indexRefreshTick, setIndexRefreshTick] = useState(0);
  const requestIdRef = useRef(0);
  const foregroundSearchKeyRef = useRef('');
  const lastIndexRefreshKeyRef = useRef('');
  const { ref: inputRef, focused: inputSpatiallyFocused } = useFocusable({
    focusKey: LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY,
  });

  useEffect(() => {
    setFocus(LOCAL_CATALOG_SEARCH_INPUT_FOCUS_KEY);
    inputRef.current?.focus();
  }, [inputRef]);

  useEffect(() => {
    if (inputSpatiallyFocused) {
      inputRef.current?.focus();
    }
  }, [inputRef, inputSpatiallyFocused]);

  useEffect(() => {
    if (localCatalogScopeKey) {
      void ensureLegacyLocalCatalogSearchIndex(localCatalogScopeKey);
    }
  }, [localCatalogScopeKey]);

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
      foregroundSearchKeyRef.current = '';
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
      foregroundSearchKeyRef.current = '';
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
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    const searchKey = `${localCatalogScopeKey}\u0000${trimmedQuery}`;
    const isBackgroundRefresh =
      foregroundSearchKeyRef.current === searchKey;

    if (!isBackgroundRefresh) {
      foregroundSearchKeyRef.current = searchKey;
      lastIndexRefreshKeyRef.current = '';
    }

    const timeoutId = window.setTimeout(() => {
      if (!isBackgroundRefresh) {
        setIsSearching(true);
      }
      setHasLocalError(false);
      void searchLocalCatalog({
        scopeKey: localCatalogScopeKey,
        query: trimmedQuery,
      })
        .then((result) => {
          if (requestIdRef.current === requestId) {
            setPage(result);
          }
        })
        .catch(() => {
          if (requestIdRef.current === requestId) {
            setHasLocalError(true);
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
      !query.trim() ||
      !localCatalogScopeKey
    ) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const schedulePoll = () => {
      timeoutId = window.setTimeout(() => {
        void getLegacyLocalCatalogSearchIndexState(
          localCatalogScopeKey,
        )
          .then((state) => {
            if (cancelled || !state) {
              return;
            }

            const refreshKey = [
              state.generation,
              state.status,
              state.processedCount,
            ].join(':');

            if (
              lastIndexRefreshKeyRef.current !== refreshKey
            ) {
              lastIndexRefreshKeyRef.current = refreshKey;
              setIndexRefreshTick((current) => current + 1);
            }

            if (state.status === 'building') {
              schedulePoll();
            }
          })
          .catch(() => {
            if (!cancelled) {
              schedulePoll();
            }
          });
      }, 1_500);
    };

    schedulePoll();

    return () => {
      cancelled = true;

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    localCatalogScopeKey,
    page.indexingInBackground,
    page.status,
    query,
  ]);

  function openResult(item: LocalCatalogSearchResultItem) {
    const returnTo = buildLocalCatalogSearchReturnTo(
      location.pathname,
      location.search,
    );

    if (item.contentKind === 'movie') {
      const params = new URLSearchParams({ title: item.title });
      if (item.groupTitle) params.set('groupTitle', item.groupTitle);
      navigate(`/category/movie-detail?${params.toString()}`, {
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
    } catch {
      setHasLocalError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const target = resolveLocalCatalogSearchInputArrowTarget(
      event.key,
      page.items.length > 0,
    );
    if (target) {
      event.preventDefault();
      setFocus(target);
    }
  }

  const {
    searchInProgress,
    showFriendlySearching,
    showMissingContentMessage,
    showRelatedResultsHeading,
  } = resolveLocalCatalogSearchUxRules({
    query,
    isSearching,
    hasLocalError,
    page,
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
            ref={inputRef}
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
            onKeyDown={handleInputKeyDown}
            className="h-14 w-full rounded-2xl border border-white/15 bg-zinc-950 pl-12 pr-4 text-base font-semibold text-white outline-none transition focus:border-xf-red focus:ring-2 focus:ring-xf-red/40 md:h-16 md:text-lg"
          />
        </div>

        <div
          className="mt-8 min-h-52"
          aria-busy={searchInProgress}
        >
          {!query.trim() ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-xf-muted">
              Digite para buscar no catálogo local completo.
            </p>
          ) : null}

          {showFriendlySearching ? (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-xf-muted"
            >
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin text-zinc-400"
                size={20}
              />
              <span>{LOCAL_CATALOG_SEARCHING_MESSAGE}</span>
            </p>
          ) : null}

          {page.status === 'index_failed' && query.trim() ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-6 text-amber-100">
              <p>A preparação da busca local foi interrompida.</p>
              <FocusableButton
                focusKey="local-catalog-search-retry-index"
                onClick={() => {
                  if (!localCatalogScopeKey) return;
                  void ensureLegacyLocalCatalogSearchIndex(
                    localCatalogScopeKey,
                    { retryFailed: true },
                  ).then(() => {
                    setIndexRefreshTick((current) => current + 1);
                  });
                }}
                className="mt-4 rounded-xl bg-white px-4 py-2 font-black text-black"
              >
                Retomar preparação
              </FocusableButton>
            </div>
          ) : null}

          {page.status === 'unavailable' && query.trim() ? (
            <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-6 text-amber-100">
              O catálogo local ainda não está disponível para esta fonte.
            </p>
          ) : null}

          {showMissingContentMessage ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-xf-muted">
              {LOCAL_CATALOG_MISSING_CONTENT_MESSAGE}
            </p>
          ) : null}

          {hasLocalError ? (
            <p className="rounded-2xl border border-red-400/20 bg-red-400/10 p-6 text-red-100">
              Não foi possível consultar o catálogo local agora. Tente novamente.
            </p>
          ) : null}

          {showRelatedResultsHeading ? (
            <h2 className="mb-4 mt-6 text-xl font-bold text-white">
              {LOCAL_CATALOG_RELATED_RESULTS_HEADING}
            </h2>
          ) : null}


          {page.items.length > 0 ? (
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
                  posterUrl={getSearchCardPosterUrl(item)}
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
