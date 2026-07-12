# Transição U1 → U2

## 13.1 Identificação

```text
PROJETO=Xandeflix 2.0
REPOSITORIO=timbocorrea/xandeflix-2.0
ISSUE_CONCLUIDA=U1
BRANCH=feat/issue-u1-universal-catalog-contract-metrics
BASE_SHA=731b6ba2ae3c44c32d19e136dfbbaca734510aba
HEAD_SHA=PREENCHER_APOS_COMMIT
PR=AGUARDANDO_CRIACAO
STATUS_PR=AGUARDANDO_DRAFT
DATA_GOVERNANCE=PREENCHER_APOS_VALIDACAO
BUILD=PREENCHER_APOS_VALIDACAO
LINT_DIRECIONADO=PREENCHER_APOS_VALIDACAO
DIFF_CHECK=PREENCHER_APOS_VALIDACAO
```

## 13.2 Entregas da U1

- Contrato canônico versionado e tipos de conteúdo.
- Estados canônicos de enriquecimento e separação entre bruto e metadados.
- Contrato de métricas e dimensões permitidas.
- Matriz de mapeamento legado.
- SQL agregado, parametrizado, somente leitura e sanitizado.
- Decisões arquiteturais, de segurança e de evolução.

## 13.3 Descobertas confirmadas

- M3U é suportado atualmente.
- URLs M3U sem metadados podem ser descartadas no caminho remoto.
- Xtream atual cobre Live e VOD; séries e episódios não estão completos.
- Categorias estáticas limitam descoberta e `unknown` não possui fluxo universal.
- IndexedDB existe, mas não é alimentado automaticamente.
- Cards sem capa já possuem fallback visual e o player usa a URL original.
- TMDB deve ser enriquecimento, nunca requisito de visibilidade.

## 13.4 Decisões para U2

```text
FORMATO_INICIAL=M3U
ARQUITETURA=LOCAL_FIRST_COM_FALLBACK_LEGADO
PERSISTENCIA_LOCAL=INDEXEDDB
CATEGORIAS=DINAMICAS
UNKNOWN=PRESERVADO
TMDB=NAO_BLOQUEANTE
PLAYER=PRESERVADO
HOME=INCLUIDA_DE_FORMA_CONTROLADA
```

## 13.5 Objetivo recomendado da U2

> Implementar a primeira fase funcional do catálogo bruto universal, importando uma fonte M3U autorizada para o IndexedDB em lotes, preservando todos os itens minimamente reproduzíveis, criando categorias dinamicamente e permitindo exibição sem TMDB ou capa, com fallback remoto legado preservado.

## 13.6 Branch recomendada para U2

```text
feat/issue-u2-universal-raw-catalog-local-first
```

## 13.7 Arquivos-alvo recomendados para U2

```text
src/features/playlists/lib/parseM3uPlaylist.ts
src/features/playlists/lib/channelClassification.ts
src/features/localCatalog/types/localCatalog.types.ts
src/features/localCatalog/services/localCatalogDb.service.ts
src/features/localCatalog/services/localCatalogImport.service.ts
src/features/localCatalog/services/localCatalogCategoryIndex.service.ts
src/features/universalCatalog/types/universalCatalog.types.ts
src/features/catalog/services/homeVod.service.ts
src/features/catalog/pages/CatalogCategoryPage.tsx
src/features/live/pages/LiveTvPage.tsx
```

A lista recomenda pontos de integração; não autoriza alteração indiscriminada.

## 13.8 Fora de escopo recomendado para U2

```text
XTREAM_SERIES
XTREAM_EPISODES
TMDB_WARMUP
MIGRATION_REMOTA
REMOCAO_DO_LEGADO
PLAYER_ANDROID
REDESIGN_VISUAL
PR19
MERGE_AUTOMATICO
```

## 13.9 Critérios de aceite da U2

```text
M3U_COM_EXTINF_IMPORTADO=PASS
M3U_SEM_EXTINF_IMPORTADO=PASS
ITEM_SEM_TMDB_VISIVEL=PASS
ITEM_SEM_CAPA_VISIVEL=PASS
ITEM_SEM_GRUPO_EM_NAO_CATEGORIZADOS=PASS
UNKNOWN_PRESERVADO=PASS
GRUPO_NAO_PREDEFINIDO_VISIVEL=PASS
TITULO_ORIGINAL_PRESERVADO=PASS
LOGO_ORIGINAL_USADA_QUANDO_SEGURA=PASS
URL_REPRODUCAO_PRESERVADA=PASS
DETALHE_MINIMO_ABRE=PASS
REPRODUCAO_TENTAVEL=PASS
FALLBACK_LEGADO_PRESERVADO=PASS
HOME_NAO_AGUARDA_TMDB=PASS
FILMES_NAO_AGUARDA_TMDB=PASS
LIVE_TV_PRESERVADA=PASS
D_PAD_PRESERVADO=PASS
LICENCIAMENTO_PRESERVADO=PASS
LOGS_SANITIZADOS=PASS
```

## 13.10 Riscos e bloqueios

- CRITICO — URLs de reprodução e fontes podem conter material de acesso; nunca registrar payloads completos.
- ALTO — importação em massa pode exceder memória/tempo; usar streaming e lotes transacionais.
- ALTO — troca direta do repositório remoto pode causar regressão; manter fallback legado e feature boundary.
- MEDIO — classificadores local/remoto divergem; versionar classificação e preservar bruto/unknown.
- MEDIO — listas fixas ocultam grupos; gerar índices de categoria dinamicamente.
- MEDIO — identidades instáveis podem duplicar itens; definir chave determinística por fonte.
- BAIXO — artwork ausente afeta estética, não elegibilidade.

## 13.11 Próximo comando recomendado

A próxima ação é abrir a Issue U2 na branch própria `feat/issue-u2-universal-raw-catalog-local-first`, somente após revisão da U1 e sem modificar a PR #19.
