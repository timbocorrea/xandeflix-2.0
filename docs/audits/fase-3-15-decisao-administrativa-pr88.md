# RELATÓRIO FINAL — FASE 3.15
## Decisão administrativa da PR #88

## 1. Contexto

Projeto: Xandeflix 2.0
Repositório: xandeflix4/xandeflix-2.0
PR principal: #88 — Draft: reconcile PR87 local-first foundation with main
Branch: integration/pr87-main-reconcile-20260529-090721
Head validado: 32e4053e971f2a46290cfcb5759dc978c9730f7f
Base: main
Head da main no ciclo: 7210a7516f4f025736d7082b77cdf4d135cfd6b4

Objetivo da fase: executar decisão administrativa da PR #88 antes de qualquer novo desenvolvimento, merge ou Ready for Review.

## 2. Resultado dos ciclos administrativos

### Ciclo 1 — Estado final local/remoto

Resultado validado:

- Branch local correta: integration/pr87-main-reconcile-20260529-090721.
- Working tree limpo.
- Fetch remoto executado com sucesso.
- HEAD local igual ao remoto.
- Local x remoto da branch PR88: 0 0.
- PR #88 confirmada como aberta, Draft, não mergeada e mergeable=true.
- PR #87 confirmada como aberta, Draft, não mergeada e mergeable=false.

Observação: no terminal local, os comandos `gh pr view 88` e `gh pr view 87` não imprimiram JSON porque stderr foi silenciado por `2>/dev/null || true`. A validação do estado das PRs foi confirmada fora do terminal local.

### Ciclo 2 — Mapeamento da PR #88 por blocos

Resultado validado:

A PR #88 contém múltiplos blocos independentes e sensíveis, incluindo documentação, LocalCatalog, Admin, Licensing, Supabase Functions, Player, Android nativo, Live TV, Home/Catalog/TMDB/Bootstrap, Layout mobile/tablet, rotas, playlists, settings e configuração.

## 3. Estado da PR #88

- State: open.
- Draft: true.
- Merged: false.
- Mergeable: true.
- Head: 32e4053e971f2a46290cfcb5759dc978c9730f7f.
- Commits: 57.
- Changed files: 83.
- Additions: 12.722.
- Deletions: 539.

## 4. Estado da PR #87

- State: open.
- Draft: true.
- Merged: false.
- Mergeable: false.
- Head: 4925d0d9fa6de3f0abc9e116ac676fa19ff67bda.
- Commits: 41.
- Changed files: 72.
- Additions: 9.590.
- Deletions: 367.

Observação: a PR #87 permanece como referência histórica da base local-first/importador, mas não deve ser mergeada diretamente porque está divergente e não mergeável.

## 5. Blocos identificados na PR #88

### A — Docs/Audits

Quantidade identificada: 34 arquivos em `docs/audits`.

Natureza:
- Relatórios de reconciliação.
- Auditorias PR88.
- Validações Home/VOD/Live.
- Estratégia Bootstrap/TMDB.
- Relatórios LocalCatalog/IndexedDB.
- Relatórios Supabase/local-first.
- Relatórios de validação APK/tablet.
- Relatório Admin/Licensing.

Avaliação:
- Bloco documental.
- Pode ser separado com baixo risco funcional.
- Ajuda na rastreabilidade, mas aumenta muito o volume da PR principal.

### B — LocalCatalog / IndexedDB

Arquivos:
- src/features/localCatalog/pages/LocalCatalogSmokeTestPage.tsx
- src/features/localCatalog/services/localCatalogDb.service.ts
- src/features/localCatalog/services/localCatalogSmokeTest.service.ts
- src/features/localCatalog/services/localPlaylistImport.service.ts
- src/features/localCatalog/services/localPlaylistImportSmokeTest.service.ts
- src/features/localCatalog/types/localCatalog.types.ts
- src/features/localCatalog/types/localPlaylistImport.types.ts

Avaliação:
- Bloco funcional próprio.
- Deve permanecer isolado de Supabase.
- Pode virar PR dedicada de fundação LocalCatalog/IndexedDB.
- Exige validação específica de smoke test local e importador progressivo.

### C — Admin / Licensing / Supabase Functions

Arquivos:
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

