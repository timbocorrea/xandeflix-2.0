# Fase 3.9.1 - Congelamento de escritas de conteudo no Supabase

Data: 2026-05-27
Branch: `fix/vod-episode-native-player-direct`
Ponto seguro de partida: `d53e45c docs: define local-first content storage pivot`

## Objetivo

Impedir novas escritas de conteudo/lista no Supabase quando o app estiver em modo local, sem apagar dados existentes, sem remover leitura legada e sem alterar player, Live TV, licenca, dispositivo ou tabelas.

## Flags

- `VITE_DISABLE_SUPABASE_CONTENT_WRITES=true`
- `VITE_CONTENT_STORAGE_MODE=local`

Se qualquer uma das flags acima estiver ativa, o frontend nao chama fluxos que gravam conteudo/lista no Supabase.

Se nenhuma flag estiver definida, o comportamento legado continua disponivel para rollback operacional.

## Pontos de escrita auditados

| Arquivo | Funcao/fluxo | Tipo de escrita | Risco | Bloqueio seguro |
| --- | --- | --- | --- | --- |
| `src/features/catalog/pages/PreparingHomePage.tsx` | boot apos `runAppBootstrap` | Dispara `startCatalogVodWarmup` | Warmup em background chama Edge Function que atualiza metadados TMDB no cache remoto | Guard por flag antes da chamada; registra debug seguro e segue para Home |
| `src/features/catalog/services/catalogWarmup.service.ts` | `startCatalogVodWarmup` | Chama `enrich-license-channels-tmdb` | Atualiza `tmdb_poster_path`, `tmdb_backdrop_path` e metadados derivados da lista em `license_channels_cache` | Guard central por flag; retorna sem erro, sem refresh fake e sem bloquear UI |
| `src/features/admin/services/adminLicenses.service.ts` | `importAdminLicenseIptvSourceChannels` | Chama `import-license-iptv-source-channels` | Importa playlist e faz `upsert/update` em `license_channels_cache` | Guard por flag; retorna resultado controlado `skipped: true` |
| `src/features/admin/pages/AdminIptvSourcesPage.tsx` | botao de importar canais | Dispara importacao da fonte IPTV por licenca | Usuario admin poderia iniciar novo preenchimento de cache remoto | UI aceita resultado `skipped` e mostra mensagem de importacao ignorada |
| `src/features/admin/pages/AdminLicensesPage.tsx` | importacao na tela de licencas | Dispara importacao da fonte IPTV por licenca | Mesmo risco de gravar canais/filmes/series no cache remoto | UI aceita resultado `skipped` e mostra mensagem de importacao ignorada |
| `src/features/admin/services/adminLicenseChannelsCache.service.ts` | `updateAdminLicenseChannelStatus` | Chama `update-license-channel-status` | Atualiza status de item em `license_channels_cache` | Guard por flag; lanca erro controlado antes da Edge Function |
| `src/features/admin/pages/AdminLicenseChannelsCachePage.tsx` | ativar/desativar canal importado | Dispara update de item do cache remoto | Nova escrita administrativa sobre conteudo legado | Mensagem amigavel para erro `supabase-content-writes-disabled` |
| `supabase/functions/import-license-iptv-source-channels/index.ts` | Edge Function legada | `upsert/update` em `license_channels_cache` | Entrada direta ainda existe se chamada fora do frontend | Nao alterada nesta fase; sem deploy. Frontend deixa de chamar em modo local |
| `supabase/functions/enrich-license-channels-tmdb/index.ts` | Edge Function legada | Atualiza TMDB em `license_channels_cache` | Entrada direta ainda existe se chamada fora do frontend | Nao alterada nesta fase; sem deploy. Frontend deixa de chamar em modo local |
| `supabase/functions/update-license-channel-status/index.ts` | Edge Function legada | Atualiza `license_channels_cache.is_active` | Entrada direta ainda existe se chamada fora do frontend | Nao alterada nesta fase; sem deploy. Frontend deixa de chamar em modo local |

## Escritas que continuam fora do congelamento

As escritas abaixo continuam no Supabase porque pertencem ao dominio preservado pela decisao arquitetural ou sao administrativas legadas que nao importam conteudo para `license_channels_cache`:

- licencas, planos e status;
- usuarios/admins;
- devices e ativacao;
- sessoes de playback e heartbeats;
- app installations;
- audit logs;
- CRUD de fonte IPTV administrativa, sem importar a lista para o cache remoto.

## Comportamento em modo local

- Home continua podendo ler dados legados enquanto a migracao local-first nao estiver pronta.
- Warmup TMDB de catalogo nao inicia no boot.
- Chamadas diretas a `startCatalogVodWarmup` retornam sem executar Edge Function.
- Importacao administrativa de canais retorna `skipped: true`.
- Atualizacao de status de item em `license_channels_cache` e bloqueada antes da Edge Function.
- Nenhum dado existente e apagado.

## Comportamento em modo legado

- Se as flags nao forem configuradas, o app mantem o comportamento anterior.
- Este modo existe apenas como rollback operacional enquanto a migracao para armazenamento local ainda nao foi implementada.

## Arquivos alterados

- `src/config/env.ts`
- `src/features/catalog/pages/PreparingHomePage.tsx`
- `src/features/catalog/services/catalogWarmup.service.ts`
- `src/features/admin/services/adminLicenses.service.ts`
- `src/features/admin/services/adminLicenseChannelsCache.service.ts`
- `src/features/admin/pages/AdminIptvSourcesPage.tsx`
- `src/features/admin/pages/AdminLicensesPage.tsx`
- `src/features/admin/pages/AdminLicenseChannelsCachePage.tsx`

## Arquivos nao alterados

- Nenhuma Edge Function foi alterada.
- Nenhuma migration foi criada.
- Nenhum arquivo de player nativo foi alterado.
- Nenhum dado foi apagado.

## Riscos

- As Edge Functions legadas ainda existem e podem ser chamadas por ferramentas externas ou deploys antigos. O congelamento desta fase e no frontend.
- Se as flags nao forem ativadas no ambiente de build, o modo legado continua habilitado.
- CRUD de fontes IPTV ainda fica disponivel como metadata administrativa; a importacao da lista fica bloqueada.
- A leitura legada de `license_channels_cache` permanece ate a migracao para IndexedDB/local-first.

## Rollback

Para reverter este patch local:

```sh
git restore \
  src/config/env.ts \
  src/features/catalog/pages/PreparingHomePage.tsx \
  src/features/catalog/services/catalogWarmup.service.ts \
  src/features/admin/services/adminLicenses.service.ts \
  src/features/admin/services/adminLicenseChannelsCache.service.ts \
  src/features/admin/pages/AdminIptvSourcesPage.tsx \
  src/features/admin/pages/AdminLicensesPage.tsx \
  src/features/admin/pages/AdminLicenseChannelsCachePage.tsx \
  docs/audits/fase-3-9-1-congelamento-escritas-conteudo-supabase.md
```

Se for necessario voltar ao ponto estavel, usar o commit `d53e45c` como referencia e nao apagar dados do Supabase.
