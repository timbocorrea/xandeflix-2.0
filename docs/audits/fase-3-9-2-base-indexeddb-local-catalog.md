# Fase 3.9.2 - Base IndexedDB local catalog

Data: 2026-05-28
Branch: `fix/vod-episode-native-player-direct`
Ponto seguro de partida: `e2d0cae docs: validate local-first apk without supabase content writes`

## Objetivo

Criar a fundacao local em IndexedDB para armazenar playlist/catalogo no dispositivo, sem trocar ainda a leitura da Home, Live TV, VOD, Player ou rotas principais.

## Auditoria curta

Arquivos existentes relevantes:

- `src/features/playlists/lib/parseM3uPlaylist.ts`
  - Expoe `parseM3uPlaylist`, `parseM3uPlaylistProgressive` e `parseM3uPlaylistProgressiveFromStream`.
  - Sera o parser preferencial para a futura importacao local.
- `src/features/playlists/lib/directSourcePlaylistLoader.ts`
  - Ja faz download, fallback nativo/proxy e parse progressivo da lista.
  - Pode alimentar futuramente o repositorio local em batches, mas nao foi integrado nesta fase.
- `src/features/playlists/types/playlist.ts`
  - Tipo `IptvChannel` ja possui `id`, `name`, `url`, `logo`, `groupTitle`, `tvgId`, `tvgName`, `contentKind` e campos TMDB legados.
- `src/features/playlists/types/tmdbMetadata.ts`
  - Tipos de status TMDB e shape legado de metadados.
- `src/features/catalog/services/homeVod.service.ts`
  - Ainda le VOD pelo fluxo legado e cache v10.
- `src/features/live/pages/LiveTvPage.tsx`
  - Ainda usa fluxo legado/runtime atual para Live TV.
- `src/features/bootstrap/services/appBootstrap.service.ts`
  - Usa `localStorage` apenas para bootstrap/cache leve, nao IndexedDB.
- `src/features/live/services/liveTvCriticalCache.service.ts`
  - Usa `localStorage` para cache critico de Live TV.
- `src/features/catalog/services/seriesEpisodesCache.service.ts`
  - Usa `localStorage` para episodios.

Tipos reutilizaveis futuramente:

- `IptvChannel`
- `PlaylistLoadProgress`
- `LoadedPlaylist`
- status TMDB em `tmdbMetadata.ts`

Parser futuro recomendado:

- `parseM3uPlaylistProgressiveFromStream`, quando a origem permitir stream.
- `parseM3uPlaylistProgressive`, como fallback para texto ja carregado.

Riscos de duplicacao:

- `IptvChannel.url` e `LocalCatalogItem.streamUrl` representam o mesmo dado com nomes diferentes.
- Campos TMDB existem no tipo legado de playlist e agora em `LocalTmdbMetadata`.
- `contentKind` ja existe em fluxo legado e precisa continuar com os mesmos valores (`live`, `movie`, `series`, `unknown`).

## Arquivos criados

- `src/features/localCatalog/types/localCatalog.types.ts`
- `src/features/localCatalog/services/localCatalogDb.service.ts`

## Stores IndexedDB

Banco:

- Nome: `xandeflix-local-catalog`
- Versao: `1`

Stores:

1. `playlistItems`
   - `keyPath`: `id`
   - Campos minimos: `id`, `sourceId`, `name`, `normalizedName`, `groupTitle`, `contentKind`, `streamUrl`, `tvgId`, `tvgName`, `tvgLogo`, `seriesName`, `seasonNumber`, `episodeNumber`, `createdAt`, `updatedAt`
   - Indices: `sourceId`, `contentKind`, `groupTitle`, `contentKindGroupTitle`, `streamUrl`, `normalizedName`

2. `catalogMetadata`
   - `keyPath`: `key`
   - Campos: `key`, `value`, `updatedAt`

3. `tmdbMetadata`
   - `keyPath`: `id`
   - Campos: `id`, `sourceItemId`, `tmdbId`, `title`, `posterPath`, `backdropPath`, `overview`, `matchStatus`, `updatedAt`
   - Indice adicional: `sourceItemId`

## Funcoes disponiveis

- `openLocalCatalogDb()`
- `getLocalCatalogStats()`
- `clearLocalCatalogDb()`
- `putLocalCatalogItems(items)`
- `listLocalCatalogItems(input)`

`listLocalCatalogItems` aceita:

- `contentKind`
- `groupTitle`
- `limit`
- `offset`

## O que nao foi integrado

- `CatalogPage`
- `CatalogCategoryPage`
- `LiveTvPage`
- `UniversalPlayerPage`
- player nativo Android
- bootstrap principal
- Home VOD
- Edge Functions
- leitura legada via `get-client-license-channels`

## Scripts e testes manuais

Nenhum script npm foi adicionado. Como IndexedDB e uma API de browser, esta fase fica validada por TypeScript/build. A populacao com dados fake em browser pode ser feita em fase posterior, quando houver uma tela ou harness temporario aprovado.

## Riscos

- Esta e apenas a fundacao: ainda nao ha importacao real para IndexedDB.
- Nao existe migracao de schema alem da versao 1; futuras alteracoes devem usar upgrade versionado.
- O store local ainda nao resolve deduplicacao por `streamUrl`; ele permite o indice, mas a politica de conflito fica para a fase de importacao local.
- A leitura legada do Supabase continua ativa por seguranca ate a troca controlada de leitura.

## Rollback

```sh
git restore \
  src/features/localCatalog \
  docs/audits/fase-3-9-2-base-indexeddb-local-catalog.md

git status -sb
```

## Proximos passos sugeridos para a Fase 3.9.3

1. Criar importador local isolado que use `directSourcePlaylistLoader` e grave batches em `playlistItems`.
2. Adicionar normalizacao unica de nome, grupo e `contentKind`.
3. Criar auditoria local de contagens por categoria sem trocar a Home.
4. Depois de validada a base local, planejar troca gradual de Live TV ou Home por flag.

## Confirmação explícita de não integração

Não houve troca de leitura da Home para IndexedDB.
Não houve troca de leitura da Live TV para IndexedDB.
Não houve troca de leitura do VOD para IndexedDB.
Não houve alteração no Player.
Não houve remoção da leitura legada do Supabase.
Não houve alteração em Edge Functions.
Não houve alteração em migrations.
Não houve alteração em tabelas remotas.
