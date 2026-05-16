# Auditoria App Cliente / Live TV / Consumo de Canais — Fase 4.11-A1

## 1. Resumo executivo

O app cliente já possui rotas protegidas por ativação local de licença, tela de Live TV, tela de configurações/ativação, tela de playlist direta e Player Universal. O consumo real de canais, porém, ainda não usa `license_channels_cache` no frontend cliente.

Hoje o fluxo principal de Live TV resolve uma fonte IPTV autorizada via Edge Function `get-authorized-iptv-source`, recebe uma URL de playlist (`source_url`) de `license_iptv_sources` ou do modelo legado `iptv_sources`, baixa essa playlist em tempo de execução e faz o parsing M3U no frontend. Os canais exibidos vêm da playlist remota direta, mantidos em memória pelo `PlaylistRuntimeProvider`.

O cache importado pelo Admin (`license_channels_cache`) existe, é gerenciado em `/admin/license-channels` e é populado pela importação administrativa, mas não é consumido pela tela Live TV nem pelo app cliente. Consequência: canais importados/desativados manualmente no Admin não controlam a grade exibida no app; o app reflete a fonte remota direta, não o cache autorizado por licença.

## 2. Estado do repositório auditado

- Branch base: `main`
- Branch da auditoria: `feat/app-live-tv-consumption-audit`
- Commit base: `ec3ff87 Merge pull request #58 from xandeflix4/feat/admin-iptv-sources-owner-context`
- Data da auditoria: 2026-05-16

## 3. Rotas do app cliente

Arquivo principal de rotas: `src/app/routes.tsx`.

Rotas cliente encontradas:

- `/login`: `LoginPage`, autenticação Supabase tradicional.
- `/preparing-home`: `PreparingHomePage`, pré-carrega playlist autorizada antes da Home.
- `/`: `CatalogPage`, protegida por `LicenseRoute`.
- `/live`: `LiveTvPage`, protegida por `LicenseRoute`.
- `/player`: `UniversalPlayerPage`, protegida por `LicenseRoute`.
- `/settings`: `SettingsPage`, protegida por `LicenseRoute`.
- `/playlists/direct-source`: `DirectSourcePlaylistPage`, protegida por `LicenseRoute`.

Rotas admin encontradas no mesmo arquivo, isoladas por `AdminRoute`:

- `/admin`
- `/admin/clients`
- `/admin/devices`
- `/admin/licenses`
- `/admin/playback-sessions`
- `/admin/license-channels`
- `/admin/iptv-sources`
- `/admin/app-installations`
- `/admin/app-installations/:installationId`
- `/admin/admin-users`
- `/admin/license-imports`
- `/admin/audit-logs`
- `/admin/login`

O usuário final acessa canais principalmente pela rota `/live`, também exposta no menu TV e mobile como “Canais”. Existe uma tela auxiliar em `/playlists/direct-source` para diagnóstico/carga manual/autorizada de playlist. Não há uma rota separada específica para Fire Stick; a diferenciação TV/Fire Stick ocorre por perfil de dispositivo, layout responsivo e player nativo Android quando disponível.

O Admin está separado por `AdminRoute`, que exige autenticação e checagem `isCurrentUserAdmin()`. O app cliente usa `LicenseRoute`, que apenas verifica se há ativação local salva em `localStorage`.

Arquivos relacionados:

- `src/app/App.tsx`
- `src/app/routes.tsx`
- `src/main.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/TvSidebar.tsx`
- `src/components/layout/MobileBottomNav.tsx`

## 4. Tela Live TV

Arquivo: `src/features/live/pages/LiveTvPage.tsx`.

Componentes e dependências principais:

- `AppShell`
- `FocusableButton`
- `usePlaylistRuntime`
- `getOrCreateDeviceIdentifier`
- `getStoredLicenseActivation`
- `getAuthorizedIptvSource`
- `mapAuthorizedIptvSourceToPlaylistSource`

Fluxo da tela:

1. Obtém `deviceIdentifier`.
2. Lê a ativação local com `getStoredLicenseActivation()`.
3. Chama `getAuthorizedIptvSource({ deviceIdentifier, licenseCode })`.
4. Converte a fonte autorizada para `PlaylistSource`.
5. Chama `loadFromSource(...)` no `PlaylistRuntimeProvider`.
6. Filtra os canais carregados para remover grupos aparentes de filmes/séries.
7. Agrupa canais por `groupTitle`.
8. Exibe grupos e canais.
9. Ao selecionar um canal uma vez, marca como selecionado.
10. Ao clicar novamente no mesmo canal, navega para `/player?src=<channel.url>&title=<channel.name>`.

