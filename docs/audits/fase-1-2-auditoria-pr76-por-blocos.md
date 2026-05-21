# RELATÓRIO FINAL — FASE 1.2
## Auditoria técnica da PR #76 por blocos — Xandeflix 2.0

## 1. Contexto

Projeto: Xandeflix 2.0
Repositório: xandeflix4/xandeflix-2.0
Branch analisada: feat/home-netflix-like-proportions
PR analisada: #76 — feat: polish home tv proportions and dpad flow

A PR #76 está aberta, não foi mergeada, não é draft e está mergeable. Ela possui 12 commits, 29 arquivos alterados, 3130 adições e 626 remoções.

## 2. Objetivo da fase

Auditar tecnicamente a PR #76 por blocos, sem implementar código novo, para decidir se a PR pode ser mergeada, corrigida, dividida ou reconstruída.

## 3. Estado inicial da auditoria

- Branch: feat/home-netflix-like-proportions
- Status inicial: branch alinhada com origin/feat/home-netflix-like-proportions
- Local x remoto: 0 0
- Branch x main: 12 1
- Patch Live TV preservado: docs/audits/patches/live-tv-preview-player-local-before-pr76-audit.patch
- Working tree funcional limpo: sim, sem diff funcional local
- Pendências locais: apenas relatórios de auditoria e patch Live TV não rastreados

## 4. Resumo da PR #76

- Estado: aberta
- Mergeable: true
- Draft: false
- Merged: false
- Commits: 12
- Arquivos alterados: 29
- Adições: 3130
- Remoções: 626
- Escopo declarado: Home visual, proporções Netflix-like e fluxo D-pad
- Escopo real observado: Home, Catalog, Hero, Cards, D-pad, foco, TMDB, warmup, Supabase Functions, importação IPTV, cache, Settings, Admin, rotas, CSS global, Vite e Capacitor

## 5. Bloco 1 — Home / Catalog / Hero / Cards

Arquivos auditados:

- src/components/media/CatalogHero.tsx
- src/components/media/MediaCard.tsx
- src/components/tv/FocusableMediaCard.tsx
- src/features/catalog/data/catalogSections.ts
- src/features/catalog/pages/CatalogCategoryPage.tsx
- src/features/catalog/pages/CatalogLaunchesPage.tsx
- src/features/catalog/pages/CatalogPage.tsx
- src/features/catalog/services/catalogCategoryGroups.service.ts
- src/features/catalog/services/homeVod.service.ts

Pontos positivos:

- Home ficou mais próxima do padrão visual de streaming.
- Hero passou a usar dados reais do catálogo, incluindo backdrop, poster e overview.
- Cards ficaram mais leves visualmente e com foco menos agressivo.
- Foi criada tela de categoria com grid de 5 colunas.
- Rota de lançamentos reaproveita a tela de categoria.
- Serviço de VOD passou a separar lançamentos, filmes, séries e outros conteúdos.
- Cache em memória de Home VOD foi adicionado.
- Categoria abre player via query string.

Riscos:

- Cards da Home ainda não abrem player; apenas executam debug.
- Botões do Hero ainda não executam ação real de assistir ou detalhes.
- A tela de categoria é uma funcionalidade nova grande dentro da PR.
- `streamUrl` é passado pela URL do player.
- Filtros `requireTmdbMatched` e `requireTmdbPoster` podem ocultar muitos conteúdos se o enriquecimento TMDB estiver incompleto.
- Há formatação ruim real em `homeVod.service.ts`: `}  const sections = [`.
- Hero usa import de Google Fonts dentro do componente.
- Rotação automática do Hero pode interferir no uso por D-pad.

Correções necessárias:

- Corrigir formatação em `homeVod.service.ts`.
- Decidir se Home cards e Hero devem abrir player nesta PR ou ficar explicitamente fora do escopo.
- Remover import de fonte dentro de componente ou mover para estratégia global controlada.
- Validar uso de `streamUrl` na query string.

Testes obrigatórios:

- Home com licença real.
- Home sem TMDB completo.
- Hero com múltiplos itens.
- Hero com poucos itens.
- Card focus em Fire Stick.
- Abertura de `/launches`.
- Abertura de `/category/:groupSlug`.
- Player a partir da categoria.
- Back da categoria para Home.

Conclusão do bloco:

