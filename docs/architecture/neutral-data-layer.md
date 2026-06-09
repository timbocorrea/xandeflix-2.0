# Camada Neutra de Dados — Xandeflix 2.0

## Objetivo

Separar a interface do Xandeflix da origem real dos dados.

A UI deve consumir contratos padronizados e neutros, sem depender diretamente de:
- Supabase como cache de IPTV;
- tabela `license_channels_cache`;
- `stream_url`;
- `playlist_url`;
- `group_title`;
- `tvg_id`;
- vínculo direto entre TMDB e URL de reprodução.

## Diretriz estratégica

O Xandeflix não deve armazenar dados do sinal IPTV em banco central.

Não devem ser persistidos no Supabase:
- URL de playlist IPTV;
- URL de stream;
- grupos vindos da playlist;
- nomes brutos vindos da playlist;
- lista de canais;
- lista de filmes/séries derivada da playlist;
- cache TMDB associado diretamente ao conteúdo IPTV;
- vínculo direto entre TMDB ID e stream URL.

O Supabase poderá ser usado futuramente apenas para dados seguros:
- licença;
- aparelho autorizado;
- perfis;
- favoritos por TMDB ID;
- curtidas por TMDB ID;
- avaliações por TMDB ID;
- progresso por TMDB ID;
- recomendações por TMDB ID;
- controle parental por perfil.

## Conceito

A camada neutra cria uma identidade de conteúdo independente da origem.

Essa identidade pode ser composta por:
- `tmdbId`;
- `mediaType`;
- `seasonNumber`;
- `episodeNumber`;
- `canonicalTitle`;
- `contentFingerprint` local.

A identidade neutra não deve carregar `streamUrl`, `playlistUrl`, `groupTitle` bruto ou `tvgId`.

## Limite desta Fase 2

Esta fase apenas prepara os contratos.

Não altera:
- layout;
- D-pad;
- player;
- Android nativo;
- Supabase functions;
- migrations;
- licensing;
- fluxo real de dados;
- origem real consumida pela UI.

## Fontes legadas mapeadas no Ciclo 1

Dependências diretas encontradas:
- `src/features/live/pages/LiveTvPage.tsx`;
- `src/features/catalog/services/homeVod.service.ts`;
- `src/features/catalog/pages/CatalogPage.tsx`;
- `src/features/catalog/pages/CatalogCategoryPage.tsx`;
- `src/features/bootstrap/services/appBootstrap.service.ts`;
- `src/features/playlists/services/authorizedLicenseChannels.service.ts`;
- `src/features/localCatalog/services/localCatalogDb.service.ts`;
- telas e serviços administrativos ligados a `license_channels_cache`.

Esses pontos devem ser migrados gradualmente em fases futuras.

## Regra de segurança

A camada neutra pode representar conteúdo e metadados, mas não deve representar segredo operacional de reprodução.

Dados de reprodução devem ser tratados como referência efêmera de runtime, não como identidade persistente.
