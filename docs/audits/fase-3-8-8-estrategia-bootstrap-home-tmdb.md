# Fase 3.8.8 — Estratégia Bootstrap, Warmup TMDB e Home Instantânea

## Objetivo

Alinhar a estratégia correta para carregamento da Home, HeroSection, capas e metadados TMDB no login/boot do sistema, sem quebrar o estado funcional consolidado.

## Estado funcional atual

Commit atual validado:

- `1677198` — `fix: load home movie categories by group`

Ponto estável anterior:

- `02672b5` — `docs: record stable home tmdb direct player milestone`
- Backup local: `backup/fase-3-8-7-before-movie-categories-20260527-150827`

Funcionalidades preservadas:

- Home abre.
- Várias categorias de filmes aparecem.
- Alguns cards já exibem posters TMDB.
- HeroSection exibe imagem quando o item tem backdrop/poster.
- VOD abre direto no player fullscreen com `direct=1`.
- Live TV continua funcionando.
- Cache `v10 + preferFresh` estão ativos.
- Edge Function `get-client-license-channels` aceita `groupTitle/groupTitles`.
- Não limpar dados do app.
- Não usar `pm clear`.

## Fluxo atual real

### Login

`LoginPage.tsx` salva a ativação e redireciona para `/preparing-home`.

### Boot

`/preparing-home` renderiza `PreparingHomePage.tsx`, que chama `runAppBootstrap`.

### Bootstrap

`appBootstrap.service.ts` tenta primeiro `getCachedAppBootstrapResult()`.

O cache usado é:

- `critical-bootstrap:v5`
- TTL: 12 horas

Se o cache for válido, o bootstrap retorna sem buscar Home fresca.

Se não houver cache bootstrap, chama `loadHomeVodSections` sem `preferFresh`; portanto ainda pode usar cache Home VOD `v10` antes de buscar backend.

### Home

`CatalogPage.tsx` hidrata primeiro com cache Home `v10`, depois fallback bootstrap, e em seguida faz refresh background com `preferFresh: true`.

### Player direto

Preservado:

- `params.set('direct', '1')` continua no card VOD.

### Live TV

Preservado:

- bootstrap e Live TV usam `contentKind: 'live'`.

## Warmup TMDB atual

`startCatalogVodWarmup` está órfão/desconectado.

Ele só aparece em:

- `catalogWarmup.service.ts`
- import comentado em `routes.tsx`

Não há chamada ativa.

O warmup atual invoca:

- Edge Function: `enrich-license-channels-tmdb`
- `mode: 'vod-warmup'`
- `limit: 300`
- `concurrency: 4`
- `maxPerGroup: 60`
- `strategy: 'round-robin'`
- throttle: 15 minutos
- até 6 ciclos

Esse warmup apenas grava/enriquece o banco. Ele não atualiza cache Home e não dispara refresh da tela.

## Lacunas identificadas

1. Bootstrap pode retornar cache bootstrap antigo por até 12 horas.
2. Bootstrap chama Home sem `preferFresh`, então pode usar cache Home antigo.
3. Warmup não roda no login/boot.
4. Warmup não invalida nem atualiza cache Home.
5. Home aberta não recebe sinal pós-warmup.
6. Busca por categoria ainda não é poster-first.
7. O frontend ordena posters dentro do payload recebido, mas se os posters estiverem fora dos primeiros 30 da categoria, não entram na Home.
8. Cards podem mostrar placeholder porque `requireTmdbPoster: false` é intencional e `posterUrl` só existe se veio no payload.

## Estratégia oficial recomendada

### Camada 1 — Boot crítico curto

- Validar licença/device.
- Carregar Home por categorias pequenas.
- Pré-carregar Hero/primeiro fold.
- Não esperar enriquecimento TMDB completo.
- Não bloquear mais do que poucos segundos.

### Camada 2 — Home instantânea

- Abrir com cache/bootstrap imediatamente.
- Renderizar poster/backdrop quando houver.
- Renderizar placeholder seguro quando não houver.
- Manter foco e D-pad funcionais.

### Camada 3 — Warmup TMDB background

- Conectar `startCatalogVodWarmup` após login/boot bem-sucedido.
- Rodar sem bloquear navegação, player ou Live TV.
- Usar `round-robin` por categorias prioritárias.
- Manter limites pequenos.
- Evitar varredura massiva.

### Camada 4 — Refresh pós-warmup

- Marcar Home como stale após ciclo útil de warmup.
- Emitir evento ou flag para `CatalogPage` refazer `loadHomeVodSections({ preferFresh: true })`.
- Evitar que cache velho fique válido por 12 horas após enriquecimento novo.

## Patch futuro mínimo recomendado

### Fase A — Documentação

Criar este relatório:

- `docs/audits/fase-3-8-8-estrategia-bootstrap-home-tmdb.md`

### Fase B — Conectar warmup ao login/boot

Chamar `startCatalogVodWarmup` em `PreparingHomePage.tsx` após `runAppBootstrap` resolver com sucesso.

Regras:

- executar em background;
- não bloquear Home;
- não afetar Live TV;
- não afetar player;
- não limpar dados.

### Fase C — Bootstrap cache-first com refresh fresco controlado

Manter abertura instantânea por cache, mas iniciar refresh fresco em background em situações controladas.

Não tornar o bootstrap dependente do warmup.

### Fase D — Refresh de cache após warmup

Em `catalogWarmup.service.ts`, após ciclo útil:

- marcar flag em `localStorage`; ou
- emitir evento customizado; ou
- ambos.

Em `CatalogPage.tsx`:

- escutar o evento/flag;
- chamar `loadHomeVodSections({ preferFresh: true })`;
- aplicar debounce para evitar refresh excessivo.

### Fase E — Poster-first por categoria

Em `homeVod.service.ts`:

1. Buscar primeiro `requireTmdbPoster: true` por `groupTitle`.
2. Completar com fallback `requireTmdbPoster: false`.
3. Mesclar removendo duplicados.
4. Manter `maxPages: 1`.
5. Não buscar 16.633 filmes.
6. Não incluir séries nesta fase.

## Arquivos futuros prováveis

- `src/features/catalog/pages/PreparingHomePage.tsx`
- `src/features/catalog/services/catalogWarmup.service.ts`
- `src/features/catalog/pages/CatalogPage.tsx`
- `src/features/catalog/services/homeVod.service.ts`

Provavelmente não precisa mexer agora em:

- `supabase/functions/get-client-license-channels/index.ts`

A Edge Function já aceita `groupTitle/groupTitles`.

## Riscos

1. Warmup durante navegação pode pressionar rede se não respeitar throttle.
2. Refresh pós-warmup pode causar troca visual de cards; precisa debounce.
3. Poster-first duplica chamadas por categoria, mas segue pequeno se mantiver `maxPages: 1`.
4. Bootstrap não pode depender do warmup, senão a Home deixa de ser instantânea.
5. Se a fonte mudar nomes de grupos, a lista temporária de categorias pode precisar ajuste.

## Rollback

Para desfazer patch futuro no estado atual:

- Restaurar os arquivos alterados com `git restore`.
- Confirmar `git status -sb`.
- Retornar ao commit `1677198` se necessário.
- Retornar ao marco `02672b5` apenas em caso de regressão maior.

## Recomendação final

Prosseguir com patch, mas em fases pequenas:

1. Documentação.
2. Conectar warmup ao boot sem bloquear.
3. Criar refresh pós-warmup.
4. Aplicar poster-first por categoria.

Não há necessidade de mexer no player nativo, licença, dispositivo ou Live TV.
