import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FocusableButton } from '@/components/tv/FocusableButton';
import { AppShell } from '@/components/layout/AppShell';
import { FocusableSection } from '@/components/tv/FocusableSection';
import { useAuth } from '@/app/providers/AuthProvider';
import { useRouteInitialFocus } from '@/hooks/useRouteInitialFocus';
import {
  LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY,
  runLocalCatalogSmokeTest,
  type LocalCatalogSmokeTestResult,
} from '../services/localCatalogSmokeTest.service';
import {
  runLocalPlaylistImportSmokeTest,
  type LocalPlaylistImportSmokeTestResult,
} from '../services/localPlaylistImportSmokeTest.service';

type JsonValue = LocalCatalogSmokeTestResult | LocalPlaylistImportSmokeTestResult | null;

function parseStoredResult(value: string | null): LocalCatalogSmokeTestResult | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as LocalCatalogSmokeTestResult;
  } catch {
    return null;
  }
}

function ResultStatusBadge({ ok }: { ok?: boolean }) {
  if (ok === undefined) {
    return null;
  }

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${
        ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
      }`}
    >
      {ok ? 'SUCESSO' : 'FALHA'}
    </span>
  );
}

function JsonResultPanel({
  title,
  description,
  result,
  emptyMessage,
}: {
  title: string;
  description: string;
  result: JsonValue;
  emptyMessage: string;
}) {
  return (
    <section className="flex min-h-[350px] flex-col rounded-2xl border border-white/10 bg-black/60 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black">{title}</h3>
        <ResultStatusBadge ok={result?.ok} />
      </div>

      <p className="mt-2 text-xs text-xf-muted">{description}</p>

      <div className="mt-4 max-h-[400px] flex-1 overflow-auto rounded-xl border border-white/5 bg-zinc-950/80 p-4 font-mono text-xs">
        {result ? (
          <pre className="whitespace-pre-wrap leading-relaxed text-zinc-200">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <div className="flex h-full min-h-[200px] items-center justify-center text-center text-zinc-500">
            <p>{emptyMessage}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function LocalCatalogSmokeTestPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useRouteInitialFocus();

  const [isRunningCatalogSmoke, setIsRunningCatalogSmoke] = useState(false);
  const [isRunningImportSmoke, setIsRunningImportSmoke] = useState(false);
  const [catalogResult, setCatalogResult] =
    useState<LocalCatalogSmokeTestResult | null>(null);
  const [importResult, setImportResult] =
    useState<LocalPlaylistImportSmokeTestResult | null>(null);
  const [persistedResultRaw, setPersistedResultRaw] = useState<string | null>(null);

  function refreshPersistedResult() {
    try {
      setPersistedResultRaw(
        window.localStorage.getItem(LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY),
      );
    } catch (error) {
      setPersistedResultRaw(
        JSON.stringify({
          ok: false,
          error: 'Falha ao acessar localStorage',
          details: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  useEffect(() => {
    refreshPersistedResult();
  }, []);

  const persistedResult = useMemo(
    () => parseStoredResult(persistedResultRaw),
    [persistedResultRaw],
  );

  async function handleRunCatalogSmokeTest() {
    if (isRunningCatalogSmoke) {
      return;
    }

    setIsRunningCatalogSmoke(true);
    setCatalogResult(null);

    try {
      setCatalogResult(await runLocalCatalogSmokeTest());
    } catch (error) {
      setCatalogResult({
        ok: false,
        insertedCount: 0,
        liveCount: 0,
        movieCount: 0,
        seriesCount: 0,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'LOCAL_CATALOG_SMOKE_TEST_CRITICAL_FAILURE',
      });
    } finally {
      setIsRunningCatalogSmoke(false);
      refreshPersistedResult();
    }
  }

  async function handleRunImportSmokeTest() {
    if (isRunningImportSmoke) {
      return;
    }

    setIsRunningImportSmoke(true);
    setImportResult(null);

    try {
      setImportResult(await runLocalPlaylistImportSmokeTest());
    } catch (error) {
      setImportResult({
        ok: false,
        sourceId: 'local-playlist-import-smoke-test-source',
        finalProgress: {
          status: 'error',
          sourceId: 'local-playlist-import-smoke-test-source',
          processed: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: 1,
          message:
            error instanceof Error
              ? error.message
              : 'LOCAL_PLAYLIST_IMPORT_SMOKE_TEST_CRITICAL_FAILURE',
        },
        stats: {
          playlistItemsCount: 0,
          catalogMetadataCount: 0,
          tmdbMetadataCount: 0,
          byContentKind: {
            live: 0,
            movie: 0,
            series: 0,
            unknown: 0,
          },
        },
        sampleCount: 0,
        listedCount: 0,
        progressEventsCount: 0,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'LOCAL_PLAYLIST_IMPORT_SMOKE_TEST_CRITICAL_FAILURE',
      });
    } finally {
      setIsRunningImportSmoke(false);
      refreshPersistedResult();
    }
  }

  return (
    <AppShell onSignOut={() => void signOut()} hideHeaderOnTv>
      <section
        className="xf-settings-page mx-auto max-w-5xl text-white"
        data-smoke-test-page-root="true"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red">
              Diagnóstico Interno
            </p>
            <h1 className="mt-2 text-4xl font-black">
              Smoke Test IndexedDB Local
            </h1>
          </div>

          <FocusableSection focusKey="smoke-test-back-section">
            <FocusableButton
              focusKey="smoke-test-back-button"
              className="rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20"
              onClick={() => navigate('/')}
              onEnterPress={() => navigate('/')}
            >
              Voltar para Home
            </FocusableButton>
          </FocusableSection>
        </div>

        <p className="mt-4 max-w-3xl text-base leading-relaxed text-xf-muted">
          Página protegida para validação de integridade do banco de dados local,
          smoke test básico do IndexedDB e smoke test isolado do importador local
          progressivo. Nenhuma ação desta tela grava conteúdo no Supabase.
        </p>

        <FocusableSection
          focusKey="smoke-test-controls-section"
          className="mt-8 rounded-2xl border border-white/10 bg-black/60 p-6"
        >
          <h2 className="text-xl font-black">Ações de Diagnóstico</h2>
          <p className="mt-2 text-sm text-xf-muted">
            Execute os testes locais e acompanhe em tempo real a comunicação com
            IndexedDB.
          </p>

          <div className="mt-6 flex flex-wrap gap-4">
            <FocusableButton
              focusKey="btn-run-smoke-test"
              className="rounded-xl bg-xf-red px-6 py-4 text-base font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRunningCatalogSmoke}
              onClick={handleRunCatalogSmokeTest}
              onEnterPress={handleRunCatalogSmokeTest}
            >
              {isRunningCatalogSmoke
                ? 'Executando teste...'
                : 'Executar smoke test IndexedDB'}
            </FocusableButton>

            <FocusableButton
              focusKey="btn-run-import-smoke-test"
              className="rounded-xl bg-sky-500 px-6 py-4 text-base font-black text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRunningImportSmoke}
              onClick={handleRunImportSmokeTest}
              onEnterPress={handleRunImportSmokeTest}
            >
              {isRunningImportSmoke
                ? 'Importando playlist local...'
                : 'Executar smoke test importador'}
            </FocusableButton>

            <FocusableButton
              focusKey="btn-reload-saved-result"
              className="rounded-xl bg-white/10 px-6 py-4 text-base font-black text-white transition hover:bg-white/20"
              onClick={refreshPersistedResult}
              onEnterPress={refreshPersistedResult}
            >
              Recarregar resultado salvo
            </FocusableButton>
          </div>
        </FocusableSection>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <JsonResultPanel
            title="Smoke Test IndexedDB"
            description="Resultado direto do teste básico de escrita/leitura/stats."
            result={catalogResult}
            emptyMessage="Aguardando execução do teste básico."
          />

          <JsonResultPanel
            title="Smoke Test Importador Progressivo"
            description="Resultado direto do importador M3U local progressivo isolado."
            result={importResult}
            emptyMessage="Aguardando execução do teste do importador."
          />

          <JsonResultPanel
            title="Persistido no LocalStorage"
            description={`Chave: ${LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY}`}
            result={persistedResult}
            emptyMessage="Nenhum resultado persistido encontrado no localStorage."
          />
        </div>
      </section>
    </AppShell>
  );
}
