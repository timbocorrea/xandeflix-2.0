# Fase 12.3 - /category/filmes local-first com fallback legado

## Objetivo

Migrar de forma controlada somente a página `/category/filmes` para tentar ler primeiro o catálogo local-first do dispositivo, preservando o fallback legado atual quando o catálogo local estiver vazio, indisponível ou inválido.

## Decisão arquitetural vigente

- Supabase permanece responsável por autenticação, autorização, licenças, perfis, aparelhos, permissões, preferências e dados seguros.
- O dispositivo passa gradualmente a ser responsável por catalogar, armazenar, enriquecer e cachear dados IPTV/TMDB.
- Esta fase atravessa apenas a primeira ponte funcional: `/category/filmes`.

## Arquivos alterados

- `src/features/catalog/pages/CatalogCategoryPage.tsx`
- `src/features/localCatalog/readModels/localMovieHomeVodAdapter.service.ts`
- `docs/audits/fase-12-3-category-filmes-local-first-fallback.md`

## O que foi implementado

### 1. Adapter LocalCatalogItem -> HomeVodItem

Foi criado o adapter:

`src/features/localCatalog/readModels/localMovieHomeVodAdapter.service.ts`

Responsabilidades:

- Converter `LocalCatalogItem` para `HomeVodItem`.
- Manter `kind: 'movie'`.
- Mapear `id`, `name`, `groupTitle`, `streamUrl` e `tvgLogo`.
- Usar `tvgLogo` como `posterUrl` quando disponível.
- Usar fallback textual quando não houver imagem local.

Mapeamento aplicado:

- `LocalCatalogItem.id` -> `HomeVodItem.id`
- `LocalCatalogItem.name` -> `HomeVodItem.title`
- `LocalCatalogItem.groupTitle` -> `HomeVodItem.groupTitle`
- `LocalCatalogItem.groupTitle` -> `HomeVodItem.subtitle`
- `LocalCatalogItem.streamUrl` -> `HomeVodItem.streamUrl`
- `LocalCatalogItem.tvgLogo` -> `HomeVodItem.posterUrl`
- `LocalCatalogItem.contentKind === 'movie'` -> `HomeVodItem.kind = 'movie'`

### 2. Leitura local-first para filmes

Foi adicionada em `CatalogCategoryPage.tsx` a função:

`loadLocalFirstMovieCategoryItemsByGroup()`

Responsabilidades:

- Receber os `groupTitles` da categoria Filmes.
- Calcular limite por grupo preservando a estratégia existente.
- Consultar `localMovieCatalogReadModel.listMovies()`.
- Mapear os itens locais para `HomeVodItem`.
- Retornar lista local quando houver dados.
- Retornar lista vazia em caso de erro, permitindo fallback legado.

### 3. Integração controlada em /category/filmes

O ponto de decisão em `CatalogCategoryPage.tsx` foi alterado somente para `category.slug === 'filmes'`.

Fluxo novo:

1. Tenta carregar itens locais por grupo.
2. Se houver itens locais, usa o catálogo local-first.
3. Se não houver itens locais, chama o fluxo legado `loadMoviesAggregateCategoryItemsByGroup()`.
4. Para todas as demais categorias, mantém `loadHomeVodCategoryItems()` como antes.

## Fallback preservado

O fallback legado foi mantido integralmente.

A função `loadMoviesAggregateCategoryItemsByGroup()` continua existindo e continua usando `loadHomeVodCategoryItems()` por grupo para Filmes quando o catálogo local não fornece dados.

## O que não foi alterado

- Não remove Edge Functions.
- Não altera migrations.
- Não remove estruturas legadas de cache/licença já existentes.
- Não remove funções legadas de catálogo centralizado já existentes.
- Não remove rotinas legadas de enriquecimento já existentes.
- Não remove rotinas legadas de importação já existentes.
- Não altera Home.
- Não altera Séries.
- Não altera Live TV.
- Não altera Player.
- Não altera Android nativo.
- Não altera D-pad estruturalmente.
- Não executa warmup TMDB.
- Não migra outras telas.
- Não remove o legado.

## Validações executadas

Durante a fase foram executadas validações locais em ciclos:

- Preparação de branch a partir da `main` sincronizada.
- `npm run governance:check`
- `npm run build --if-present`
- `git diff --check`

Resultados observados nos ciclos:

- `GOVERNANCE_CHECK_EXIT_CODE=0`
- `BUILD_EXIT_CODE=0`
- `DIFF_CHECK_EXIT_CODE=0`

## Riscos conhecidos

- O catálogo local pode estar vazio em instalações ainda não importadas; neste caso o fallback legado deve continuar atendendo.
- Nesta fase ainda não há enriquecimento TMDB local completo para `posterUrl`, `backdropUrl`, sinopse, gêneros, rating e ano.
- O adapter usa `tvgLogo` como primeira fonte visual local; quando ausente, a UI deve continuar dependendo do fallback textual já existente.
- A ordenação e a qualidade visual podem variar conforme a qualidade dos dados locais disponíveis.

