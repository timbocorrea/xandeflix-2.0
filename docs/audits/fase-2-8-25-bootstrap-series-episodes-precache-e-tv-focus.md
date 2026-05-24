# Relatorio consolidado — Xandeflix 2.0 / Fase 2.8.25

## Identificacao

- Projeto: Xandeflix 2.0
- Repositorio: xandeflix4/xandeflix-2.0
- Branch de trabalho: feat/bootstrap-series-episodes-precache
- Base: main pos-merge da PR #81
- Pasta local: ~/Dropbox/xandeflix2.0
- Objetivo principal: adicionar pre-cache de episodios de series/novelas no bootstrap critico e estabilizar foco/navegacao em TV/Fire Stick.

---

## Contexto da etapa

A etapa iniciou apos a consolidacao da PR #81, que introduziu o pre-carregamento critico de Home, Live TV e dados principais.

A nova fase teve como objetivo melhorar a abertura da pagina interna de series/novelas, especialmente para reduzir loading de episodios e evitar tela vazia/demora na primeira abertura. Durante os testes reais no Fire Stick, tambem foram identificados e tratados bugs adicionais de UX/D-pad e flicker global.

---

## Base e branch

A main local foi alinhada com origin/main, confirmando o merge da PR #81:

- 0a84a45 Merge pull request #81 from xandeflix4/feat/bootstrap-critical-preload

Branch criada:

- feat/bootstrap-series-episodes-precache

---

## Alteracoes implementadas

### 1. Cache compartilhado de episodios

Foi criado o service:

- src/features/catalog/services/seriesEpisodesCache.service.ts

Responsabilidades:

- gerar chave estavel de cache por licenca, device, grupo e identidade TMDB/titulo;
- ler episodios cacheados;
- gravar episodios cacheados;
- limitar o cache especifico de episodios a 500 itens.

Funcoes principais:

- getSeriesEpisodesCacheKey
- readCachedSeriesEpisodes
- storeCachedSeriesEpisodes

---

### 2. Refatoracao da pagina interna de series/novelas

Arquivo alterado:

- src/features/catalog/pages/CatalogCategoryPage.tsx

A pagina passou a usar o cache compartilhado de episodios, removendo logica local duplicada.

Comportamento esperado:

- ao abrir uma pagina interna de serie/novela, tentar ler episodios do cache especifico;
- se nao houver cache especifico, cair para cache da categoria ou secoes da Home;
- apos carregar episodios completos, gravar no cache especifico da serie/novela.

---

### 3. Pre-cache de episodios no bootstrap

Arquivo alterado:

- src/features/bootstrap/services/appBootstrap.service.ts

Foram adicionados limites:

- SERIES_EPISODES_PRECACHE_LIMIT = 500
- SERIES_COLLECTIONS_PRECACHE_LIMIT = 8

Fluxo implementado:

1. usar homeSections ja carregadas no bootstrap;
2. identificar colecoes de series/novelas;
3. selecionar ate 8 colecoes;
4. carregar ate 500 episodios por grupo;
5. filtrar por tmdbId ou tmdbTitle;
6. gravar episodios em cache especifico com storeCachedSeriesEpisodes.

O resultado do bootstrap passou a poder expor:

- seriesEpisodesPrecache.candidates
- seriesEpisodesPrecache.storedSeriesCount
- seriesEpisodesPrecache.storedEpisodeCount

---

### 4. Guard da Live TV instantanea compativel com Windows/Git Bash

Arquivos envolvidos:

- scripts/guards/check-live-tv-instant-lock.sh
- .phase-locks/live-tv-instant.sha256

Durante a fase, o guard acusou divergencia por final de linha CRLF/LF no Windows, mesmo sem alteracao logica dos arquivos protegidos.

Correcao aplicada:

- normalizacao com tr -d '\r';
- checksum normalizado por arquivo;
- manutencao da protecao dos arquivos criticos.

Arquivos protegidos:

- src/features/live/pages/LiveTvPage.tsx
- src/features/live/services/liveTvCriticalCache.service.ts
- src/features/bootstrap/services/appBootstrap.service.ts

---

### 5. Correcao de flicker global em TV/Fire Stick

Arquivo alterado:

- src/features/app-installations/hooks/useAppInstallationHeartbeat.ts

Problema observado:

- tela piscando em todas as paginas apos algum tempo.

Causa provavel identificada:

- useAppInstallationHeartbeat roda no topo de AppRoutes;
- o hook criava um setInterval global de 5 minutos;
- em TV/Fire Stick, esse heartbeat podia causar efeito visual/re-render/requisicao global.

Correcao aplicada:

- heartbeat nao inicia quando profile.formFactor === 'tv';
- heartbeat nao inicia quando profile.playerStrategy === 'native-android'.

---

### 6. Correcao de travamento do D-pad em Titulos semelhantes

Arquivo alterado:

- src/features/catalog/pages/CatalogCategoryPage.tsx

Problema observado:

- ao navegar por titulos semelhantes na pagina interna de novelas/series, o seletor D-pad sumia;
- a tela ficava sem foco recuperavel;
- o Fire Stick continuava recebendo eventos D-pad, indicando problema interno de foco.

Causas identificadas:

- foco apontando para componente desmontado;
- troca de serie interna sem reset de foco;
- efeito de foco dependente apenas de visibleItems.length;
- episodeFocusIndex podendo apontar para item fora da janela renderizada.

Correcoes aplicadas:

- criacao de currentSeriesIdentity;
- reset de episodeFocusIndex ao trocar serie;
- limpeza de similarItems;
- restauracao do foco no Hero da pagina interna;
- dependencia do efeito de foco atualizada com currentSeriesIdentity;
- foco seguro ao voltar de semelhantes para episodios.

---

### 7. Correcao da navegacao 3x2 em Titulos semelhantes

Arquivo alterado:

- src/features/catalog/pages/CatalogCategoryPage.tsx

Problema observado:

- a area de Titulos semelhantes tem 3 colunas e 2 linhas;
- ao pressionar esquerda, o foco saia indevidamente da area e voltava para episodios;
- ao pressionar direita na borda direita, deveria avancar para a primeira coluna da linha seguinte.

Correcao aplicada em:

- handleSimilarCardArrowPress(direction, index)

Comportamento final esperado:

- Direita: 0 -> 1 -> 2 -> 3 -> 4 -> 5
- Esquerda: 5 -> 4 -> 3 -> 2 -> 1 -> 0

Regras:

- esquerda so sai para episodios se estiver no primeiro card da primeira linha;
- esquerda na primeira coluna da segunda linha volta para o ultimo card da primeira linha;
- direita na borda direita da primeira linha vai para a primeira coluna da segunda linha;
- cima/baixo respeitam grade de 3 colunas.

Validacao manual informada:

- DEU CERTO

---

## Validacoes executadas

Durante a etapa foram executados ciclos de validacao com:

- bash scripts/guards/check-live-tv-instant-lock.sh
- npx.cmd tsc -b
- git diff --check
- VITE_PLAYER_DEBUG=true npx.cmd vite build --emptyOutDir false
- npx.cmd cap copy android
- npx.cmd cap update android
- ./gradlew.bat :app:assembleDebug
- adb install / uninstall / monkey

Resultados consolidados observados:

- GUARD_EXIT_CODE=0
- TSC_EXIT_CODE=0
- DIFF_CHECK_EXIT_CODE=0
- VITE_BUILD_EXIT_CODE=0
- GRADLE_EXIT_CODE=0
- ADB_INSTALL_EXIT_CODE=0
- ADB_OPEN_EXIT_CODE=0

---

## Validacao em Fire Stick

Dispositivo validado:

- Serial: G071EL1313720CJ0
- Modelo: AFTSSS
- Fabricante: Amazon
- Device: sheldonp

Fluxo validado:

- build web;
- copy/update Capacitor;
- build APK debug;
- uninstall/install no Fire Stick;
- abertura do app via adb shell monkey;
- validacao manual da Home;
- validacao manual de pagina interna de series/novelas;
- validacao manual dos Titulos semelhantes;
- validacao manual da navegacao D-pad na grade 3x2.

---

## Arquivos alterados esperados

- .phase-locks/live-tv-instant.sha256
- scripts/guards/check-live-tv-instant-lock.sh
- src/features/app-installations/hooks/useAppInstallationHeartbeat.ts
- src/features/bootstrap/services/appBootstrap.service.ts
- src/features/catalog/pages/CatalogCategoryPage.tsx
- src/features/catalog/services/seriesEpisodesCache.service.ts
- docs/audits/fase-2-8-25-bootstrap-series-episodes-precache-e-tv-focus.md

---

## Riscos tratados

### Live TV instantanea

Mitigacao:

- guard mantido;
- checksum atualizado conscientemente somente apos alteracao validada;
- arquivos de Live TV continuaram protegidos.

### CRLF/LF no Windows

Mitigacao:

- guard normalizado para Windows/Git Bash.

### Foco D-pad perdido

Mitigacao:

- reset por identidade da serie;
- foco seguro no Hero;
- navegacao de semelhantes reescrita como grade.

### Flicker apos alguns minutos

Mitigacao:

- heartbeat global bloqueado em TV/Fire Stick.

---

## Status final

A etapa esta funcionalmente validada em teste manual no Fire Stick.

Status tecnico esperado antes do commit:

- Guard Live TV instantanea: OK
- TypeScript: OK
- Diff check: OK
- Build Vite: OK
- Build Android: OK
- Instalacao Fire Stick: OK
- Teste manual D-pad semelhantes: OK

---

## Proximos passos recomendados

1. Executar auditoria final curta.
2. Fazer stage seletivo.
3. Commitar com mensagem: feat: precache series episodes and stabilize tv focus
4. Fazer push da branch: feat/bootstrap-series-episodes-precache
5. Abrir PR contra main.

Sugestao de titulo da PR:

- feat: precache series episodes and stabilize TV focus

Sugestao de descricao da PR:

Resumo:

- Adiciona cache compartilhado de episodios de series/novelas.
- Integra pre-cache de episodios ao bootstrap critico.
- Ajusta guard da Live TV instantanea para checksum normalizado no Windows/Git Bash.
- Desativa heartbeat global em TV/Fire Stick para evitar flicker periodico.
- Corrige restauracao de foco na pagina interna de series/novelas.
- Corrige travamento e navegacao D-pad na grade 3x2 de Titulos semelhantes.

Validacoes:

- Guard Live TV instantanea: OK.
- TypeScript: OK.
- Diff check: OK.
- Vite build: OK.
- Gradle assembleDebug: OK.
- Instalacao e abertura no Fire Stick: OK.
- Teste manual Fire Stick: Home, pagina interna de series/novelas, Titulos semelhantes e D-pad validados.