- Risco médio-alto. Aproxima o MVP visual, mas mistura visual, dados, player, categoria, foco e cache.

## 6. Bloco 2 — D-pad / foco / navegação espacial

Arquivos auditados:

- src/hooks/useCatalogGridNavigation.ts
- src/hooks/useRouteInitialFocus.ts
- src/lib/spatial/focusNavigation.ts
- src/features/tv-focus/focusKeys.ts
- src/components/layout/AppShell.tsx
- src/components/layout/TvSidebar.tsx

Pontos positivos:

- Navegação vertical entre rails tenta usar proximidade horizontal real.
- Fallbacks de foco foram ampliados para Home, Live e Settings.
- Sidebar passou a enviar foco para entrypoints específicos por rota.
- AppShell identifica Fire TV por user agent e expõe data attribute.
- Foco inicial da Home tenta encontrar primeiro item real montado.

Riscos:

- Forte dependência de DOM e `getBoundingClientRect`.
- Uso de estado global `window.__XANDEFLIX_LAST_CATALOG_FOCUS_KEY`.
- Escopo inclui Live e Settings, não apenas Home.
- Detecção de Fire TV por user agent é frágil.
- Entry points precisam validação real no Fire Stick.

Correções necessárias:

- Validar fallback de foco quando os elementos ainda não estiverem montados.
- Confirmar se alterações de Live/Settings pertencem a esta PR.
- Garantir que D-pad não fique preso em Sidebar, Hero, Settings ou Live.

Testes obrigatórios:

- Sidebar → Home.
- Sidebar → Live.
- Sidebar → Settings.
- Header → Hero.
- Hero → Rails.
- Rails → Hero.
- Rails com scroll horizontal.
- Voltar para Home após navegar categorias/player.
- Fire Stick real.

Conclusão do bloco:

- Risco médio-alto. Melhorias são úteis, mas mexem no núcleo da navegação.

## 7. Bloco 3 — TMDB / warmup / cache

Arquivos auditados:

- src/features/catalog/services/catalogWarmup.service.ts
- src/features/catalog/services/homeVod.service.ts
- supabase/functions/enrich-license-channels-tmdb/index.ts
- supabase/functions/get-client-license-channels/index.ts

Pontos positivos:

- Warmup VOD/TMDB em background foi criado.
- Edge Function `enrich-license-channels-tmdb` ganhou modo `vod-warmup`.
- Warmup valida licença, dispositivo, status e expiração.
- Estratégias `round-robin` e `priority` foram adicionadas.
- Métricas de warmup foram adicionadas.
- `get-client-license-channels` agora retorna campos TMDB.
- Foram adicionados filtros `requireTmdbMatched` e `requireTmdbPoster`.

Riscos:

- Escopo grande: 1160 adições e 43 remoções em 4 arquivos.
- Edge Function de TMDB cresceu muito e mexe em dados reais.
- `vod-warmup` cria caminho de execução antes do bearer token, validado por licença/dispositivo.
- `clearTmdbMetadata` pode apagar metadados existentes em casos de skip/not_found/error.
- Regex de canal linear pode gerar falso positivo.
- Warmup pode gerar carga relevante em Supabase/TMDB.
- Warmup foi criado, mas em `routes.tsx` o import aparece comentado/pausado.

Correções necessárias:

- Revisar segurança do modo `vod-warmup`.
- Revisar se deve retornar `licenseId` no response do cliente.
- Validar `clearTmdbMetadata`.
- Decidir se warmup fica ativo ou removido desta PR.
- Corrigir formatação detectada em `homeVod.service.ts`.

Testes obrigatórios:

- Warmup com licença ativa.
- Warmup com licença bloqueada/inativa/expirada.
- Warmup com dispositivo inativo.
- Warmup com TMDB incompleto.
- Home antes e depois do warmup.
- Carga/tempo de execução da Edge Function.
- Validação de retorno de `get-client-license-channels`.

Conclusão do bloco:

- Risco alto. Estratégico para MVP, mas deveria estar em PR separada ou exigir validação dedicada.

## 8. Bloco 4 — Supabase / importação IPTV / cache

Arquivos auditados:

- supabase/functions/import-license-iptv-source-channels/index.ts
- supabase/functions/list-license-channels-cache/index.ts
- src/features/playlists/services/authorizedLicenseChannels.service.ts

Pontos positivos:

