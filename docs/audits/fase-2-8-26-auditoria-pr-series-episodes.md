# RELATÓRIO FINAL — FASE 2.8.26
## Auditoria final, commit, push e PR — pré-cache de episódios + estabilidade D-pad/TV

## 1. Contexto

Projeto: Xandeflix 2.0
Repositório: xandeflix4/xandeflix-2.0
Branch: feat/bootstrap-series-episodes-precache
Base: main pós-merge da PR #81
Base confirmada: 0a84a4584ec1aa95cc594318bb85735116494d27
Objetivo: consolidar a etapa de pré-cache de episódios de séries/novelas e correções preventivas de UX/D-pad no Fire Stick.

A Fase 2.8.25 foi validada manualmente no Fire Stick e trouxe:
- cache compartilhado de episódios de séries/novelas;
- pré-cache de episódios no bootstrap;
- ajuste do guard da Live TV instantânea para Windows/Git Bash;
- desativação do heartbeat global em TV/Fire Stick;
- correção de foco na página interna de séries/novelas;
- correção da navegação D-pad em Títulos semelhantes.

## 2. Avaliação do repositório e sincronização

- Branch atual: feat/bootstrap-series-episodes-precache
- Working tree inicial: alterações locais esperadas da fase 2.8.25
- HEAD local inicial: 0a84a4584ec1aa95cc594318bb85735116494d27
- origin/main: 0a84a4584ec1aa95cc594318bb85735116494d27
- main local: 0a84a4584ec1aa95cc594318bb85735116494d27
- Branch atual x origin/main: 0 0
- main local x origin/main: 0 0
- PR #81 presente na main: sim
- Merge commit da PR #81: 0a84a4584ec1aa95cc594318bb85735116494d27
- Branch remota da fase existia?: não retornou SHA
- PR remota da fase existia?: não retornou PR

Conclusão: branch local partia exatamente da main pós-PR #81.

## 3. Escopo auditado

Arquivos alterados esperados:

- .phase-locks/live-tv-instant.sha256
- scripts/guards/check-live-tv-instant-lock.sh
- src/features/app-installations/hooks/useAppInstallationHeartbeat.ts
- src/features/bootstrap/services/appBootstrap.service.ts
- src/features/catalog/pages/CatalogCategoryPage.tsx
- src/features/catalog/services/seriesEpisodesCache.service.ts
- docs/audits/fase-2-8-25-bootstrap-series-episodes-precache-e-tv-focus.md
- docs/audits/fase-2-8-26-auditoria-pr-series-episodes.md

Arquivos fora do escopo:

- Nenhum identificado.

Confirmações de escopo:

- LiveTvPage.tsx não foi alterado.
- Player Universal não foi alterado.
- NativePlayerActivity não foi alterado.
- NativeAndroidPlayerPlugin não foi alterado.
- Pasta android nativa não foi alterada.
- Supabase schema não foi alterado.
- server.url não foi criado em capacitor.config.ts.
- live reload não foi reativado.

## 4. Resultado funcional herdado da etapa 2.8.25

### 4.1 Pré-cache de episódios

Implementado em:

- src/features/bootstrap/services/appBootstrap.service.ts

Foram adicionados limites:

- SERIES_EPISODES_PRECACHE_LIMIT = 500
- SERIES_COLLECTIONS_PRECACHE_LIMIT = 8

Fluxo implementado:

1. usa as homeSections já carregadas no bootstrap;
2. identifica coleções de séries/novelas;
3. seleciona até 8 coleções candidatas;
4. carrega até 500 episódios por grupo;
5. filtra por tmdbId ou tmdbTitle;
6. grava episódios no cache compartilhado da série/novela.

O resultado do bootstrap passou a expor, quando disponível:

- seriesEpisodesPrecache.candidates
- seriesEpisodesPrecache.storedSeriesCount
- seriesEpisodesPrecache.storedEpisodeCount

### 4.2 Cache compartilhado

Criado o service:

- src/features/catalog/services/seriesEpisodesCache.service.ts

Responsabilidades:

