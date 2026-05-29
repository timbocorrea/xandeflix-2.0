# Fase 3.11 — Auditoria técnica da PR #88 antes de qualquer merge

## 1. Contexto

Projeto: Xandeflix 2.0.

Repositório: xandeflix4/xandeflix-2.0.

PR auditada: #88 — Draft: reconcile PR87 local-first foundation with main.

Branch auditada: integration/pr87-main-reconcile-20260529-090721.

Base: main.

A Fase 3.11 auditou tecnicamente a PR #88 antes de qualquer merge na main. A PR #88 foi criada como reconciliação segura da PR #87 com a main, mantendo a PR #87 original aberta, Draft e sem alteração direta.

## 2. Regras respeitadas

- Não foi feito merge da PR #88.
- A PR #88 não foi marcada como Ready for Review.
- A PR #87 não foi fechada.
- A main não foi alterada.
- Não houve migração de Home, Live TV ou VOD para IndexedDB.
- Não houve correção de D-pad da tela debug.
- Não houve alteração funcional adicional em Player, Android, Catálogo, Live TV, Supabase ou LocalCatalog durante esta auditoria.
- Foram aplicados apenas commits documentais mínimos para limpar whitespace em arquivos Markdown.
- A execução foi feita por ciclos pequenos usando Git Bash no Windows.

## 3. Estado local e remoto

Branch auditada: integration/pr87-main-reconcile-20260529-090721.

Head final local e remoto: b19004badcc99416520e9c42f36655ddba61806f.

Commits documentais adicionados durante a auditoria:

- 7184b2c docs: clean pr88 audit markdown whitespace
- b19004b docs: clean remaining pr88 markdown eof whitespace

Comparação final local x remoto: 0 0.

Working tree final: limpo.

## 4. Estado da PR #88 no GitHub

Após o push dos commits documentais, a PR #88 foi confirmada com:

- state: open;
- draft: true;
- merged: false;
- base: main;
- head: integration/pr87-main-reconcile-20260529-090721;
- head_sha: b19004badcc99416520e9c42f36655ddba61806f;
- commits: 44;
- changed_files: 72;
- additions: 9381;
- deletions: 340.

Observação: o GitHub retornou mergeable=false após o push, mas a investigação local com git merge-tree contra origin/main não reportou conflitos textuais. Esse ponto deve ser tratado como divergência de estado do GitHub, possível recálculo/cache ou regra de branch protection/status checks, e não como conflito textual confirmado localmente.

## 5. Arquivos alterados e áreas sensíveis

A PR #88 contém 72 arquivos alterados:

- 39 arquivos adicionados;
- 33 arquivos modificados.

Áreas sensíveis identificadas:

- Android nativo;
- Player Universal;
- bridge/adapters do player nativo Android;
- Catálogo;
- episódios e progresso de reprodução;
- Live TV;
- Admin;
- Supabase Functions;
- LocalCatalog/IndexedDB;
- documentação de auditoria.

Não foram encontrados arquivos temporários/fantasmas como .tmp, .bak, .orig, backup, conflict, dist, node_modules, .patch ou .log.

## 6. Guardrails Local-First

A auditoria de src/features/localCatalog confirmou ausência de dependências diretas de Supabase:

- sem supabaseClient;
- sem functions.invoke;
- sem license_channels_cache;
- sem get-client-license-channels.

O LocalCatalog permanece como fundação local/diagnóstica baseada em IndexedDB.

Home, Live TV e VOD não foram migrados por acidente para IndexedDB como fonte principal.

Ressalva controlada: src/features/catalog/pages/PreparingHomePage.tsx executa runLocalCatalogSmokeTestInBackground(), mas protegido por env.localCatalogSmokeTestEnabled. Isso foi classificado como risco baixo/controlado, desde que a flag permaneça desligada fora de cenário diagnóstico.

## 7. Auditoria Player, Catálogo e Episódios