- Importação IPTV foi refatorada para leitura por stream.
- Escrita passou a ocorrer em lotes.
- `content_kind` é classificado durante importação.
- Proteções foram adicionadas para não inativar canais em importação limitada ou parcial.
- `IPTV_SOURCE_PARTIAL_IMPORT` foi criado.
- Listagem de grupos passou a paginar.
- Serviço frontend repassa `requireTmdbMatched` e `requireTmdbPoster`.

Riscos:

- Escopo grande: 653 adições e 400 remoções.
- `DEFAULT_IMPORT_LIMIT` e `MAX_IMPORT_LIMIT` subiram para 350000.
- `FETCH_TIMEOUT_MS` subiu para 300000.
- Importação parcial pode gravar dados antes de falhar.
- Métricas de insert/update/reactivate perderam precisão por causa de upsert.
- Classificação automática de `content_kind` pode errar.
- `listAllChannelGroups` pode listar grupos de canais inativos.
- Formatação suspeita em `list-license-channels-cache/index.ts`.

Correções necessárias:

- Reavaliar limites de importação e timeout.
- Validar importação com playlist grande real.
- Validar classificação `live/movie/series/unknown`.
- Ajustar métricas exibidas no Admin se necessário.
- Avaliar filtro `is_active` na listagem de grupos.
- Corrigir formatação.

Testes obrigatórios:

- Importação M3U pequena.
- Importação M3U grande.
- Importação limitada.
- Importação parcial/interrompida.
- Reimportação com canais removidos.
- Reimportação com canais novos.
- Verificação de `content_kind`.
- Listagem de grupos no Admin.

Conclusão do bloco:

- Risco alto. Boa direção técnica, mas não deveria estar misturado com Home/D-pad sem PR separada.

## 9. Bloco 5 — Settings / Admin / rotas / Vite / Capacitor

Arquivos auditados:

- src/app/routes.tsx
- src/features/settings/pages/SettingsPage.tsx
- src/features/admin/pages/AdminLicensesPage.tsx
- src/features/admin/services/adminLicenses.service.ts
- capacitor.config.ts
- vite.config.ts

Pontos positivos:

- Novas rotas `/launches` e `/category/:groupSlug` foram protegidas por LicenseRoute.
- Settings passou a usar foco inicial.
- Admin reconhece `IPTV_SOURCE_PARTIAL_IMPORT`.
- Tipos do resultado de importação foram atualizados.

Riscos:

- `capacitor.config.ts` aponta para `http://127.0.0.1:5173`.
- `vite.config.ts` contém `cacheDir` absoluto de máquina local.
- Comentário duplicado em `routes.tsx`.
- Warmup VOD aparece comentado/pausado.
- Rotas novas aumentam escopo da PR.

Correções necessárias:

- Remover `server.url` local do `capacitor.config.ts` antes de qualquer merge.
- Remover `cacheDir` absoluto do `vite.config.ts`.
- Corrigir comentários duplicados e espaçamento.
- Decidir sobre warmup pausado.

Testes obrigatórios:

- Build web.
- Build Android/Capacitor sem server.url local.
- Fire Stick instalado sem dependência de dev server.
- Rotas `/launches` e `/category/:groupSlug`.
- Settings com foco inicial.
- Admin importando e exibindo métricas.

Conclusão do bloco:

- Risco alto e bloqueador. A PR não pode ser mergeada como está por causa das configurações de Vite/Capacitor.

## 10. Bloco 6 — CSS global / impacto visual

Arquivo auditado:

- src/styles/globals.css

Pontos positivos:

- Foco visual ficou menos pesado.
- Ajustes específicos para Fire TV foram adicionados.
- `.xf-tv-safe-main` melhora respiro lateral.
- Carrosséis ocultam scrollbar.
- `contain: layout paint` pode melhorar performance.
- Proporções da Home foram ajustadas para TV/tablet/Fire Stick.

Riscos:

- CSS global afeta o app inteiro.
- Foco visual pode ficar discreto demais em TV.
- `contain: layout paint` pode gerar efeitos colaterais em foco/scroll/overlays.
- Ajustes Fire TV dependem de user agent.
- `.media-card`, `.tv-focusable` e `.xf-carousel-row` impactam outras telas.

Correções necessárias:

- Validar foco visual no Fire Stick.
- Validar impacto fora da Home.
- Confirmar se regras globais deveriam ser escopadas.

