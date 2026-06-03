# RELATÓRIO — FASE 3.16
## Plano de split da PR #88

## 1. Contexto

Projeto: Xandeflix 2.0
Repositório: xandeflix4/xandeflix-2.0
PR principal: #88 — Draft: reconcile PR87 local-first foundation with main
Branch: integration/pr87-main-reconcile-20260529-090721
Head base da análise: 8cfc1d873145db9aec775f8510f21e3d036bc3eb
Base: main

A Fase 3.15 concluiu que a PR #88 não deve ser mergeada diretamente, porque está ampla e sensível. A Fase 3.16 iniciou o planejamento de divisão da PR em blocos menores, sem alteração funcional.

## 2. Resultado do diagnóstico inicial

### Mergeability local

- Branch local e remoto sincronizados.
- Branch PR88 está à frente da main.
- `git merge-tree` não indicou conflito textual.
- `git diff --check origin/main...HEAD` passou após limpeza documental do relatório da Fase 3.15.
- O estado `mergeable=false` visto em alguns momentos no GitHub deve ser monitorado, mas não foi confirmado localmente como conflito textual.

### GitHub CLI local

O comando `gh` não está disponível no Git Bash local. Portanto, verificações de PR via terminal local não devem depender de `gh pr view` enquanto o CLI não estiver instalado/configurado.

## 3. Blocos identificados

### A — Docs/Audits

