# Mapa de Dependências Legadas — Camada Neutra de Dados

## Objetivo

Registrar os pontos atuais onde a UI e os serviços ainda dependem de dados derivados de IPTV, cache legado ou Supabase.

Este documento é apenas diagnóstico.  
Nenhuma dependência será removida na Fase 2.

## Pontos críticos encontrados

### Live TV

Arquivo principal:

- `src/features/live/pages/LiveTvPage.tsx`

Dependência atual:

- consome `listAuthorizedLicenseChannels`;
- recebe canais com URL real de reprodução;
- usa agrupamento vindo da origem legada;
- filtra VOD para manter apenas canais ao vivo.

Risco:

- a tela ainda sabe demais sobre a origem dos dados;
- a futura migração deve fazer Live TV consumir um adapter neutro.

### Home / Filmes / Séries

Serviço principal:

- `src/features/catalog/services/homeVod.service.ts`

Dependência atual:

- chama `listAuthorizedLicenseChannels`;
- transforma canais licenciados em itens de catálogo;
- mistura metadados visuais, identidade TMDB e referência de reprodução;
- classifica filmes e séries com base em grupo vindo da origem.

Risco:

- `HomeVodItem` ainda carrega informação operacional de reprodução;
- a UI recebe itens que misturam apresentação, identidade e execução.

### Página Home

Arquivo principal:

- `src/features/catalog/pages/CatalogPage.tsx`

Dependência atual:

- consome `HomeVodSection`;
- navega para detalhe de filmes usando dados do item carregado;
- aciona player quando há referência de reprodução disponível.

Risco:

- a Home ainda depende de contrato ligado ao serviço legado de VOD.

### Página de Categoria / Detalhe

Arquivo principal:

- `src/features/catalog/pages/CatalogCategoryPage.tsx`

Dependência atual:

- consome `HomeVodItem`;
- usa identidade por TMDB, título e agrupamento legado;
- abre detalhes de filmes e séries;
- resolve reprodução a partir do item atual.

Risco:

- a página acumula regras de identidade, agrupamento, detalhe e playback.

### Bootstrap

Arquivo principal:

- `src/features/bootstrap/services/appBootstrap.service.ts`

Dependência atual:

- ainda importa `listAuthorizedLicenseChannels`;
- aquece dados da Home, Live TV e imagens;
- contém lógica de filtragem de canais ao vivo e VOD.

Risco:

- o bootstrap ainda depende de fonte legada;
- fases futuras devem reduzir o bootstrap para orquestração neutra.

### Serviço legado de canais autorizados

Arquivo principal:

- `src/features/playlists/services/authorizedLicenseChannels.service.ts`

Dependência atual:

- chama função Supabase de canais autorizados;
- mapeia resposta legada para `IptvChannel`;
- expõe dados brutos usados por Live TV, Home e catálogo.

Risco:

- é o principal ponto de acoplamento entre UI e cache IPTV centralizado.

### Local catalog

Arquivos principais:

- `src/features/localCatalog/services/localCatalogDb.service.ts`;
- `src/features/localCatalog/services/localPlaylistImport.service.ts`;
- `src/features/localCatalog/types/localCatalog.types.ts`.

Dependência atual:

- armazena dados de playlist no IndexedDB local;
- mantém referência de reprodução local;
- usa grupo e identificadores vindos da playlist.

Risco:

- pode ser aceitável como cache local/app-only;
- não deve virar identidade persistente central nem ser enviado ao Supabase.

### Admin

Arquivos principais:

- `src/features/admin/pages/AdminLicenseChannelsCachePage.tsx`;
- `src/features/admin/services/adminLicenseChannelsCache.service.ts`;
- `src/features/admin/services/adminLicenses.service.ts`;
- `src/features/admin/types/admin.types.ts`.

Dependência atual:

- telas administrativas ainda exibem e operam cache legado;
- usam serviços relacionados a importação e listagem de canais.

Risco:

- área administrativa ainda representa o modelo antigo;
- não será alterada na Fase 2 para evitar regressão e mistura de escopo.

## Decisão da Fase 2

A Fase 2 não remove serviços legados.

Ela cria:

- documentação;
- tipos neutros;
- helpers puros de identidade;
- contratos de adapters.

## Direção para fases futuras

### Fase 3

Migrar Live TV para consumir adapter neutro, mantendo layout congelado.

### Fase 4

Migrar Filmes e Séries para contratos neutros, separando identidade, metadados e reprodução.

### Fase 5

Criar dados seguros no Supabase usando apenas identidade neutra.

### Fase 6

Remover dependências legadas não utilizadas e consolidar a arquitetura.
