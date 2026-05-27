# Fase 3.8.6 — Marco estável: Home TMDB + VOD direto + Live TV preservada

## Objetivo deste relatório

Registrar o estado funcional consolidado do projeto Xandeflix 2.0 após a recuperação da Home VOD, player direto e carregamento inicial de imagens TMDB, para evitar regressões nas próximas fases.

Este documento deve ser usado como referência obrigatória antes de novas correções, merges ou refatorações.

---

## Branch e contexto

- Repositório: `xandeflix4/xandeflix-2.0`
- Branch: `fix/vod-episode-native-player-direct`
- Pasta local: `~/Dropbox/xandeflix2.0`
- Licença de teste: `XFLX-TESTE-002`
- Fonte IPTV ativa: `BLACK TV`
- Fonte antiga: `BLACKTV` inativa

---

## Commits consolidados relevantes

### Backend / autorização / fontes

- `d06f3ae` — `fix: send authorization header on license activation`
- `895583c` — `fix: auto bind device during license activation`

### Live TV / player / fluxo nativo

- `bbd32e4` — `fix: enable touch selection for live tv channels`
- `f3c4b65` — `fix: stabilize device licensing and native playback flow`

### Home VOD / filtro / carregamento

- `37832fa` — `fix: prevent live channels from polluting home vod sections`
- `499f9f6` — `fix: unblock initial home catalog loading`
- `191fa0e` — `fix: filter licensed channels by content kind`
- `d157621` — `fix: allow home vod without tmdb poster`
- `021f2ab` — `fix: render home vod items without poster`
- `71d3dea` — `fix: open home vod directly in player`
- `3b212aa` — `fix: refresh home vod cache after tmdb warmup`

---

## Estado validado no tablet

### 1. Home real voltou a carregar

A Home deixou de cair apenas no fallback/mock e passou a renderizar conteúdos reais da lista VOD.

Seções reais observadas:

- `Filmes | Acao`
- `Filmes | Animacao`
- `Filmes | Aventura`
- `Filmes | Cinema`

### 2. HeroSection passou a exibir imagem TMDB

Após warmup TMDB e correção de cache v10/preferFresh, o HeroSection passou a carregar imagem/backdrop real.

Exemplo observado:

- Título: `Carniceiro`
- Hero com backdrop TMDB carregado
- Sinopse TMDB exibida no Hero

### 3. Cards da Home passaram a exibir posters TMDB

A seção `Filmes | Acao` passou a exibir posters reais, incluindo exemplos como:

- `A Última Onça Negra`
- `Alvo Duplo`
- `Ataque Terrorista`
- `Canário Negro`
- `Carniceiro`
- `Cartas de Iwo Jima`

As seções ainda não enriquecidas, como `Filmes | Animacao`, `Filmes | Aventura` e `Filmes | Cinema`, podem continuar exibindo placeholders até o warmup TMDB processar seus grupos.

### 4. VOD abre direto no player

O fluxo anterior era:

1. Card VOD
2. Tela de telemetria
3. Botão **Abrir player**
4. Fullscreen

Fluxo validado após `71d3dea`:

1. Card VOD da Home
2. `/player?...direct=1`
3. Player fullscreen direto

A tela de telemetria não deve voltar a ser obrigatória para o card VOD da Home.

### 5. Live TV preservada

Live TV continuou funcionando após as correções de VOD, cache e TMDB.

Isso confirma que as alterações na Home/Catalog não quebraram o fluxo de canais ao vivo.

---

## Causa raiz das imagens ausentes

O problema das capas não era player, rota, autorização nem renderização final.

A causa foi a soma de dois fatores:

1. A nova fonte `BLACK TV` tinha 97.387 VODs com campos TMDB vazios:
   - `VOD_WITH_TMDB_ID=0`
   - `VOD_MATCHED=0`
   - `VOD_WITH_POSTER=0`
   - `VOD_WITH_BACKDROP=0`

2. Mesmo depois do warmup TMDB gravar posters no banco, a Home podia continuar usando cache local antigo:
   - prefixo anterior: `xandeflix:home-vod-sections:v9:`
   - TTL: 12 horas
   - `loadHomeVodSections` retornava cache antes de buscar backend
   - `CatalogPage` hidratava a Home com cache antigo

Correção consolidada:

