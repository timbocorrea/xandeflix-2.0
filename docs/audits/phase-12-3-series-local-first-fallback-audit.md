# Fase 12.3 — Séries local-first com fallback legado

## Contexto

Esta auditoria documenta a continuação da Fase 12.3 da refatoração local-first do Xandeflix 2.0.

Diretriz de arquitetura:

> O Supabase autentica, autoriza e gerencia licenças/perfis/aparelhos.
> O dispositivo do usuário cataloga, armazena, enriquece e cacheia dados IPTV/TMDB.

## Estado anterior

A Fase 12.3 estava parcial.

- Filmes já havia sido migrado para local-first com fallback legado.
- Séries ainda usava o carregamento legado de categoria.
- Home, Busca, detalhes auxiliares, Live TV, Player e Android nativo ficaram fora deste escopo.

## Escopo desta alteração

Esta alteração adiciona suporte local-first para a rota de Séries:

- `/category/series`
- `/category/series-group`

A implementação tenta carregar itens locais de Séries primeiro e preserva fallback legado quando não houver dados locais disponíveis.

## Arquivos alterados

- `src/features/catalog/pages/CatalogCategoryPage.tsx`
- `src/features/localCatalog/readModels/localSeriesCatalogReadModel.service.ts`
- `src/features/localCatalog/readModels/localSeriesHomeVodAdapter.service.ts`

## Implementação técnica

Foram adicionados:

- read model local-first de Séries;
- adapter `LocalCatalogItem -> HomeVodItem` para Séries;
- integração em `CatalogCategoryPage.tsx` para carregar Séries via local-first antes do fallback legado;
- contagem sanitizada de grupos para observabilidade;
- fallback legado por `loadHomeVodCategoryItems` preservado.

## Observabilidade sanitizada

A observabilidade reutiliza o padrão já existente da categoria Filmes, sem registrar:

- URL real de stream;
- título real de item;
- nome real de grupo;
- payload cru;
- erro cru;
- headers;
- dados de licença;
- identificador de dispositivo.

Campos seguros mantidos:

- origem da leitura;
- uso ou não de fallback;
- contagem local;
- contagem sanitizada de grupos;
- quantidade de grupos configurados;
- tempo de leitura;
- contagem de fallback;
- contagem sanitizada de grupos no fallback.

## Fora do escopo

Esta alteração não executa a Fase 12.4 real.

Não foram alterados:

- Supabase;
- Edge Functions;
- migrations;
- schema;
- tabelas;
- cache legado centralizado de canais licenciados;
- importação IPTV;
- enriquecimento TMDB remoto;
- Player;
- Android nativo;
- D-pad estrutural;
- navegação por controle remoto;
- limpeza de dados do app;
- biblioteca de reprodução.

## Validações executadas

Validações locais executadas antes do commit:

```text
npm run governance:check
npm run build --if-present
git diff --cached --check

Resultado:

DATA_GOVERNANCE_RESULT=PASS
BUILD_EXIT_CODE=0
CACHED_DIFF_CHECK_EXIT_CODE=0
Commit funcional
65fa57b feat(catalog): load series category from local catalog first
Risco

Risco classificado como médio.

Justificativa:

Séries possui fluxo mais complexo que Filmes, com grupos, coleções, episódios, detalhe, cache e retomada.
A alteração preserva fallback legado.
Não altera player, Android nativo nem D-pad estrutural.
Gate Fire Stick continua obrigatório antes de Ready for Review/merge.
Gate funcional recomendado

Antes de Ready for Review ou merge:

abrir Home;
abrir /category/series;
confirmar hero de Séries;
confirmar grupos de Séries/Novelas;
abrir grupo de Séries;
abrir detalhe de Série;
listar episódios;
abrir episódio;
validar retorno BACK;
validar D-pad em hero, linhas, grupos, detalhe e episódios;
confirmar fallback legado quando catálogo local não tiver dados;
confirmar ausência de URL, título real, grupo real, payload cru e erro cru nos logs.
Parecer

A continuação da Fase 12.3 avançou de Filmes para Séries, mantendo a estratégia:

LOCAL_FIRST=SIM
FALLBACK_LEGADO=PRESERVADO
OBSERVABILIDADE_SANITIZADA=SIM
FASE_12_4_REAL=NAO_INICIADA

A Fase 12.3 ainda não deve ser considerada totalmente concluída, pois Home, Busca/detalhes auxiliares e demais consumidores de catálogo ainda precisam de auditoria ou migração formal.
