# Fase 3.14.2F — Correção segura Mobile / TMDB / Home

## Branch

`integration/pr87-main-reconcile-20260529-090721`

## Objetivo

Corrigir e estabilizar a Home mobile, Hero, cards e metadados TMDB sem alterar Player, Live TV, Android nativo, Supabase, D-pad global ou fluxo `direct=1`.

## Arquivos alterados

- `android/app/capacitor.build.gradle`
- `src/components/layout/AppHeader.tsx`
- `src/components/layout/MobileBottomNav.tsx`
- `src/components/media/CatalogHero.tsx`
- `src/features/bootstrap/services/appBootstrap.service.ts`
- `src/features/catalog/pages/CatalogCategoryPage.tsx`
- `src/features/catalog/pages/CatalogPage.tsx`
- `src/features/catalog/services/seriesHeroTmdb.service.ts`

## Correções consolidadas

### Header mobile

O `AppHeader` deixou de renderizar ações no mobile, removendo o topo duplicado com busca, perfil e sair.

### Rodapé mobile

O `MobileBottomNav` foi ajustado para manter:

- Início
- Buscar
- Ajustes
- Perfil

O item `Canais` foi removido do rodapé mobile.

Durante a auditoria, foi identificado que `/search` e `/profile` não existem em `src/app/routes.tsx`. Por segurança, os itens Buscar e Perfil foram mantidos como ações neutras via `spatialDebug`, sem navegação para rotas inexistentes.

### Hero e Home mobile

O `CatalogHero` recebeu patch CSS isolado por:

`.xf-app[data-device-form-factor="mobile"]`

Objetivo:

- melhorar a ocupação vertical do Hero no celular;
- evitar conteúdo escondido;
- preservar tablet e TV.

### Bootstrap / TMDB / cache

O `appBootstrap.service.ts`, `CatalogPage.tsx`, `CatalogCategoryPage.tsx` e `seriesHeroTmdb.service.ts` foram ajustados para melhorar o reaproveitamento de dados TMDB/cache e reduzir risco de Home mobile vazia ou sem imagens.

### Android / Java

O `capacitor.build.gradle` foi atualizado para Java 21.

Ambiente validado:

- `java 21.0.10`
- `javac 21.0.10`

## Áreas preservadas

Auditoria local confirmou ausência de alterações em:

- `src/features/live/`
- `src/features/player/`
- `android/app/src/main/java/com/xandeflix/app/Native*`
- `supabase/`

## Validações executadas

Executado com sucesso:

- `git diff --check`
- `npx.cmd --no-install tsc -b`
- `npx.cmd --no-install vite build`
- `npx.cmd cap sync android`
- `cd android && ./gradlew assembleDebug`

Resultados:

- `DIFF_CHECK_EXIT_CODE=0`
- `TSC_EXIT_CODE=0`
- `VITE_BUILD_EXIT_CODE=0`
- `CAP_SYNC_EXIT_CODE=0`
- `GRADLE_ASSEMBLE_DEBUG_EXIT_CODE=0`

APK gerado:

`android/app/build/outputs/apk/debug/app-debug.apk`

Tamanho observado:

`8.0M`

## Riscos restantes

- Validar visualmente em celular Android real.
- Validar rapidamente em tablet.
- Validar regressão curta em Fire Stick/Android TV.
- Buscar e Perfil ainda não possuem telas reais.
- PR #88 segue ampla e deve permanecer Draft até auditoria final.

## Recomendação

Manter esta fase como checkpoint seguro de Home/TMDB/mobile.

Não fazer merge na `main` sem validação visual no celular e auditoria final do Analista Mestre.

## Validação visual em celular Android real

Resultado informado após instalação no celular Samsung:

- Home carregou: sim.
- Hero aparece com imagem/texto: sim.
- Cards aparecem com capas: sim.
- Rodapé mostra Início / Buscar / Ajustes / Perfil: sim.
- Buscar ou Perfil não quebram a tela: apenas permanecem no app.

Conclusão da validação mobile:

A correção mobile/Home/TMDB foi aprovada no celular Android real para o escopo desta fase.

## Validação visual em celular Android real

Resultado informado após instalação no celular Samsung:

- Home carregou: sim.
- Hero aparece com imagem/texto: sim.
- Cards aparecem com capas: sim.
- Rodapé mostra Início / Buscar / Ajustes / Perfil: sim.
- Buscar ou Perfil não quebram a tela: apenas permanecem no app.

Conclusão da validação mobile:

A correção mobile/Home/TMDB foi aprovada no celular Android real para o escopo desta fase.