- gerar chave estável de cache por licença, device, grupo e identidade TMDB/título;
- ler episódios cacheados;
- gravar episódios cacheados;
- limitar o cache específico de episódios a 500 itens;
- falhar em modo best-effort sem bloquear navegação.

Funções principais:

- getSeriesEpisodesCacheKey
- readCachedSeriesEpisodes
- storeCachedSeriesEpisodes

### 4.3 Página interna de séries/novelas

Arquivo:

- src/features/catalog/pages/CatalogCategoryPage.tsx

A página passou a usar o cache compartilhado, removendo lógica local duplicada.

Comportamento esperado:

- ao abrir uma página interna de série/novela, tentar ler episódios do cache específico;
- se não houver cache específico, cair para cache da categoria ou seções da Home;
- após carregar episódios completos, gravar no cache específico da série/novela.

### 4.4 Guard Windows/Git Bash

Arquivos:

- scripts/guards/check-live-tv-instant-lock.sh
- .phase-locks/live-tv-instant.sha256

Ajustes aplicados:

- normalização de CRLF/LF com tr -d '\r';
- checksum normalizado por arquivo;
- lock atualizado para o appBootstrap.service.ts;
- conferência robusta de marcadores obrigatórios;
- correção preventiva para não depender apenas do exit code do último grep;
- marcador XANDEFLIX_BOOTSTRAP_RESTORE_LIVE_CACHE conferido no appBootstrap.service.ts.

### 4.5 Heartbeat em TV/Fire Stick

Arquivo:

- src/features/app-installations/hooks/useAppInstallationHeartbeat.ts

Correção:

- heartbeat não inicia quando profile.formFactor === 'tv';
- heartbeat não inicia quando profile.playerStrategy === 'native-android'.

Objetivo:

- evitar flicker periódico em TV/Fire Stick causado por intervalo global de heartbeat.

### 4.6 Foco em página interna de séries/novelas

Arquivo:

- src/features/catalog/pages/CatalogCategoryPage.tsx

Correções:

- criação de currentSeriesIdentity;
- restauração de foco ao trocar série/novela;
- dependência do efeito de foco atualizada com currentSeriesIdentity;
- foco seguro ao voltar de semelhantes para episódios.

### 4.7 Títulos semelhantes

Arquivo:

- src/features/catalog/pages/CatalogCategoryPage.tsx

Correção da navegação 3x2:

- Direita: 0 -> 1 -> 2 -> 3 -> 4 -> 5
- Esquerda: 5 -> 4 -> 3 -> 2 -> 1 -> 0
- Esquerda só sai para episódios quando estiver no primeiro card da primeira linha.
- Esquerda na primeira coluna da segunda linha volta para o último card da primeira linha.
- Direita na borda direita da primeira linha vai para a primeira coluna da segunda linha.
- Cima/baixo respeitam grade de 3 colunas.

Validação manual herdada da 2.8.25:

- Fire Stick validado como OK.
- Navegação D-pad em Títulos semelhantes validada como “DEU CERTO”.

## 5. Validações técnicas

### 5.1 Ciclo 3 — Validações obrigatórias

- Guard Live TV instantânea: OK
- GUARD_EXIT_CODE=0
- git diff --check: OK
- DIFF_CHECK_EXIT_CODE=0
- TypeScript: OK
- TSC_EXIT_CODE=0
- Vite build: OK
- VITE_BUILD_EXIT_CODE=0

Observações:

- Vite exibiu warning de chunks acima de 500 kB.
- Warning considerado não bloqueante para esta fase.

### 5.2 Ciclo 4 — Android

Primeira tentativa:

- npx cap copy android: falhou por EBUSY
- npx cap update android: falhou por EBUSY
- Gradle assembleDebug: falhou porque cordova.variables.gradle ficou ausente após update incompleto
- APK listado na primeira tentativa era arquivo antigo e não foi considerado validação da fase

Recuperação leve:

- ./gradlew.bat --stop: OK
- CAP_UPDATE_ANDROID_RETRY_EXIT_CODE=0
- cordova.variables.gradle recriado
- CAP_COPY_ANDROID_RETRY_EXIT_CODE=0
- GRADLE_ASSEMBLE_DEBUG_RETRY_EXIT_CODE=0
- BUILD SUCCESSFUL
- APK_LIST_RETRY_EXIT_CODE=0

Conclusão Android:

- Build Android aprovado após recuperação leve de EBUSY.
- Nenhuma alteração versionável inesperada em android/ foi registrada no status final.

## 6. Decisão de commit

- Commit realizado?: pendente no momento de criação deste relatório.
- Mensagem prevista: feat: precache series episodes and stabilize tv focus
- Arquivos previstos para commit:
  - .phase-locks/live-tv-instant.sha256
  - scripts/guards/check-live-tv-instant-lock.sh
  - src/features/app-installations/hooks/useAppInstallationHeartbeat.ts
  - src/features/bootstrap/services/appBootstrap.service.ts
  - src/features/catalog/pages/CatalogCategoryPage.tsx
  - src/features/catalog/services/seriesEpisodesCache.service.ts
  - docs/audits/fase-2-8-25-bootstrap-series-episodes-precache-e-tv-focus.md
  - docs/audits/fase-2-8-26-auditoria-pr-series-episodes.md

Justificativa:

- Escopo validado.
- Guard passou.
- TypeScript passou.
- Build Vite passou.
- Build Android passou após recuperação de EBUSY.
- Alterações estão alinhadas à missão da Fase 2.8.26.

## 7. Push e PR

- Push realizado?: pendente no momento de criação deste relatório.
- Branch remota: feat/bootstrap-series-episodes-precache
- PR aberta?: pendente
- Número da PR: pendente
- URL: pendente
- Base: main
- Head: feat/bootstrap-series-episodes-precache

## 8. Riscos restantes

- EBUSY recorrente no ambiente Windows/Dropbox pode reaparecer em builds Android futuros.
- O APK pode manter timestamp anterior se o Gradle considerar tarefas up-to-date, mesmo após build bem-sucedido.
- O pré-cache de episódios depende da qualidade dos metadados TMDB/título e da organização dos grupos da lista IPTV.
- O limite de até 8 coleções e 500 episódios por grupo foi adotado para equilibrar performance e ganho de UX.
- Warnings de chunk grande no Vite permanecem como dívida técnica não bloqueante.

## 9. Próximo passo recomendado

Marcar:

- [x] Auditar PR antes do merge.
- [ ] Corrigir item pontual antes do merge.
- [ ] Repetir teste Fire Stick.
- [x] Liberar abertura de PR após commit/push.
- [ ] Outra decisão.

Justificativa:

A fase passou nas validações técnicas e o escopo está controlado. A PR deve ser aberta para auditoria final antes de qualquer merge.

## 10. Confirmações finais

- [x] Repositório foi avaliado e sincronização foi confirmada.
- [x] Branch parte da main pós-PR #81.
- [x] Guard Live TV passou.
- [x] LiveTvPage não foi alterada.
- [x] Player Universal não foi alterado.
- [x] Player nativo não foi alterado.
- [x] NativePlayerActivity não foi alterado.
- [x] NativeAndroidPlayerPlugin não foi alterado.
- [x] server.url não foi criado.
- [x] live reload não foi reativado.
- [x] TypeScript passou.
- [x] Build Vite passou.
- [x] Build Android passou após recuperação leve de EBUSY.
- [x] Relatório foi criado.

## 11. Conclusão executiva

A Fase 2.8.26 está tecnicamente apta para commit seletivo, push e abertura de PR contra main.

A implementação consolida o pré-cache de episódios de séries/novelas, centraliza cache compartilhado, reduz risco de flicker em TV/Fire Stick, corrige navegação D-pad em Títulos semelhantes e fortalece o guard da Live TV instantânea para ambiente Windows/Git Bash.

A Live TV instantânea permanece protegida por checksum e marcadores obrigatórios. Player Universal, NativePlayerActivity, NativeAndroidPlayerPlugin, Supabase schema, server.url e live reload não foram alterados.