A Live TV usa canais reais quando a playlist remota da fonte autorizada responde corretamente. Ela não usa mock local. Ela não usa `license_channels_cache`. Ela usa fonte direta autorizada por licença ou fonte legada, dependendo da resposta da Edge Function `get-authorized-iptv-source`.

Pontos de UI atuais:

- Há colunas laterais de grupos e canais.
- A prévia inline ainda é placeholder textual: “A prévia inline MPEG-TS será ativada no próximo ciclo...”.
- Há limite visual de `MAX_VISIBLE_CHANNELS_PER_GROUP = 160` por grupo.
- A navegação D-pad existe por `FocusableButton` e `setFocus`, mas ainda é uma experiência funcional, não premium.

## 5. Player e sessões de reprodução

Arquivo do player: `src/features/player/pages/UniversalPlayerPage.tsx`.

Tecnologias usadas:

- `<video>` nativo para MP4 e fallback geral.
- HLS via `createHlsAdapter`.
- MPEG-TS via `createMpegTsAdapter`.
- Player nativo Android via `createNativeAndroidPlayerAdapter` quando `isNativeAndroidPlayerAvailable(stream.kind)` indica suporte.
- Detecção de tipo via `prepareUniversalPlayerSource` em `src/features/player/lib/playerFactory.ts` e `detectStreamKind`.

Origem da URL reproduzida:

- O player lê `src` e `title` da query string em `/player`.
- Live TV monta essa URL a partir de `channel.url`, vindo do parsing da playlist.
- Direct Source também envia `channel.url` ao player.

Sessões de reprodução:

- `startPlaybackSession` é chamado antes de reproduzir no botão `Reproduzir` ou antes de abrir player nativo Android.
- `heartbeatPlaybackSession` roda a cada 60 segundos após iniciar sessão.
- `endPlaybackSession` é chamado no cleanup, ao voltar e no botão back nativo.

Arquivo do service: `src/features/licensing/services/playbackSession.service.ts`.

Edge Functions usadas:

- `start-playback-session`
- `heartbeat-playback-session`
- `end-playback-session`

O controle de reprodução depende de licença ativa no backend: `start-playback-session` valida licença, expiração, dispositivo ativo e `max_concurrent_streams`. Porém, o player não valida se `streamUrl` pertence a um canal ativo em `license_channels_cache`; ele grava `stream_url` recebido e aplica limite de sessões simultâneas. Também não envia `iptvSourceId` a partir da Live TV, então a sessão pode ficar sem vínculo de fonte.

Observação de risco: o player prepara/carrega a fonte no adapter antes do clique de reprodução. A sessão só começa no play. Para produção comercial, o ideal é que qualquer carga real de mídia autorizada também seja amarrada a uma sessão/autorização de canal.

## 6. Hooks/services de playlist e canais

Runtime central:

- `src/features/playlists/providers/PlaylistRuntimeProvider.tsx`

O provider mantém em memória:

- `source`
- `channels`
- `selectedChannel`
- `diagnostics`
- `status`
- `progress`
- `error`

Loader/parsing:

- `src/features/playlists/lib/directSourcePlaylistLoader.ts`
- `src/features/playlists/lib/parseM3uPlaylist.ts`
- `src/features/playlists/lib/analyzeM3uPlaylist.ts`

O loader:

- baixa a playlist por URL HTTP/HTTPS;
- usa `playlist-proxy` no browser quando não está em plataforma nativa;
- usa `CapacitorHttp` como fallback nativo quando necessário;
- faz parsing progressivo de M3U no frontend;
- emite batches de canais para UI;
- respeita limites por env como `VITE_DIRECT_SOURCE_MAX_PLAYLIST_BYTES` e `VITE_DIRECT_SOURCE_MAX_CHANNELS`, se configurados.

Service de fonte autorizada:

- `src/features/playlists/services/authorizedIptvSource.service.ts`

Ele chama:

- `POST` real via `fetch` para `${env.supabaseUrl}/functions/v1/get-authorized-iptv-source`.

Ele não chama:

- `list-license-channels-cache`
- `license_channels_cache`

Telas consumidoras:

- `src/features/live/pages/LiveTvPage.tsx`
- `src/features/catalog/pages/PreparingHomePage.tsx`
- `src/features/catalog/services/prepareHomePlaylist.service.ts`
- `src/features/playlists/pages/DirectSourcePlaylistPage.tsx`

