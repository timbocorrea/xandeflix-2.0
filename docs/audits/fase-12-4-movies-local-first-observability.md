# Fase 12.4 — Instrumentação sanitizada do local-first em Filmes

## Estado

FASE=12.4
BRANCH=fix/issue-12-4-movies-local-first-observability
BASE=main
ESCOPO=/category/filmes

## Objetivo

Adicionar observabilidade sanitizada ao fluxo local-first da tela `/category/filmes`, permitindo identificar quando a tela usa catálogo local-first e quando cai para fallback legado.

## Alterações realizadas

Arquivo alterado:

- `src/features/catalog/pages/CatalogCategoryPage.tsx`

Implementação:

- Adicionado helper de medição de tempo de leitura local.
- Adicionado contador sanitizado de quantidade de grupos resolvidos.
- Adicionado log técnico `[XANDEFLIX_MOVIES_LOCAL_FIRST_OBSERVABILITY]`.
- Registrada origem da carga:
  - `source: local-first`
  - `source: fallback`
- Registrados somente contadores e flags:
  - `fallbackUsed`
  - `localCount`
  - `localGroupCount`
  - `configuredGroupCount`
  - `readTimeMs`
  - `fallbackCount`
  - `fallbackGroupCount`

## Sanitização

A instrumentação não registra:

- stream URLs
- playlist URLs
- nomes reais de fonte
- nomes reais de grupos
- identificadores técnicos de origem da playlist
- logos reais
- posters/backdrops
- metadados sensíveis vinculados à fonte

Também foi sanitizado o log de erro por grupo de filmes, removendo exposição direta de `groupTitle`.

## Fora do escopo preservado

Não alterado:

- Supabase
- Edge Functions
- Migrations
- Player
- Android nativo
- Live TV
- Séries
- Home
- Warmup TMDB
- Remoção de legado
- Migração de novas telas

## Validação técnica

Executado com sucesso:

- `npm run governance:check`
- `npm run build --if-present`
- `git diff --check`

Resultado esperado:

- `/category/filmes` continua usando local-first quando há dados locais.
- `/category/filmes` continua usando fallback legado quando não há dados locais.
- logs permitem auditar origem da carga sem expor dados sensíveis.

## Gate Runtime local/navegador — aprovado

O Gate Runtime local/navegador foi executado em `/category/filmes`.

Resultado funcional:

- `/category/filmes` abriu normalmente.
- Hero Filmes apareceu.
- Categorias apareceram.
- Cards apareceram.
- Fallback textual em card sem poster permaneceu.
- App não crashou.
- Home não apresentou regressão evidente.
- Live TV abriu no navegador, com observação de falha de preview web fora do escopo da PR #14.
- Séries permaneceu fora do escopo da alteração.

Resultado da observabilidade:

- O log `[XANDEFLIX_MOVIES_LOCAL_FIRST_OBSERVABILITY]` apareceu no console.
- O log apresentou somente campos sanitizados:
  - `source`
  - `fallbackUsed`
  - `localCount`
  - `localGroupCount`
  - `configuredGroupCount`
  - `readTimeMs`
  - `fallbackCount`
  - `fallbackGroupCount`

Valores observados no runtime:

- `source`: `fallback`
- `fallbackUsed`: `true`
- `localCount`: `0`
- `localGroupCount`: `0`
- `configuredGroupCount`: `27`
- `readTimeMs`: `82`
- `fallbackCount`: `588`
- `fallbackGroupCount`: `20`

Sanitização validada no log de Filmes:

- Não houve exposição de stream URL.
- Não houve exposição de playlist URL.
- Não houve exposição de nome real de grupo.
- Não houve exposição de nome real de fonte.
- Não houve exposição de identificadores técnicos de origem da playlist.
- Não houve exposição de logo/poster/backdrop URL.
- Não houve exposição de erro cru.

Observação de escopo:

- Logs legados de Live TV observados durante navegação em `/live` pertencem a outra área do sistema e não fazem parte da observabilidade adicionada por esta PR.

Classificação:

- `PR14_RUNTIME_GATE`: aprovado.
- `OBSERVABILITY_SANITIZED`: sim.
- `READY_FOR_REVIEW_RECOMMENDED`: sim.