Testes obrigatórios:

- Home web.
- Home Fire Stick.
- Categoria.
- Live TV.
- Settings.
- Player.
- Navegação por D-pad com foco visível.

Conclusão do bloco:

- Risco médio. Alinhado ao objetivo visual, mas exige validação real.

## 11. Validações executadas

- git diff --check: OK, exit code 0
- npx.cmd tsc -b: OK, exit code 0
- vite build temporário: OK, exit code 0
- status final após limpeza do build temporário: apenas relatórios/patches não rastreados
- avisos relevantes:
  - chunks acima de 500 kB após minificação
  - index JS principal acima de 500 kB
  - hls chunk acima de 500 kB
  - plugin timings relevantes no Vite/Tailwind/Rolldown

## 12. Riscos de código Frankenstein

Riscos identificados:

- PR mistura visual, foco, backend, cache, importação IPTV, rotas, Admin, Settings, Vite, Capacitor e CSS global.
- Edge Functions críticas foram alteradas junto com Home.
- Importação IPTV foi reestruturada na mesma PR de layout.
- Warmup TMDB foi criado, mas aparenta estar pausado/comentado.
- Configurações locais de desenvolvimento entraram na PR.
- Há funcionalidades parcialmente conectadas: Hero/Home não abrem player, mas categoria abre.
- Alterações globais de CSS/foco podem impactar telas não relacionadas.

## 13. Impacto no MVP

A PR aproxima o MVP em:

- Home mais visual e semelhante a streaming.
- Categoria de lançamentos.
- Melhor separação Live/VOD.
- Uso de TMDB na Home.
- Melhor foco D-pad.
- Suporte a listas IPTV grandes.

A PR afasta ou ameaça o MVP em:

- Escopo excessivo.
- Configurações bloqueadoras de produção.
- Alto risco em Edge Functions.
- Alterações difíceis de revisar/rollback.
- Possibilidade de regressão em Fire Stick.
- Mistura de responsabilidades.

## 14. Decisão técnica recomendada

Marcar uma opção:

- [ ] Mergear a PR #76.
- [x] Corrigir a PR #76 antes do merge.
- [x] Dividir a PR #76 em PRs menores.
- [ ] Fechar a PR #76 e reconstruir por branches limpas.
- [x] Manter a PR aberta para nova auditoria.
- [ ] Outra decisão.

Justificativa:

A PR #76 contém avanços importantes, mas não deve ser mergeada como está. Há bloqueadores claros em `capacitor.config.ts` e `vite.config.ts`, além de escopo excessivo e alterações de alto risco em Edge Functions/importação IPTV. A melhor decisão é corrigir imediatamente os bloqueadores e, em seguida, decidir entre dividir a PR ou manter aberta com nova auditoria focada.

## 15. Próximo passo lógico

Fase 1.3 — Correção mínima de bloqueadores da PR #76, sem implementar nova funcionalidade:

1. Remover `server.url` local do `capacitor.config.ts`.
2. Remover `cacheDir` absoluto do `vite.config.ts`.
3. Corrigir formatação de `homeVod.service.ts`.
4. Corrigir comentário duplicado em `routes.tsx`.
5. Corrigir formatação suspeita em `list-license-channels-cache/index.ts`.
6. Rodar `git diff --check`, `npx.cmd tsc -b` e build Vite.
7. Gerar relatório de correção.
8. Só depois decidir se a PR será corrigida, dividida ou reconstruída.

## 16. Confirmações finais

- [x] Nenhum código funcional foi alterado durante a auditoria.
- [x] Nenhum commit foi feito.
- [x] Nenhum push foi feito.
- [x] Nenhum merge foi feito.
- [x] A PR #76 não foi alterada.
- [x] O patch Live TV foi preservado.
- [x] O build temporário foi removido.
- [x] O relatório foi criado.

## 17. Conclusão executiva

A PR #76 contém melhorias relevantes para Home, D-pad, TMDB e importação IPTV, mas seu escopo real é amplo demais para merge direto. As validações técnicas passaram, mas foram encontrados bloqueadores de configuração e riscos arquiteturais altos. A recomendação é não mergear a PR como está. O próximo passo deve ser uma Fase 1.3 de correções mínimas dos bloqueadores, seguida de nova auditoria e decisão sobre divisão ou continuidade da PR.