Avaliação:
- Bloco sensível.
- Toca Admin, licenças, devices e Supabase Functions.
- Deve ser separado da camada de player, Live TV e layout.
- Exige validação própria de backend/funções antes de merge.

### D — Player / Android nativo

Arquivos:
- android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java
- android/app/src/main/java/com/xandeflix/app/NativePlayerActivity.java
- android/app/src/main/java/com/xandeflix/app/NativeStreamRequest.java
- src/features/player/lib/nativeAndroidPlayerAdapter.ts
- src/features/player/lib/nativeAndroidPlayerBridge.ts
- src/features/player/pages/UniversalPlayerPage.tsx
- src/features/player/types/player.ts

Avaliação:
- Bloco altamente sensível.
- Toca Android nativo, bridge, Player Universal, retomada/progresso e fallback de stream.
- Não deve ser misturado com Home/Catalog/Admin/Supabase em merge amplo.
- Exige validação em tablet e Fire Stick.

### E — Live TV

Arquivo:
- src/features/live/pages/LiveTvPage.tsx

Avaliação:
- Bloco sensível por impactar preview inline e UX mobile/tablet/TV.
- Apesar de conter apenas um arquivo, está ligado ao Player/Android nativo.
- Deve ser tratado como PR própria ou como parte de uma PR controlada de Live TV + Player, dependendo da dependência real do diff.

### F — Home / Catalog / TMDB / Bootstrap

Arquivos:
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

Avaliação:
- Bloco grande e funcional.
- Toca Home, Catálogo, TMDB, Hero, cards, bootstrap, warmup e progresso de episódios.
- Deve ser separado do bloco Admin/Supabase e do bloco Android nativo.
- Exige validação visual e funcional em mobile/tablet/TV.

### G — Layout / Mobile / Tablet

Arquivos:
- src/components/layout/AppHeader.tsx
- src/components/layout/MobileBottomNav.tsx

Avaliação:
- Bloco pequeno e relativamente isolável.
- Contém ajuste validado de tablet retrato/paisagem.
- Pode ser uma PR pequena de UI/UX mobile-tablet, desde que não dependa de alterações maiores do catálogo.

### H — Config / Rotas / Playlists / Settings

Arquivos:
- src/app/routes.tsx
- src/config/env.ts
- src/features/playlists/services/authorizedLicenseChannels.service.ts
- src/features/playlists/types/playlist.ts
- src/features/settings/pages/SettingsPage.tsx

Avaliação:
- Bloco transversal.
- Pode conter ligações entre LocalCatalog, debug route, settings e autorização de canais.
- Deve ser auditado com cuidado antes de separar, porque pode carregar dependências entre blocos.

## 6. Riscos identificados

### PR ampla

A PR #88 tem 57 commits, 83 arquivos alterados, 12.722 adições e 539 remoções. Esse tamanho dificulta revisão, rollback e identificação de regressões.

### Áreas sensíveis misturadas

A PR toca simultaneamente:
- Catálogo.
- Home.
- TMDB/cache/bootstrap.
- Live TV.
- Player.
- Android nativo.
- Supabase Functions.
- Admin.
- Licensing.
- LocalCatalog.
- Settings.
- Rotas.
- Documentação.

### Risco de regressão cruzada

Uma falha em Player, Android nativo, Live TV, Home ou Supabase pode ser difícil de isolar se tudo for mergeado junto.

### Risco de rollback complexo

Rollback total da PR #88 removeria também partes já validadas, como LocalCatalog, Home/TMDB mobile, Live TV mobile preview inline e correção tablet.

### Risco administrativo da PR #87

A PR #87 ainda está aberta, Draft e não mergeável. Fechá-la sem decisão explícita pode destruir rastreabilidade histórica. Mantê-la aberta sem observação também pode gerar confusão futura.

## 7. Opções avaliadas

### Opção 1 — Manter PR #88 Draft

Prós:
- Preserva o estado validado.
- Evita merge prematuro.
- Mantém rastreabilidade.
- Permite planejar split com segurança.

Contras:
- Não reduz o tamanho da PR.
- Mantém acúmulo de alterações em uma branch ampla.

Avaliação:
- Opção segura no curto prazo.

