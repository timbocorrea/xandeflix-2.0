# Integração mínima App Cliente / license_channels_cache — Fase 4.11-A2 curta

## 1. Objetivo

Validar uma integração mínima e segura para a Live TV tentar carregar canais autorizados já importados em `license_channels_cache` antes de cair no fluxo legado de playlist direta.

Esta fase não redesenha a UI, não altera player estruturalmente, não cria Edge Function e não altera regras backend de licenciamento.

## 2. Arquivos alterados

- `src/features/live/pages/LiveTvPage.tsx`
- `src/features/playlists/providers/PlaylistRuntimeProvider.tsx`
- `src/features/playlists/services/authorizedLicenseChannels.service.ts`
- `docs/audits/app-license-channel-cache-minimal.md`

## 3. Fluxo anterior

Antes desta fase, a Live TV fazia:

1. Obtinha `deviceIdentifier`.
2. Lia a licença salva localmente.
3. Chamava `getAuthorizedIptvSource`.
4. Recebia uma fonte IPTV autorizada.
5. Chamava `loadFromSource`.
6. Baixava a playlist direta.
7. Parseava M3U no frontend.
8. Renderizava os canais em memória.

Esse fluxo não consumia `license_channels_cache`, então canais importados/desativados no Admin não controlavam a grade da Live TV.

## 4. Fluxo novo

Agora a Live TV faz:

1. Obtém `deviceIdentifier`.
2. Lê a licença salva localmente.
3. Chama `getAuthorizedIptvSource`, preservando o fluxo existente.
4. Se a resposta tiver `authorizedSource.license.id`, tenta carregar canais com `listAuthorizedLicenseChannels`.
5. O service novo invoca a Edge Function existente `list-license-channels-cache`.
6. Se houver canais ativos, chama `loadFromChannels` no runtime e renderiza a grade sem baixar playlist direta.
7. Se o cache falhar ou vier vazio, usa o fallback antigo por `loadFromSource`.

## 5. Fallback preservado

O fallback de playlist direta foi mantido integralmente.

Se `list-license-channels-cache` retornar 401, 403, 404, 500, CORS, resposta vazia ou qualquer erro de contrato, a Live TV registra um diagnóstico leve no console e continua com:

```text
getAuthorizedIptvSource → mapAuthorizedIptvSourceToPlaylistSource → loadFromSource
```

Isso é importante porque a Edge Function `list-license-channels-cache` atualmente tem contrato administrativo e exige bearer/admin profile. Para um app cliente comum, a tentativa pode falhar até que exista uma função cliente específica ou o contrato backend seja ajustado em fase futura.

## 6. Como os canais são mapeados

O service `authorizedLicenseChannels.service.ts` converte cada item ativo de `license_channels_cache` para `IptvChannel`:

- `id` → `id`
- `name` → `name`
- `stream_url` → `url`
- `logo_url` → `logo`
- `group_title` → `groupTitle`
- `tvg_id` → `tvgId`
- `name` → `tvgName`

O frontend filtra novamente `is_active === true` e exige `stream_url` não vazio antes de renderizar.

A ordenação defensiva local segue:

1. `group_title`
2. `sort_order`
3. `name`

O runtime recebeu o método `loadFromChannels`, que apenas injeta canais já resolvidos em memória. Ele não faz fetch, não inicia player e não altera o fluxo de playback.

## 7. Limitações conhecidas

- `list-license-channels-cache` é uma Edge Function administrativa; pode retornar 401/403 para o app cliente comum.
- A integração real de produção ainda precisa de uma função cliente owner/license-aware para listar canais autorizados da licença sem exigir perfil admin.
- A fase curta não altera `start-playback-session` para validar `channelId` ou `license_channels_cache`.
- O player continua recebendo `src` e `title` via query string.
- O app ainda preserva parsing de playlist direta como fallback.
- A UI ainda é a atual; redesign premium fica fora desta fase.

## 8. Próximos passos para UI/UX premium

1. Criar/ajustar uma Edge Function cliente para listar canais ativos por licença/dispositivo.
2. Fazer Live TV depender do cache autorizado como fluxo principal real.
3. Enviar `channelId` e/ou `sourceId` ao player/sessão.
4. Validar canal ativo/autorizado no início da sessão de playback.
5. Depois disso, iniciar Fase 4.11-B para UI/UX premium com dados reais.
