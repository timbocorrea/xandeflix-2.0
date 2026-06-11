# LEGACY IPTV/TMDB INVENTORY — Fase 12.1

## Objetivo

Inventariar o legado não conforme relacionado ao uso do Supabase como catálogo IPTV/VOD/TMDB centralizado.

Esta fase não remove, não limpa, não refatora e não altera comportamento funcional. O objetivo é mapear dependências para orientar uma migração local-first segura.

## Regra desta fase

- Não limpar.
- Não deletar.
- Não refatorar.
- Não alterar fluxo funcional.
- Não criar migration.
- Não executar warmup TMDB.
- Apenas mapear e classificar.

## Decisão arquitetural vigente

O Supabase deve permanecer restrito a licença, autenticação, autorização, aparelhos, perfis, permissões, preferências e dados seguros.

O dispositivo do usuário deve ser responsável por fonte IPTV, catálogo, grupos, stream URLs, cache TMDB, posters, backdrops e imagens do Hero.

## Classificação usada

### PROIBIDO_REMOVER_DEPOIS

Itens que violam a governança local-first e deverão ser removidos, purgados, substituídos ou desativados após existir substituto local.

### TEMPORARIO_ATE_SUBSTITUTO_LOCAL

Itens não conformes, mas necessários para o app continuar funcionando durante a transição.

### PERMITIDO

Itens compatíveis com Supabase como camada de licença, usuário, aparelho, perfil, permissão, preferência segura ou telemetria sanitizada.

---

## 1. Resumo executivo

O inventário confirmou que o legado IPTV/TMDB centralizado existe em quatro áreas principais:

1. Admin/backoffice IPTV.
2. App cliente e serviços de catálogo/playlist.
3. Edge Functions Supabase.
4. Migrations e tabelas de cache central.

O legado não deve ser removido agora, porque ainda sustenta fluxos funcionais existentes. A remoção só deve ocorrer após criação e validação de substituto local-first.

Classificação geral:

- LEGADO_SUPABASE_CATALOG: CONFIRMADO
- RISCO_GOVERNANCA: ALTO
- RISCO_REMOCAO_IMEDIATA: ALTO
- LIMPEZA_CEGA: PROIBIDA
- PROXIMO_PASSO: CRIAR_PLANO_DE_SUBSTITUICAO_LOCAL_FIRST

---

## 2. Bloco A — Admin/backoffice IPTV

### Arquivos identificados

- `src/features/admin/components/AdminLayout.tsx`
- `src/features/admin/pages/AdminAuditLogsPage.tsx`
- `src/features/admin/pages/AdminClientsPage.tsx`
- `src/features/admin/pages/AdminIptvSourcesPage.tsx`
- `src/features/admin/pages/AdminLicenseChannelsCachePage.tsx`
- `src/features/admin/pages/AdminLicenseImportsPage.tsx`
- `src/features/admin/pages/AdminLicensesPage.tsx`
- `src/features/admin/services/adminIptvSources.service.ts`
- `src/features/admin/services/adminLicenses.service.ts`
- `src/features/admin/types/admin.types.ts`

### Evidência técnica

Esses arquivos expõem ou manipulam fontes IPTV, tipos `m3u`/`xtream`, importação de canais, cache de canais, `stream_url`, `group_title`, `tvg_id`, `logo_url` e telas administrativas de cache.

### Classificação

- CLASSIFICACAO: TEMPORARIO_ATE_SUBSTITUTO_LOCAL

### Justificativa

O Admin atual ainda depende desses fluxos para cadastrar/testar/importar fontes e visualizar cache. Apesar de não estar conforme a nova regra local-first, remover agora quebraria o backoffice sem substituto.

### Ação futura

- Reclassificar o Admin IPTV para modo legado/congelado.
- Bloquear novas importações centrais.
- Substituir importação Supabase por configuração segura da fonte para uso local no dispositivo.
- Remover página de cache central apenas após o app local-first estar operacional.

---

## 3. Bloco B — App cliente / consumo de catálogo

### Arquivos identificados

- `src/features/playlists/services/authorizedLicenseChannels.service.ts`
- `src/features/playlists/services/authorizedIptvSource.service.ts`
- `src/features/catalog/services/catalogWarmup.service.ts`
- `src/features/catalog/services/homeVod.service.ts`
- `src/features/catalog/services/prepareHomePlaylist.service.ts`
- `src/features/live/pages/LiveTvPage.tsx`
- `src/features/playlists/pages/DirectSourcePlaylistPage.tsx`
- `src/features/playlists/types/playlist.ts`
- `src/features/playlists/types/tmdbMetadata.ts`

### Evidência técnica