Arquivos:
- docs/audits/*

Avaliação:
- Bloco documental.
- Pode ser separado com baixo risco.
- Não altera runtime.

Recomendação:
- Primeira PR de split, se a decisão for dividir a PR #88.

### B — LocalCatalog / IndexedDB

Arquivos principais:
- src/features/localCatalog/pages/LocalCatalogSmokeTestPage.tsx
- src/features/localCatalog/services/localCatalogDb.service.ts
- src/features/localCatalog/services/localCatalogSmokeTest.service.ts
- src/features/localCatalog/services/localPlaylistImport.service.ts
- src/features/localCatalog/services/localPlaylistImportSmokeTest.service.ts
- src/features/localCatalog/types/localCatalog.types.ts
- src/features/localCatalog/types/localPlaylistImport.types.ts

Dependências reais:
- src/config/env.ts
- src/app/routes.tsx
- src/features/settings/pages/SettingsPage.tsx
- src/features/catalog/pages/PreparingHomePage.tsx

Motivo:
- `env.localCatalogSmokeTestEnabled` controla rota e botão de diagnóstico.
- `/debug/local-catalog-smoke` é registrado em routes.
- Settings mostra acesso ao diagnóstico.
- PreparingHomePage executa smoke test em background se a flag estiver ativa.

Recomendação:
- Não separar `src/features/localCatalog` sozinho.
- Criar PR LocalCatalog com as dependências mínimas de env, routes, settings e PreparingHomePage.

### C — Admin / Licensing / Supabase Functions

Arquivos principais:
- src/features/admin/pages/AdminDevicesPage.tsx
- src/features/admin/pages/AdminIptvSourcesPage.tsx
- src/features/admin/pages/AdminLicenseChannelsCachePage.tsx
- src/features/admin/pages/AdminLicensesPage.tsx
- src/features/admin/services/adminDevices.service.ts
- src/features/admin/services/adminIptvSources.service.ts
- src/features/admin/services/adminLicenseChannelsCache.service.ts
- src/features/admin/services/adminLicenses.service.ts
- src/features/licensing/services/licenseActivation.service.ts
- supabase/functions/activate-license/index.ts
- supabase/functions/create-license-device/index.ts
- supabase/functions/get-client-license-channels/index.ts
- supabase/functions/heartbeat-playback-session/index.ts
- supabase/functions/list-license-devices-admin/index.ts
- supabase/functions/start-playback-session/index.ts

Dependências reais:
- src/features/playlists/services/authorizedLicenseChannels.service.ts
- src/features/licensing/services/playbackSession.service.ts, se alterado em fase correlata.
- Settings e DirectSourcePlaylistPage já referenciam ativação de licença, mas não necessariamente precisam entrar no mesmo split se não houver diff nelas.

Recomendação:
- Criar PR própria para Admin/Licensing/Supabase.
- Validar funções Supabase e fluxo de licença separadamente.
- Não misturar com Player, Live TV ou Catálogo.

### D — Player / Android nativo

Arquivos principais:
- android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java
- android/app/src/main/java/com/xandeflix/app/NativePlayerActivity.java
- android/app/src/main/java/com/xandeflix/app/NativeStreamRequest.java
- src/features/player/lib/nativeAndroidPlayerAdapter.ts
- src/features/player/lib/nativeAndroidPlayerBridge.ts
- src/features/player/pages/UniversalPlayerPage.tsx
- src/features/player/types/player.ts

Dependências reais:
- src/features/catalog/services/episodePlaybackProgress.service.ts
- src/features/licensing/services/playbackSession.service.ts
- Capacitor App resume event.
- Android native plugin registrado em MainActivity.

Motivo:
- UniversalPlayer usa `direct=1`, `startPositionMs`, retorno do player nativo e atualização de posição de episódio.
- Native bridge expõe `startPreview`, `updatePreview`, `stopPreview`, `addListener('resume')`.
- Live TV depende desse bridge para preview inline nativo.

Recomendação:
- Criar PR própria para Player/Android nativo antes da PR de Live TV.
- Validar em tablet e Fire Stick.
- Não misturar com Home/Catalog/Admin.

### E — Live TV

Arquivo principal:
- src/features/live/pages/LiveTvPage.tsx

Dependências reais:
- src/features/player/lib/nativeAndroidPlayerBridge.ts
- src/features/player/lib/nativeAndroidPlayerAdapter.ts
- src/features/playlists/services/authorizedLicenseChannels.service.ts
- Player/Android nativo já precisa estar consolidado ou incluído em PR anterior.

Motivo:
- LiveTvPage usa preview inline nativo, atualização de layout do preview e retorno do fullscreen.
- Também passa `contentKind: 'live'` para canais autorizados.

Recomendação:
- Não abrir PR Live TV antes da PR Player/Android nativo.
- Pode ser PR própria depois do player, com validação mobile/tablet/TV.

### F — Home / Catalog / TMDB / Bootstrap

Arquivos principais:
- src/components/media/CatalogHero.tsx
- src/components/media/MediaCard.tsx
- src/components/tv/FocusableMediaCard.tsx
- src/features/bootstrap/services/appBootstrap.service.ts
- src/features/catalog/pages/CatalogCategoryPage.tsx
- src/features/catalog/pages/CatalogPage.tsx
- src/features/catalog/pages/PreparingHomePage.tsx
- src/features/catalog/services/catalogCategoryGroups.service.ts
- src/features/catalog/services/catalogWarmup.service.ts
- src/features/catalog/services/episodePlaybackProgress.service.ts
- src/features/catalog/services/homeVod.service.ts
- src/features/catalog/services/seriesHeroTmdb.service.ts

Dependências reais:
- PreparingHomePage possui dependência com LocalCatalog smoke test.
- episodePlaybackProgress também é usado pelo UniversalPlayer.
- Componentes TV podem ser compartilhados com layout/foco.

Recomendação:
- Dividir com cuidado.
- Se LocalCatalog entrar antes, preservar em Home apenas o que for realmente de Home/TMDB.
- Se Player entrar antes, avaliar se `episodePlaybackProgress.service.ts` deve ir no Player ou Catálogo.

### G — Layout / Mobile / Tablet

Arquivos principais:
- src/components/layout/AppHeader.tsx
- src/components/layout/MobileBottomNav.tsx

Dependências reais:
- Pode depender visualmente da Home/Catalog e da Live TV, mas tecnicamente parece menor.
- Ajuste de tablet retrato/paisagem foi validado na Fase 3.14.2J.

Recomendação:
- Pode ser PR pequena, mas somente após confirmar que não depende de alterações de Home/Catalog ainda não mergeadas.
- Validar tablet retrato e paisagem.

### H — Config / Rotas / Playlists / Settings

Arquivos:
- src/app/routes.tsx
- src/config/env.ts
- src/features/playlists/services/authorizedLicenseChannels.service.ts
- src/features/playlists/types/playlist.ts
- src/features/settings/pages/SettingsPage.tsx

Avaliação:
- Bloco transversal.
- Não deve virar PR isolada por padrão.
- Deve ser distribuído junto com o bloco funcional correspondente.

Distribuição sugerida:
- `src/config/env.ts`: LocalCatalog/local-first.
- `src/app/routes.tsx`: LocalCatalog smoke route.
- `SettingsPage.tsx`: LocalCatalog smoke access, se ligado à flag.
- `authorizedLicenseChannels.service.ts`: Admin/Licensing/Live TV, conforme diff final.
- `playlist.ts`: Admin/Licensing/playlist authorization, conforme diff final.

## 4. Ordem segura de split recomendada

### PR 1 — Docs/Audits

Escopo:
- docs/audits.

Objetivo:
- preservar rastreabilidade sem alterar runtime.

Risco:
- baixo.

### PR 2 — LocalCatalog/IndexedDB + diagnóstico protegido por flag

Escopo:
- src/features/localCatalog.
- env localCatalog/local-first.
- rota debug localCatalog protegida por flag.
- botão/atalho em Settings protegido por flag.
- smoke test em PreparingHomePage, se mantido.

Validações:
- TypeScript.
- Vite build.
- Smoke test localCatalog.
- Garantir que sem flag ativa não aparece rota/botão/debug.

### PR 3 — Admin/Licensing/Supabase Functions

Escopo:
- Admin pages/services.
- Licensing service.
- Supabase Functions relacionadas.
- authorizedLicenseChannels se necessário.

Validações:
- TypeScript.
- Vite build.
- Validação de funções Supabase.
- Fluxo de ativação/licenças/devices.

### PR 4 — Player/Android nativo

Escopo:
- Android native player.
- Native stream request.
- Native bridge/adapter.
- UniversalPlayer.
- episodePlaybackProgress se necessário para retomada.

Validações:
- TypeScript.
- Vite build.
- Gradle assembleDebug.
- APK no tablet.
- Fire Stick quando disponível.
- Retomada `startPositionMs`.
- Fluxo `direct=1`.

### PR 5 — Live TV preview inline

Escopo:
- LiveTvPage.
- Apenas dependências mínimas já consolidadas pelo Player.

Validações:
- TypeScript.
- Vite build.
- APK.
- Tablet retrato/paisagem.
- Fire Stick quando disponível.
- Preview inline.
- Fullscreen.
- Retorno do fullscreen.
- Troca de canal.

### PR 6 — Home/Catalog/TMDB/Bootstrap

Escopo:
- Catalog/Home/TMDB/bootstrap.
- Hero/cards.
- warmup/cache.
- seriesHeroTmdb.

Validações:
- TypeScript.
- Vite build.
- Home mobile.
- Tablet retrato/paisagem.
- D-pad/TV.
- TMDB/cache.
- Catálogo filmes/séries.

### PR 7 — Layout mobile/tablet

Escopo:
- AppHeader.
- MobileBottomNav.

Validações:
- Tablet retrato.
- Tablet paisagem.
- Home.
- Filmes.
- Séries.
- Ao Vivo.
- Rodapé.
- Sem duplicidade Buscar/Perfil/Sair.

## 5. Guardrails

- Não fazer merge da PR #88.
- Não marcar PR #88 como Ready for Review.
- Não fechar PR #87.
- Não criar branches de split antes de aprovar este plano.
- Não alterar código funcional durante planejamento.
- Não alterar Live TV sem fase própria.
- Não alterar Player sem fase própria.
- Não alterar Android nativo sem fase própria.
- Não alterar Supabase sem fase própria.
- Não alterar Capacitor config sem necessidade explícita.
- Trabalhar por ciclos pequenos.
- Usar Git Bash no Windows.
- Não usar Python no terminal.

## 6. Conclusão

A PR #88 pode ser dividida, mas o split precisa respeitar dependências reais. A divisão segura não é puramente por pasta. O plano recomendado é começar por documentação, depois LocalCatalog com suas flags/rotas mínimas, depois Admin/Supabase, depois Player/Android nativo, depois Live TV, depois Home/Catalog/TMDB e por fim Layout mobile/tablet.

A próxima ação recomendada é revisar este relatório, commitar e publicar o documento na branch da PR #88. Somente depois disso deve ser decidido se a Fase 3.17 iniciará a criação da primeira branch de split.