Foram preservados os pontos críticos:

- getEpisodePlaybackProgressKey;
- readEpisodePlaybackProgress;
- hasEpisodePlaybackProgress;
- markEpisodePlaybackStarted;
- getEpisodeResumePositionMs;
- updateEpisodePlaybackPosition;
- getEpisodePlaybackProgressPercent;
- direct=1;
- startPositionMs;
- SeriesCategoryHero;
- SimilarSeriesCard;
- setFocus;
- isDirectPlayback;
- usesNativeAndroidPlayer;
- createNativeAndroidPlayerAdapter;
- ensurePlaybackSessionStarted;
- heartbeatPlaybackSession.

Não foram encontrados marcadores de conflito em src/features/catalog ou src/features/player.

## 8. Validações técnicas

Validações finais executadas após os commits documentais:

- git diff --check origin/main...HEAD: OK, DIFF_CHECK_EXIT_CODE=0.
- npx.cmd --no-install tsc -b: OK, TSC_EXIT_CODE=0.
- npx.cmd --no-install vite build: OK, VITE_BUILD_EXIT_CODE=0.

O Vite exibiu apenas o aviso conhecido de chunks acima de 500 kB após minificação. Esse aviso não bloqueia a Fase 3.11.

## 9. Riscos encontrados

### Risco 1 — PR ampla

A PR #88 segue grande, com 72 arquivos alterados e 44 commits. Ela toca áreas sensíveis demais para merge direto sem validação manual.

Classificação: alto.

### Risco 2 — Android nativo alterado

Embora a Fase 3.11 não tenha alterado funcionalmente o Android nativo, a PR #88 contém alterações em NativeAndroidPlayerPlugin.java, NativePlayerActivity.java, NativeStreamRequest.java e android/app/capacitor.build.gradle.

Isso exige validação real em Android/Fire Stick antes de merge.

Classificação: alto.

### Risco 3 — Live TV e Player

A PR toca Player, Native Android bridge e Live TV. Mesmo com build e TypeScript OK, ainda é necessário teste manual real para garantir que preview inline, fullscreen nativo, retorno do player, foco/estado e reprodução Live/VOD não sofreram regressão.

Classificação: alto.

### Risco 4 — LocalCatalog ainda é fundação

LocalCatalog/IndexedDB foi preservado como fundação/diagnóstico. Home, Live TV e VOD ainda não devem usar IndexedDB como fonte principal nesta etapa.

Classificação: médio.

### Risco 5 — Smoke test por flag

PreparingHomePage.tsx contém smoke test LocalCatalog em background protegido por flag.

Classificação: baixo/controlado.

### Risco 6 — GitHub mergeable divergente

GitHub reportou mergeable=false após push, enquanto git merge-tree local não reportou conflitos textuais.

Classificação: médio.

## 10. Decisão recomendada

A PR #88 não deve ser mergeada agora.

Recomendação:

- manter PR #88 como Draft;
- não marcar Ready for Review;
- não fechar PR #87 ainda;
- não alterar main;
- não fazer merge;
- validar manualmente em Android/tablet e posteriormente Fire Stick;
- rechecar mergeable no GitHub antes de decisão futura;
- avaliar se a PR #88 deve ser dividida antes de qualquer merge definitivo.

## 11. Conclusão executiva

A Fase 3.11 confirmou que a PR #88 está tecnicamente organizada após reconciliação, sem arquivos fantasmas, com guardrails Local-First preservados, sem migração acidental de Home/Live/VOD para IndexedDB e com Player/progresso/retomada preservados.

As validações técnicas finais passaram:

- git diff --check: OK;
- TypeScript: OK;
- Vite build: OK.

Mesmo assim, a PR #88 permanece ampla e sensível. A decisão segura é mantê-la Draft e não realizar merge até validação manual real em Android/Fire Stick e nova análise do estado mergeable no GitHub.