O serviço `authorizedLicenseChannels.service.ts` mapeia campos centrais como:

- `stream_url`
- `logo_url`
- `group_title`
- `tvg_id`
- `tmdb_id`
- `tmdb_title`
- `tmdb_overview`
- `tmdb_poster_path`
- `tmdb_backdrop_path`
- `tmdb_release_year`
- `tmdb_rating`
- `tmdb_genres`

O `catalogWarmup.service.ts` chama `enrich-license-channels-tmdb`.

O `homeVod.service.ts` consome metadados TMDB para poster/backdrop/hero.

### Classificação

- CLASSIFICACAO: TEMPORARIO_ATE_SUBSTITUTO_LOCAL

### Justificativa

Esses serviços são não conformes com a nova governança quando dependem de catálogo central Supabase. Porém ainda sustentam Home, Filmes, VOD, Live TV e fallback visual.

### Ação futura

- Criar `CatalogRepository` neutro.
- Criar `LocalCatalogRepository`.
- Migrar `/category/filmes` primeiro.
- Migrar Home/VOD depois.
- Migrar Live TV após validação local.
- Desativar chamadas a `get-client-license-channels` e `enrich-license-channels-tmdb` apenas quando houver substituto local.

---

## 4. Bloco C — Edge Functions legadas

### Funções identificadas

- `supabase/functions/import-license-iptv-source-channels/index.ts`
- `supabase/functions/get-client-license-channels/index.ts`
- `supabase/functions/enrich-license-channels-tmdb/index.ts`
- `supabase/functions/list-license-channels-cache/index.ts`
- `supabase/functions/update-license-channel-status/index.ts`
- `supabase/functions/get-authorized-iptv-source/index.ts`
- `supabase/functions/create-license-iptv-source/index.ts`
- `supabase/functions/update-license-iptv-source/index.ts`
- `supabase/functions/test-license-iptv-source/index.ts`
- `supabase/functions/start-playback-session/index.ts`

### PROIBIDO_REMOVER_DEPOIS

- `import-license-iptv-source-channels`
- `get-client-license-channels`
- `enrich-license-channels-tmdb`
- `list-license-channels-cache`
- `update-license-channel-status`

Essas funções existem para importar, servir, enriquecer, listar ou alterar catálogo IPTV/TMDB centralizado.

### TEMPORARIO_ATE_SUBSTITUTO_LOCAL

- `get-authorized-iptv-source`
- `create-license-iptv-source`
- `update-license-iptv-source`
- `test-license-iptv-source`

Essas funções precisam ser reavaliadas. Algumas podem permanecer se forem transformadas em configuração segura de fonte autorizada, sem cache central de catálogo.

### PERMITIDO_COM_RESTRICOES

- `start-playback-session`

Pode permanecer se registrar apenas sessão sanitizada, licença, aparelho e limites de reprodução. Não deve persistir `stream_url` real ou vínculo de catálogo central no longo prazo.

---

## 5. Bloco D — Banco e migrations

### Migrations identificadas

- `supabase/migrations/20260506_0001_admin_core.sql`
- `supabase/migrations/20260507_0002_deprecate_channels_cache.sql`
- `supabase/migrations/20260508_0003_license_core.sql`
- `supabase/migrations/20260515_0001_create_license_channels_cache.sql`
- `supabase/migrations/20260517050000_add_tmdb_cache_fields_to_license_channels_cache.sql`
- `supabase/migrations/20260517070000_add_tmdb_vod_guardrails.sql`

### Campos proibidos identificados

- `stream_url`
- `logo_url`
- `group_title`
- `tvg_id`
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

### Classificação

- `license_channels_cache`: PROIBIDO_REMOVER_DEPOIS
- `channels_cache`: LEGADO_DEPRECATED_CONFIRMADO
- `tmdb_fields_on_license_channels_cache`: PROIBIDO_REMOVER_DEPOIS
- `license_iptv_sources`: TEMPORARIO_ATE_REDESENHO_SEGURO
- `iptv_sources`: LEGADO_AUDITAR_E_REMOVER_DEPOIS

### Observação

Já existe uma migration antiga indicando depreciação de `channels_cache` e orientação para parse local no dispositivo. Isso confirma que a direção local-first já havia sido proposta antes, mas foi desviada posteriormente.

---

## 6. Bloco E — Documentação histórica relevante

### Arquivos encontrados

