import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { FocusableButton } from '@/components/tv/FocusableButton';
import { FocusableSection } from '@/components/tv/FocusableSection';
import { useRouteInitialFocus } from '@/hooks/useRouteInitialFocus';
import { useAuth } from '@/app/providers/AuthProvider';
import {
  runLocalCatalogSmokeTest,
  LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY,
  type LocalCatalogSmokeTestResult,
} from '../services/localCatalogSmokeTest.service';

export default function LocalCatalogSmokeTestPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useRouteInitialFocus();

  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<LocalCatalogSmokeTestResult | null>(null);
  const [persistedResult, setPersistedResult] = useState<string | null>(null);

  function loadPersistedResult() {
    try {
      const stored = window.localStorage.getItem(LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY);
      setPersistedResult(stored);
    } catch (error) {
      setPersistedResult(
        JSON.stringify({
          error: 'Falha ao acessar localStorage',
          details: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  useEffect(() => {
    loadPersistedResult();
  }, []);

  async function handleExecuteTest() {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setTestResult(null);

    try {
      const result = await runLocalCatalogSmokeTest();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        ok: false,
        insertedCount: 0,
        liveCount: 0,
        movieCount: 0,
        seriesCount: 0,
        errorMessage: error instanceof Error ? error.message : 'LOCAL_CATALOG_SMOKE_TEST_CRITICAL_FAILURE',
      });
    } finally {
      setIsLoading(false);
      loadPersistedResult();
    }
  }

  const parsedPersisted = (() => {
    if (!persistedResult) {
      return null;
    }
    try {
      return JSON.parse(persistedResult) as LocalCatalogSmokeTestResult;
    } catch {
      return null;
    }
  })();

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
          Página protegida para validação de integridade do banco de dados local. Executa inserções temporárias, listagens estruturadas por tipo de conteúdo, cálculo de estatísticas e limpeza automática, além de salvar os resultados de forma persistente.
        </p>

        {/* CONTROLES PRINCIPAIS */}
        <FocusableSection
          focusKey="smoke-test-controls-section"
          className="mt-8 rounded-2xl border border-white/10 bg-black/60 p-6"
        >
          <h2 className="text-xl font-black">Ações de Diagnóstico</h2>
          <p className="mt-2 text-sm text-xf-muted">
            Execute o teste e acompanhe em tempo real a comunicação e tempo de resposta do IndexedDB local.
          </p>

          <div className="mt-6 flex flex-wrap gap-4">
            <FocusableButton
              focusKey="btn-run-smoke-test"
              className="rounded-xl bg-xf-red px-6 py-4 text-base font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
              onClick={handleExecuteTest}
              onEnterPress={handleExecuteTest}
            >
              {isLoading ? 'Executando teste...' : 'Executar smoke test IndexedDB'}
            </FocusableButton>

            <FocusableButton
              focusKey="btn-reload-saved-result"
              className="rounded-xl bg-white/10 px-6 py-4 text-base font-black text-white transition hover:bg-white/20"
              onClick={loadPersistedResult}
              onEnterPress={loadPersistedResult}
            >
              Recarregar resultado salvo
            </FocusableButton>
          </div>
        </FocusableSection>

        {/* PAINEL DE RESULTADOS */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* LADO A: RESULTADO DO TESTE AO VIVO */}
          <section className="rounded-2xl border border-white/10 bg-black/60 p-6 flex flex-col min-h-[350px]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">Última Execução Direta</h3>
              {testResult && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    testResult.ok
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {testResult.ok ? 'SUCESSO' : 'FALHA'}
                </span>
              )}
            </div>

            <p className="mt-2 text-xs text-xf-muted">
              Resultado em tempo de execução capturado no clique atual do botão.
            </p>

            <div className="mt-4 flex-1 rounded-xl border border-white/5 bg-zinc-950/80 p-4 font-mono text-xs overflow-auto max-h-[400px]">
              {testResult ? (
                <pre className="text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              ) : (
                <div className="flex h-full min-h-[200px] items-center justify-center text-center text-zinc-500">
                  {isLoading ? (
                    <p className="animate-pulse font-bold text-xf-red">
                      Executando queries no banco de dados local...
                    </p>
                  ) : (
                    <p>Aguardando execução do teste de fumaça.</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* LADO B: RESULTADO PERSISTIDO (LOCALSTORAGE) */}
          <section className="rounded-2xl border border-white/10 bg-black/60 p-6 flex flex-col min-h-[350px]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">Persistido no LocalStorage</h3>
              {parsedPersisted && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    parsedPersisted.ok
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {parsedPersisted.ok ? 'SUCESSO' : 'FALHA'}
                </span>
              )}
            </div>

            <p className="mt-2 text-xs text-xf-muted font-semibold tracking-wide text-xf-red">
              Chave: <span className="text-white select-all">{LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY}</span>
            </p>

            <div className="mt-4 flex-1 rounded-xl border border-white/5 bg-zinc-950/80 p-4 font-mono text-xs overflow-auto max-h-[400px]">
              {persistedResult ? (
                <pre className="text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(JSON.parse(persistedResult), null, 2)}
                </pre>
              ) : (
                <div className="flex h-full min-h-[200px] items-center justify-center text-center text-zinc-500">
                  <p>Nenhum resultado persistido encontrado no localStorage.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
