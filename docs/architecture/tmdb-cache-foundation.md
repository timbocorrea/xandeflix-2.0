# Xandeflix 2.0 — Fase 4.11-C3 — Base de cache TMDB backend

## Objetivo

Preparar o backend/cache para metadados TMDB de conteúdos VOD, sem consultar TMDB no frontend e sem bloquear a renderização da Home no Fire Stick.

## Problema resolvido

A Home premium real não deve buscar TMDB em runtime no dispositivo. O Fire Stick deve receber dados já preparados:

- poster vertical;
- backdrop horizontal;
- sinopse;
- ano;
- nota;
- gêneros;
- tmdb_id;
- status do match.

## Tabela alvo

`license_channels_cache`

## Campos adicionados

- `content_kind`
- `tmdb_id`
- `tmdb_media_type`
- `tmdb_match_status`
- `tmdb_match_score`
- `tmdb_title`
- `tmdb_original_title`
- `tmdb_overview`
- `tmdb_poster_path`
- `tmdb_backdrop_path`
- `tmdb_release_year`
- `tmdb_rating`
- `tmdb_genres`
- `tmdb_last_enriched_at`

## Status de match

- `pending`: aguardando enriquecimento;
- `matched`: TMDB encontrado com confiança suficiente;
- `not_found`: nenhum resultado adequado;
- `ambiguous`: múltiplos resultados possíveis;
- `skipped`: item ignorado por regra de negócio;
- `error`: falha durante enriquecimento.

## Regras da fase

Esta fase não deve:

- redesenhar Home;
- chamar TMDB no frontend;
- alterar Android/Capacitor;
- alterar Player;
- alterar D-pad;
- alterar fluxo de licenciamento.

## Próxima etapa

A próxima fase deve criar uma Edge Function ou rotina backend para enriquecer lotes pequenos de VOD:

1. buscar canais `content_kind in ('movie', 'series')`;
2. selecionar itens sem `tmdb_match_status` ou com `pending`;
3. consultar TMDB com limite/rate control;
4. persistir metadados;
5. retornar resumo da execução.

## Fase 4.11-C3B — Enriquecimento TMDB em batch

A Edge Function `enrich-license-channels-tmdb` deve ser executada por usuário admin autenticado.

Entrada esperada:

```json
{
  "licenseId": "uuid-da-licenca",
  "limit": 10,
  "force": false
}
```

Variável de ambiente necessária no Supabase:

```text
TMDB_API_KEY
```

Regras:

- processar lotes pequenos;
- usar apenas backend;
- nunca expor `TMDB_API_KEY` no frontend;
- enriquecer somente `content_kind in ('movie', 'series')`;
- ignorar canais `live`;
- respeitar owner-aware;
- manter Home/Fire Stick livres de chamadas TMDB em runtime.