Existe carregamento direto por URL M3U em `/playlists/direct-source`. Existe parsing local no frontend. Existe chamada a Supabase Edge Function para resolver a fonte autorizada. Não existe consulta do app cliente ao cache de canais importados.

## 7. Uso de license_channels_cache

Resultado da busca técnica:

- `license_channels_cache` aparece em Edge Functions administrativas e em tipos/services/página Admin.
- No app cliente, não há consumo de `license_channels_cache`.
- A Live TV não chama `list-license-channels-cache`.
- O frontend cliente não consulta `license_channels_cache` diretamente.

Uso atual encontrado:

- `supabase/functions/import-license-iptv-source-channels/index.ts`: grava/importa canais em `license_channels_cache`.
- `supabase/functions/list-license-channels-cache/index.ts`: lista cache para Admin, owner-aware.
- `supabase/functions/update-license-channel-status/index.ts`: ativa/desativa canal importado no cache.
- `src/features/admin/services/adminLicenseChannelsCache.service.ts`: invoca `list-license-channels-cache` e `update-license-channel-status`.
- `src/features/admin/pages/AdminLicenseChannelsCachePage.tsx`: exibe e gerencia canais importados no Admin.
- `src/features/admin/types/admin.types.ts`: define `LicenseChannelCache`.

Respostas objetivas:

- O frontend app cliente consulta `license_channels_cache` diretamente? Não.
- O frontend app cliente chama `list-license-channels-cache`? Não.
- A tela Admin `/admin/license-channels` usa esse cache? Sim.
- A tela Live TV usa esse cache? Não.
- O app cliente está isolando canais por licença? Parcialmente. Ele isola a fonte por licença via `get-authorized-iptv-source`, mas não isola canais por cache autorizado.
- O app respeita `is_active` do canal? Não. Ele não lê o canal do cache, então não respeita ativação/desativação manual em `license_channels_cache`.
- O app respeita licença expirada/cancelada/bloqueada? Sim para resolver a fonte autorizada e iniciar sessão de playback, porque as Edge Functions validam status/expiração. A rota em si usa apenas ativação local.

## 8. Fluxo real atual

Fluxo principal atual:

1. App abre.
2. `LicenseRoute` verifica se existe `licenseCode` e `deviceIdentifier` salvos em `localStorage`.
3. Home (`/`) mostra `CatalogPage` com seções mockadas em `catalogSections`.
4. `/preparing-home` pode pré-carregar a playlist autorizada usando `prepareHomePlaylist`.
5. `/live` chama `get-authorized-iptv-source`.
6. A Edge Function `get-authorized-iptv-source` valida licença/dispositivo quando há `licenseCode`.
7. A Edge Function retorna a fonte ativa mais recente de `license_iptv_sources` para aquela licença.
8. Se não houver `licenseCode`, há fallback legado baseado em sessão de usuário, `devices`, `clients` e `iptv_sources`.
9. O app baixa a playlist da `source_url` retornada.
10. O frontend faz parsing M3U e mantém canais em memória.
11. Live TV exibe grupos/canais filtrados.
12. Ao abrir canal, navega para `/player` com a URL real do stream.
13. Player carrega a URL e, ao reproduzir, inicia sessão para controle de telas simultâneas.

Fluxos auxiliares:

- `/settings` ativa licença via `activate-license` e salva ativação local.
- `/playlists/direct-source` permite colar URL manual, ativar licença e carregar fonte autorizada para diagnóstico.

O conteúdo importado no Admin só aparece no app cliente se também estiver presente na playlist remota retornada por `source_url`. O cache importado em `license_channels_cache` não alimenta a UI da Live TV.

## 9. Fluxo desejado para produção

Fluxo recomendado para produção:

1. App abre.
2. Identifica aparelho por ID persistente.
3. Valida licença ativa e dispositivo ativo no backend.
4. Carrega canais autorizados a partir de uma Edge Function cliente dedicada, baseada em `license_channels_cache`.
5. A Edge Function retorna somente canais ativos (`is_active = true`) da licença/fonte autorizada.
6. App agrupa por `group_title`, ordena por `sort_order/name` e renderiza grade premium.
7. Ao selecionar canal, player recebe um identificador de canal autorizado ou URL assinada/validada.
8. `start-playback-session` valida licença, dispositivo, limite de telas simultâneas e, idealmente, o canal/fonte autorizada.
9. Heartbeat mantém sessão ativa.
10. `end-playback-session` encerra sessão ao sair.