- `HOME_VOD_CACHE_STORAGE_PREFIX` subiu para `v10`
- `LoadHomeVodInput` recebeu `preferFresh?: boolean`
- `preferFresh` não entra na chave de cache
- `loadHomeVodSections(..., preferFresh: true)` ignora leitura de cache e busca backend fresco
- `CatalogPage` mantém hidratação inicial rápida, mas força refresh fresco em background

---

## Validação TMDB controlada

Warmup executado de forma controlada em `Filmes | Acao`:

- Grupo: `Filmes | Acao`
- Limit: `40`
- Concurrency: `2`
- Strategy: `priority`
- Resultado:
  - `processed=40`
  - `matched=40`
  - `errors=0`
  - `withPoster: 0 -> 40`
  - `matched: 0 -> 40`

Conclusão: a Edge Function `enrich-license-channels-tmdb` está operacional e a chave TMDB está válida.

---

## APK validado

APK gerado após cache v10/preferFresh:

- Caminho: `android/app/build/outputs/apk/debug/app-debug.apk`
- SHA256: `f464ea17033c92be2ee17d7bb88612633656501c739a32a2d5d4b0322011070c`
- Validações do build:
  - `CAP_SYNC_EXIT_CODE=0`
  - `ANDROID_ASSETS_EXISTS=1`
  - `CORDOVA_VARIABLES_EXISTS=1`
  - `GRADLE_ASSEMBLE_DEBUG_EXIT_CODE=0`

---

## Guardrails para não quebrar o que foi corrigido

### Não fazer

- Não usar `pm clear`.
- Não limpar dados do app no tablet sem necessidade explícita.
- Não recriar deviceIdentifier.
- Não mexer em `NativePlayerActivity.java`.
- Não mexer no player nativo Android enquanto Home/VOD/Live estiverem funcionais.
- Não remover `direct=1` do fluxo do card VOD da Home.
- Não voltar a exigir TMDB/poster para renderizar VOD.
- Não reintroduzir filtro que descarte itens sem poster.
- Não retornar cache stale como resposta final da Home quando houver refresh em background.
- Não matar `node.exe` em terminal integrado do VS Code/Codex/Antigravity.

### Manter

- Home deve abrir rápido, mesmo com placeholders.
- Refresh em background deve buscar dados frescos com `preferFresh: true`.
- Cache persistido deve usar prefixo `v10` ou superior.
- Player direto da Home deve continuar usando `/player?...direct=1`.
- Live TV deve continuar filtrando `contentKind: 'live'`.
- Home VOD deve continuar buscando `contentKinds: ['movie', 'series']`.

---

## Pendências futuras seguras

### 1. Expandir warmup TMDB por lotes

Rodar warmup controlado por grupos visíveis:

- `Filmes | Animacao`
- `Filmes | Aventura`
- `Filmes | Cinema`
- Outros grupos reais da Home

Executar em lotes pequenos, validando cobertura antes de aumentar volume.

### 2. Corrigir categoria Lançamentos

A rota `Lançamentos` continua vazia porque a fonte atual não apresenta grupo real com esse nome.

Opções futuras:

- Mapear `Lançamentos` para filmes recentes por `tmdb_release_year`
- Ocultar rota se não houver grupo correspondente
- Substituir por categorias reais da lista

### 3. Melhorar enriquecimento de séries

A auditoria inicial mostrou poucos itens `series` reais no recorte e alguns grupos classificados como `series` que parecem canais lineares.

Antes de alterar séries, auditar classificação e origem.

---

## Critério de preservação

Antes de qualquer próxima fase, validar:

- Home abre.
- Hero exibe título real.
- Se houver TMDB enriquecido, Hero exibe imagem real.
- Cards enriquecidos exibem posters.
- Cards sem TMDB exibem placeholder sem quebrar layout.
- Card VOD abre direto no player fullscreen.
- Voltar do player retorna ao app.
- Live TV continua reproduzindo.
- Nenhuma tela de ativação por limite de usuário aparece após instalação com `adb install -r`.

---

## Status final da Fase 3.8.6

A Fase 3.8.6 é considerada validada como marco funcional:

- Home VOD real carregando.
- TMDB/posters funcionando para itens enriquecidos.
- Cache stale corrigido com `v10` + `preferFresh`.
- VOD direto no player funcionando.
- Live TV preservada.
- Sem necessidade de limpar dados do app.
