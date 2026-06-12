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
- tvg_id
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