Esse fluxo permite que importações do Admin, desativações manuais e owner-aware reflitam diretamente no app cliente.

## 10. Lacunas técnicas

### Críticas

- Live TV não consome `license_channels_cache`; logo, o Admin não controla de fato a grade exibida no cliente.
- Desativar canal importado em `/admin/license-channels` não remove o canal da Live TV.
- `start-playback-session` não valida se `streamUrl` pertence a um canal ativo/autorizado no cache.
- A rota cliente depende de ativação local em `localStorage`; a validação forte só acontece ao resolver fonte ou iniciar playback.
- `get-authorized-iptv-source` retorna a URL da fonte inteira, não uma lista sanitizada de canais por licença.

### Altas

- O app baixa/parsa playlists grandes no cliente, o que pode causar demora, memória alta e travamento em TV/Fire Stick.
- A Home usa `catalogSections` mockadas; não reflete canais reais/importados.
- Live TV limita visualmente a 160 canais por grupo, mas não oferece paginação/virtualização real para milhares de canais.
- A sessão de playback começa no botão play, mas o player pode preparar/carregar mídia antes da sessão.
- Live TV não envia `iptvSourceId` nem `channelId` ao player/sessão.

### Médias

- Existe rota `/playlists/direct-source` útil para diagnóstico, mas não deve ser fluxo principal de usuário final.
- O fallback legado de `get-authorized-iptv-source` ainda consulta `devices`, `clients` e `iptv_sources` quando não há `licenseCode`.
- Há divergência de nomenclatura no modo legado: o tipo frontend declara `AuthorizedIptvSourceMode = 'license' | 'legacy'`, enquanto a Edge Function retorna `mode: 'client'` no fluxo legado. Hoje isso não quebra a Live TV porque o campo não é usado para decisão, mas deve ser alinhado antes de usar `mode` como regra de UI.
- Há logs de diagnóstico no frontend (`console.log` em `authorizedIptvSource.service.ts` e Direct Source) que podem ser ruidosos em produção.
- `routes.config.ts` contém rotas conceituais (`/play/:id`, `/movies`, `/series`) que não parecem ser usadas pelo `AppRoutes` atual.

### Baixas

- Alguns textos exibem encoding quebrado em arquivos existentes, por exemplo “NÃ£o” e “LicenÃ§a”.
- O placeholder de preview inline da Live TV comunica uma limitação ainda não resolvida.
- A UI de telemetria do player é útil tecnicamente, mas expõe uma experiência mais diagnóstica do que premium.

## 11. Avaliação UI/UX atual

Tela inicial (`CatalogPage`):

- Estrutura em carrosséis existe e usa foco TV.
- Conteúdo é mockado em `catalogSections`, não vindo da licença/lista real.
- Visual ainda está mais próximo de protótipo funcional do que produto premium.

Live TV:

- Tem navegação por grupos e canais.
- Funciona como grade operacional básica.
- Não há player inline real; há placeholder.
- Não há busca rápida, favoritos, canais recentes, EPG real ou metadados enriquecidos.
- O limite de 160 canais por grupo reduz risco visual, mas não resolve operação com listas grandes.

Player:

- Tecnicamente robusto para diagnóstico: detecta tipo, usa adapters, registra telemetria e controla sessão.
- Visual ainda parece ferramenta técnica, com mensagens de telemetria e estado da preparação em destaque.
- Para experiência premium, o player deve esconder detalhes técnicos do usuário final e destacar reprodução/erro acionável.

D-pad/Fire Stick:

- Há `FocusableButton`, `FocusableSection`, `setFocus`, `TvSidebar` e ajustes CSS para TV.
- A navegação D-pad existe, mas precisa homologação em layout premium, principalmente em listas longas, modais e player.

Conclusão UI/UX:

- A UI atual não está no padrão Netflix/Prime/Disney+/Globoplay.
- As primeiras telas a redesenhar devem ser Live TV e Player, depois Home/Catálogo.
- Antes do redesign premium, a integração com canais autorizados por licença deve ser resolvida para não redesenhar em cima de uma fonte de dados incorreta.

## 12. Recomendações de próximas fases

### Fase 4.11-A2 — Integração app com canais autorizados por licença

Objetivo recomendado:

- Criar uma Edge Function cliente para listar canais autorizados de `license_channels_cache`.
- Validar licença ativa, dispositivo ativo e canal ativo.
- Retornar apenas campos seguros: `channelId`, `name`, `streamUrl`, `logoUrl`, `groupTitle`, `tvgId`, `sortOrder`, `sourceId`.
- Atualizar Live TV para consumir essa lista em vez de baixar/parsar `source_url` no cliente.
- Atualizar player/sessão para enviar `channelId` e/ou `iptvSourceId`.
- Garantir que `is_active = false` no cache remove canal do app.

### Fase 4.11-B — Redesign UI/UX Premium

Objetivo recomendado:

- Redesenhar Home, Live TV e Player com linguagem premium.
- Usar dados reais de canais autorizados.
- Incluir estados premium de loading, vazio e erro.
- Melhorar navegação por categorias, busca, favoritos e recentes.
- Evitar telemetria técnica visível ao usuário final.

### Fase 4.11-C — D-pad/Fire Stick no layout premium

Objetivo recomendado:

- Homologar foco inicial por rota.
- Garantir navegação previsível por controle remoto.
- Testar listas longas, sidebar, modais, teclado virtual, player e estados de erro.
- Ajustar performance para Android TV/Fire Stick.

## 13. Arquivos inspecionados

Rotas e shell:

- `src/app/App.tsx`
- `src/app/routes.tsx`
- `src/main.tsx`
- `src/config/routes.config.ts`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/TvSidebar.tsx`
- `src/components/layout/MobileBottomNav.tsx`

Live TV e catálogo:

- `src/features/live/pages/LiveTvPage.tsx`
- `src/features/catalog/pages/CatalogPage.tsx`
- `src/features/catalog/pages/PreparingHomePage.tsx`
- `src/features/catalog/services/prepareHomePlaylist.service.ts`
- `src/features/catalog/data/catalogSections.ts`

Playlist/canais:

- `src/features/playlists/providers/PlaylistRuntimeProvider.tsx`
- `src/features/playlists/services/authorizedIptvSource.service.ts`
- `src/features/playlists/services/playlistProxy.service.ts`
- `src/features/playlists/lib/directSourcePlaylistLoader.ts`
- `src/features/playlists/lib/parseM3uPlaylist.ts`
- `src/features/playlists/pages/DirectSourcePlaylistPage.tsx`
- `src/features/playlists/types/playlist.ts`

Licença e sessões:

- `src/features/licensing/services/licenseActivation.service.ts`
- `src/features/licensing/lib/licenseActivationStorage.ts`
- `src/features/licensing/services/playbackSession.service.ts`
- `src/features/licensing/types/license.types.ts`

Player:

- `src/features/player/pages/UniversalPlayerPage.tsx`
- `src/features/player/lib/playerFactory.ts`
- `src/features/player/lib/detectStreamKind.ts`
- `src/features/player/lib/hlsAdapter.ts`
- `src/features/player/lib/mpegTsAdapter.ts`
- `src/features/player/lib/nativeAndroidPlayerAdapter.ts`
- `src/features/player/lib/nativeVideoAdapter.ts`

Admin/cache/functions relacionadas:

- `src/features/admin/pages/AdminLicenseChannelsCachePage.tsx`
- `src/features/admin/services/adminLicenseChannelsCache.service.ts`
- `src/features/admin/types/admin.types.ts`
- `supabase/functions/get-authorized-iptv-source/index.ts`
- `supabase/functions/list-license-channels-cache/index.ts`
- `supabase/functions/import-license-iptv-source-channels/index.ts`
- `supabase/functions/update-license-channel-status/index.ts`
- `supabase/functions/activate-license/index.ts`
- `supabase/functions/start-playback-session/index.ts`
- `supabase/functions/heartbeat-playback-session/index.ts`
- `supabase/functions/end-playback-session/index.ts`

## 14. Conclusão

A Fase 4.11-A1 confirma que o app cliente tem base técnica de ativação, Live TV, parsing M3U, player universal e sessões de reprodução. Entretanto, a origem real dos canais exibidos ainda é a playlist direta retornada por `get-authorized-iptv-source`, não o cache importado e gerenciado no Admin.

Portanto, o backoffice IPTV já consegue importar e gerenciar canais em `license_channels_cache`, mas o app cliente ainda não reflete esse estado operacional. A próxima fase técnica deve integrar Live TV ao cache autorizado por licença antes de qualquer redesign premium. Depois dessa integração, o redesign UI/UX terá uma base de dados correta e auditável para Home, Live TV e Player.