- `docs/architecture/tmdb-cache-foundation.md`
- `docs/audits/app-license-channel-cache-minimal.md`
- `docs/audits/app-live-tv-consumption-audit.md`
- `docs/audits/fase-3-8-loading-inicial-home-vod.md`
- `docs/audits/fase-3-9-0-pivot-local-first-sem-conteudo-no-supabase.md`
- `docs/audits/fase-3-9-1-congelamento-escritas-conteudo-supabase.md`
- `docs/audits/fase-3-9-2-base-indexeddb-local-catalog.md`
- `docs/audits/fase-3-9-3-smoke-test-indexeddb-local.md`
- `docs/audits/fase-3-9-9-validacao-smoke-importador-local-progressivo.md`

### Classificação

- CLASSIFICACAO: PERMITIDO

### Justificativa

São documentos históricos úteis para reconstruir a rota local-first. Não devem ser removidos agora. Devem ser usados como base para a Fase 12.2.

---

## 7. Bloco F — Código local-first já existente

### Arquivos identificados

- `src/features/localCatalog/services/localCatalogSmokeTest.service.ts`
- `src/features/localCatalog/services/localPlaylistImportSmokeTest.service.ts`
- `docs/audits/fase-3-9-2-base-indexeddb-local-catalog.md`
- `docs/audits/fase-3-9-3-smoke-test-indexeddb-local.md`
- `docs/audits/fase-3-9-3-2-rota-debug-smoke-indexeddb.md`
- `docs/audits/fase-3-9-9-validacao-smoke-importador-local-progressivo.md`

### Classificação

- CLASSIFICACAO: PERMITIDO_ESTRATEGICO

### Justificativa

Esses itens aparentam pertencer à rota correta de arquitetura local-first. Devem ser preservados e auditados com prioridade antes da criação da nova fundação local.

---

## 8. Telas dependentes do legado

### Telas do Admin

- `/admin/iptv-sources`
- `/admin/license-channels`
- páginas de licença com fonte M3U/Xtream
- logs/importações IPTV

### Telas do app cliente

- Home/VOD
- `/category/filmes`
- Live TV
- Direct Source Playlist
- Player Universal indiretamente via stream URL

### Classificação

- ADMIN_LEGADO: TEMPORARIO_ATE_SUBSTITUTO_LOCAL
- APP_CLIENTE_LEGADO: TEMPORARIO_ATE_SUBSTITUTO_LOCAL
- PLAYER: PERMITIDO_COM_RESTRICOES

---

## 9. Risco de remoção imediata

### Alto risco

- Remover `license_channels_cache`.
- Remover `get-client-license-channels`.
- Remover `authorizedLicenseChannels.service.ts`.
- Remover campos TMDB sem adaptar Home/VOD/Filmes.
- Remover importador sem criar fluxo local de fonte.
- Remover `stream_url` de sessão sem redesenhar playback session.

### Resultado provável se remover agora

- Home quebra ou perde VOD.
- Filmes perde categorias/capas.
- Live TV pode perder fonte/canais.
- Admin perde importação/listagem.
- Player pode perder stream resolvido.
- D-pad pode continuar funcionando, mas sem dados navegáveis.

---

## 10. Plano de substituição local-first

### Fase 12.2 — Fundação local-first

Criar, sem remover legado:

- `CatalogRepository`
- `LocalCatalogRepository`
- `LocalCatalogStorage`
- `LocalPlaylistParser`
- `LocalXtreamRuntimeSource`
- `LocalTmdbCache`
- `LocalImageCache`

### Fase 12.3 — Primeira tela

Migrar apenas `/category/filmes` para camada neutra com fallback legado.

### Fase 12.4 — Expansão controlada

Migrar, uma superfície por PR:

1. Home.
2. Detalhe de Filme.
3. Séries.
4. Live TV.
5. Player stream resolver.

### Fase 12.5 — Desativação do legado

Somente após validação local-first:

- desativar `get-client-license-channels`;
- desativar `enrich-license-channels-tmdb`;
- desativar `import-license-iptv-source-channels`;
- preparar purge/anonimização de `license_channels_cache`;
- revisar `start-playback-session`;
- preservar apenas licença, usuário, aparelho, perfil e dados seguros.

---

## 11. Decisão final da Fase 12.1

- INVENTARIO_LEGADO_CONCLUSAO: LEGADO_CONFIRMADO
- LIMPEZA_IMEDIATA: PROIBIDA
- REFATORACAO_IMEDIATA_MASSIVA: PROIBIDA
- SUBSTITUTO_LOCAL_FIRST_OBRIGATORIO: SIM
- PRIMEIRA_REFATORACAO_RECOMENDADA: FUNDACAO_LOCAL_FIRST_SEM_REMOVER_LEGADO

## Próximo passo recomendado

Abrir Fase 12.2 para criar a fundação local-first em paralelo ao legado, sem quebrar telas existentes.