## Resultado técnico

A Fase 12.3 implementa a primeira migração funcional local-first da aplicação final, limitada a `/category/filmes`, com fallback legado preservado e sem impacto intencional nas demais áreas do sistema.

## Próximos passos recomendados

1. Validar `/category/filmes` com catálogo local vazio para confirmar fallback legado.
2. Validar `/category/filmes` com catálogo local preenchido para confirmar uso local-first.
3. Medir comportamento visual quando não houver poster/backdrop local.
4. Planejar fase futura para TMDB local-first, sem acionar warmup legado.
5. Manter PR como Draft até revisão do Analista Mestre.

## Gate runtime — comparação com main baseline

Status: executado manualmente em navegador com Vite local.

### Resultado na branch da PR

- `/category/filmes` carregou hero, grupos e cards.
- Cards sem imagem mantiveram fallback textual.
- Página interna de filme abriu.
- Home aparentou funcionamento normal.
- Live TV carregou grupos e canais.
- Player no navegador falhou ao reproduzir a fonte selecionada.
- Séries ficou sem conteúdo.

### Resultado na main baseline

- Home carregou.
- `/category/filmes` carregou hero, grupos e cards.
- Página interna de filme abriu.
- Player no navegador falhou também na main baseline.
- Live TV carregou grupos e canais, mas o preview no navegador também falhou.
- Séries também ficou sem conteúdo na main baseline.

### Classificação

- `CATEGORY_FILMES_FALLBACK`: aprovado.
- `MOVIE_DETAIL_NAVIGATION`: aprovado.
- `PLAYER_BROWSER_FAILURE`: preexistente ou externo ao escopo da PR.
- `SERIES_EMPTY_CONTENT`: preexistente na main baseline.
- `LIVE_TV_BROWSER_PREVIEW_FAILURE`: preexistente ou externo ao escopo da PR.
- `PR13_DIRECT_REGRESSION`: não confirmada.

### Decisão do gate

A PR não deve ser bloqueada por Player em navegador, Séries sem conteúdo ou preview Live TV, porque esses comportamentos também foram observados na main baseline.

A PR permanece restrita à ponte controlada de Filmes com fallback. O próximo gate recomendado é validar a mesma branch em dispositivo Android/Fire Stick antes de Ready for Review.

## Patch corretivo — BACK no detalhe do filme

Após o Gate Fire Stick, foi identificado que o BACK na página interna de filme retornava para Home em vez de retornar para `/category/filmes`.

A causa era restrita ao handler de navegação de retorno, que respeitava `returnTo` para páginas de Séries, mas não tratava explicitamente `movie-detail`.

Correção aplicada:

- `movie-detail` passa a respeitar `returnTo` quando presente.
- Se `returnTo` não existir, `movie-detail` usa fallback seguro para `/category/filmes`.
- O patch não altera Player, Live TV, Séries, Home, Android nativo, Supabase, Edge Functions ou D-pad estrutural.

Classificação:

- `BACK_MOVIE_DETAIL_RETURN`: corrigido.
- `PATCH_SCOPE`: mínimo e restrito à navegação do detalhe de filme.

## Patch corretivo — BACK no detalhe do filme

Após o Gate Fire Stick, foi identificado que o BACK na página interna de filme retornava para Home em vez de retornar para `/category/filmes`.

A causa era restrita ao handler de navegação de retorno, que respeitava `returnTo` para páginas de Séries, mas não tratava explicitamente `movie-detail`.

Correção aplicada:

- `movie-detail` passa a respeitar `returnTo` quando presente.
- Se `returnTo` não existir, `movie-detail` usa fallback seguro para `/category/filmes`.
- O patch não altera Player, Live TV, Séries, Home, Android nativo, Supabase, Edge Functions ou D-pad estrutural.

Classificação:

- `BACK_MOVIE_DETAIL_RETURN`: corrigido.
- `PATCH_SCOPE`: mínimo e restrito à navegação do detalhe de filme.

## Patch corretivo efetivado — ciclo 4B

O ciclo 4 inicial registrou a intenção do patch, mas o alvo textual do arquivo não foi encontrado e o código não havia sido alterado.

No ciclo 4B, a correção foi efetivamente aplicada no handler de BACK da página de categoria:

- `movie-detail` agora respeita `returnTo` quando presente.
- Sem `returnTo`, `movie-detail` retorna para `/category/filmes`.
- A alteração segue restrita à navegação de retorno do detalhe de filme.

Classificação atualizada:

- `BACK_MOVIE_DETAIL_RETURN`: corrigido em código.
- `CICLO_4B_PATCH_CODE`: aplicado.
- `PATCH_SCOPE`: mínimo e restrito.