### Opção 2 — Dividir PR #88 em PRs menores

Prós:
- Facilita revisão.
- Reduz risco de regressão.
- Permite merges controlados por domínio.
- Facilita rollback por bloco.
- Isola Player/Android nativo, Live TV, LocalCatalog, Admin/Supabase e UI.

Contras:
- Exige planejamento cuidadoso.
- Pode haver dependências entre rotas, settings, LocalCatalog e catálogo.
- Pode exigir cherry-pick seletivo e nova validação por bloco.

Avaliação:
- Melhor opção técnica antes de merge, desde que feita em fase própria e controlada.

### Opção 3 — Marcar PR #88 Ready for Review

Prós:
- Permite revisão formal.

Contras:
- PR ainda está ampla demais.
- Revisão seria difícil e sujeita a erro.
- Não resolve risco de regressão cruzada.

Avaliação:
- Não recomendado agora.

### Opção 4 — Mergear PR #88 diretamente

Prós:
- Levaria rapidamente as validações para main.

Contras:
- Alto risco por volume e mistura de escopos.
- Rollback complexo.
- Áreas sensíveis demais em um único merge.
- PR #87 ainda precisa de decisão administrativa.

Avaliação:
- Não recomendado.

## 8. Decisão recomendada

Marcação administrativa:

- [x] Manter PR #88 Draft.
- [x] Planejar divisão da PR #88 em PRs menores antes de qualquer merge.
- [ ] Preparar PR #88 para Ready for Review agora.
- [ ] Mergear PR #88 agora.
- [ ] Fechar PR #87 agora.
- [x] Manter PR #87 aberta por enquanto.

Justificativa:

A PR #88 está tecnicamente validada em vários checkpoints, mas seu escopo é grande demais para merge seguro. O estado mais prudente é manter a PR #88 como branch de integração validada e iniciar uma fase posterior específica para planejamento de split, com criação de PRs menores por blocos funcionais.

## 9. Estratégia sugerida para fase posterior

Fase posterior recomendada: Fase 3.16 — Plano de split da PR #88.

Ordem preliminar sugerida:

1. PR documental:
   - docs/audits.

2. PR LocalCatalog/IndexedDB:
   - src/features/localCatalog.
   - Rotas/settings somente se indispensáveis ao smoke test.

3. PR Admin/Licensing/Supabase:
   - src/features/admin.
   - src/features/licensing.
   - supabase/functions.

4. PR Player/Android nativo:
   - android/app/src/main/java.
   - src/features/player.

5. PR Live TV preview inline:
   - src/features/live.
   - Dependências mínimas com Player/bridge se necessário.

6. PR Home/Catalog/TMDB/Bootstrap:
   - src/features/catalog.
   - src/features/bootstrap.
   - src/components/media.
   - src/components/tv.

7. PR Layout mobile/tablet:
   - src/components/layout.
   - Ajustes de header/bottom nav.

8. PR transversal final:
   - src/app/routes.tsx.
   - src/config/env.ts.
   - src/features/playlists.
   - src/features/settings.
   - Apenas se não couberem naturalmente nas PRs anteriores.

## 10. Guardrails para continuidade

- Não fazer merge da PR #88.
- Não marcar PR #88 como Ready for Review.
- Não fechar PR #87.
- Não iniciar nova funcionalidade.
- Não alterar Live TV sem fase própria.
- Não alterar Player sem fase própria.
- Não alterar Android nativo sem fase própria.
- Não alterar Supabase sem fase própria.
- Não alterar Capacitor config sem necessidade explícita.
- Trabalhar por ciclos pequenos.
- Usar Git Bash no Windows.
- Não usar Python no terminal.
- Validar TypeScript, build, diff check e APK conforme o bloco alterado.
- Fazer validação runtime por dispositivo quando o bloco envolver UI, Player, Live TV ou Android nativo.

## 11. Conclusão executiva

A Fase 3.15 conclui que a PR #88 deve permanecer como Draft e não deve ser mergeada no estado atual. A PR é útil como branch de integração validada, mas é ampla demais para entrar na main em um único merge.

A decisão mais segura é preservar a PR #88 como referência consolidada e iniciar fase posterior para dividir o conteúdo em PRs menores, revisáveis e com validação independente.
