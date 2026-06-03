# Fase 3.9.3 - Smoke test IndexedDB local

Data: 2026-05-28
Branch: `fix/vod-episode-native-player-direct`
Ponto seguro de partida: `d318ada feat: add local catalog indexeddb foundation`

## Objetivo

Validar em runtime que o IndexedDB local `xandeflix-local-catalog` abre, grava, lista, calcula stats e limpa dados fake dentro do WebView/Android/Capacitor, sem tocar em Supabase e sem trocar a leitura principal da Home, Live TV ou VOD.

## Arquivos criados/alterados

- Criado: `src/features/localCatalog/services/localCatalogSmokeTest.service.ts`
- Alterado: `src/features/localCatalog/services/localCatalogDb.service.ts`
- Alterado: `src/config/env.ts`
- Alterado: `src/features/catalog/pages/PreparingHomePage.tsx`
- Criado: `docs/audits/fase-3-9-3-smoke-test-indexeddb-local.md`

## Flag criada

- `VITE_LOCAL_CATALOG_SMOKE_TEST=true|false`

Padrao seguro:

- Quando nao definida, equivale a `false`.

## Comportamento com flag false

- O boot nao importa o smoke service.
- Nenhuma escrita IndexedDB fake e feita.
- Home, Live TV, VOD e leitura legada continuam exatamente no fluxo atual.

## Comportamento com flag true

Depois do bootstrap, em background e sem bloquear navegacao:

1. abre o banco `xandeflix-local-catalog`;
2. insere 3 itens fake com `sourceId = smoke-test-source`;
3. lista 1 item `live`, 1 `movie` e 1 `series` filtrando pelo grupo fake;
4. gera stats com `getLocalCatalogStats`;
5. remove somente os 3 itens fake pelo id;
6. registra o resultado no console com prefixo:
   - `XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT`

## Garantias de isolamento

- O smoke service usa somente `localCatalogDb.service.ts`.
- Nao importa `supabaseClient`.
- Nao chama `get-client-license-channels`.
- Nao referencia `license_channels_cache`.
- Nao baixa playlist real.
- Nao usa URL IPTV real.
- Nao altera rotas principais.

## O que nao foi trocado nesta fase

- `CatalogPage`
- `CatalogCategoryPage`
- `LiveTvPage`
- Home VOD
- Player
- `UniversalPlayerPage`
- player nativo Android
- Edge Functions
- leitura legada Supabase

## Rollback

```sh
git restore \
  src/config/env.ts \
  src/features/catalog/pages/PreparingHomePage.tsx \
  src/features/localCatalog/services/localCatalogDb.service.ts \
  src/features/localCatalog/services/localCatalogSmokeTest.service.ts \
  docs/audits/fase-3-9-3-smoke-test-indexeddb-local.md

git status -sb
```

## Proximos passos

1. Gerar APK com `VITE_LOCAL_CATALOG_SMOKE_TEST=true` apenas quando aprovado.
2. Validar o log no Android/WebView.
3. Desativar a flag no build normal.
4. Na Fase 3.9.4, criar importador local em batches usando parser M3U, ainda sem trocar Home/Live/VOD automaticamente.
