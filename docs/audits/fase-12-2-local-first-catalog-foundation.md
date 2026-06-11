# Fase 12.2 - Fundação local-first de catálogo

## Objetivo

Criar a fundação técnica local-first em paralelo ao legado atual, sem remover legado, sem migrar telas finais e sem alterar comportamento funcional do app.

## Escopo deste ciclo

- Criado contrato neutro `CatalogRepository`.
- Criado contrato `LocalCatalogStorage`.
- Criado adapter `localIndexedDbCatalogStorage`.
- Criado `localCatalogRepository`.
- Criado read model local de filmes para uso futuro.
- Preservado fallback legado.
- Nenhuma tela principal foi migrada.

## Arquivos criados

- `src/features/localCatalog/repositories/catalogRepository.types.ts`
- `src/features/localCatalog/repositories/localCatalogRepository.service.ts`
- `src/features/localCatalog/storage/localCatalogStorage.types.ts`
- `src/features/localCatalog/storage/localIndexedDbCatalogStorage.ts`
- `src/features/localCatalog/readModels/localMovieCatalogReadModel.service.ts`

## Fora de escopo confirmado

- Não remove Edge Functions.
- Não altera migrations.
- Não remove tabelas legadas.
- Não migra Home.
- Não migra Filmes.
- Não migra Séries.
- Não migra Live TV.
- Não altera Player.
- Não altera Android.
- Não executa warmup.
- Não altera fluxo final do usuário.

## Próxima fase prevista

A Fase 12.3 poderá usar o read model local de filmes como ponto de entrada para uma migração controlada de `/category/filmes`, sempre com fallback legado preservado.
