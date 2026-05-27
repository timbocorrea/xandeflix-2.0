# Fase 3.8.4 — Validação manual Home/VOD/Live após remoção de bloqueio por poster

## Contexto

Após as correções das fases 3.8.2, 3.8.3 e 3.8.4, foi gerado e instalado um APK validado com assets Android corretos.

Commits relevantes:

- `191fa0e` — `fix: filter licensed channels by content kind`
- `d157621` — `fix: allow home vod without tmdb poster`
- `021f2ab` — `fix: render home vod items without poster`

## Resultado validado no tablet

### Home

A Home deixou de cair apenas no fallback/mock e passou a exibir conteúdos reais da fonte VOD.

Exemplos observados:

- `007 - PERMISSÃO PARA MATAR`
- `+VELOZES +FURIOSOS`
- Seções reais:
  - `Filmes | Acao`
  - `Filmes | Animacao`
  - `Filmes | Aventura`

### VOD

Ao selecionar uma capa/card VOD, o app abriu a página de telemetria do player.

Ao acionar o botão **Abrir player**, o conteúdo do filme abriu em tela cheia.

Conclusão: as URLs VOD da nova fonte estão chegando ao app e o player consegue reproduzir o conteúdo em fullscreen.

### Live TV

Os canais ao vivo continuam reproduzindo normalmente após as alterações.

Conclusão: as correções de Home/VOD não quebraram Live TV.

## Pendências identificadas

### 1. Capas/posters ainda ausentes

Os cards aparecem com placeholder visual.

Causa provável: a nova fonte BLACK TV ainda não possui enriquecimento TMDB/poster no cache.

Classificação:

- Não é bug de player.
- Não é bug de autorização.
- Não é bug de renderização da Home.
- É pendência de enriquecimento/metadata.

### 2. Categoria Lançamentos vazia

A rota/categoria `Lançamentos` continua exibindo "Nenhum conteúdo encontrado".

Causa provável: mismatch entre a categoria fixa `Lançamentos` e os grupos reais da fonte, que aparecem como `Filmes | Acao`, `Filmes | Animacao`, `Filmes | Aventura`, etc.

Classificação:

- Não é falha geral do VOD.
- É pendência de regra de categoria/agrupamento.

### 3. Fluxo VOD ainda passa pela tela de telemetria

Fluxo atual:

1. Card VOD
2. Página de telemetria
3. Botão **Abrir player**
4. Player fullscreen

Como o player abre e reproduz, a etapa seguinte pode ser uma melhoria de UX para abrir o player diretamente a partir do card, se desejado.

## Decisão técnica

A Fase 3.8.4 é considerada validada para:

- Home com VOD real sem poster obrigatório;
- Live TV preservada;
- VOD reproduzindo via player após abertura manual na tela de telemetria.

Próximas fases sugeridas:

1. Fase 3.8.5 — abrir VOD direto no player nativo a partir do card.
2. Fase 3.8.6 — ajustar categorias reais e remover/reestruturar `Lançamentos`.
3. Fase 3.8.7 — rodar ou corrigir warmup TMDB para popular capas/posters.
