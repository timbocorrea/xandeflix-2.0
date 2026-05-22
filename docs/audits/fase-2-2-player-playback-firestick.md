# RELATÓRIO FINAL — FASE 2.2
## Player playback no Fire Stick

## 1. Contexto

Projeto: Xandeflix 2.0  
Branch: feat/player-playback-firestick  
Base: main pós-merge da PR #77  

A PR #76 consolidou Home/D-pad/layout/loading.  
A PR #77 consolidou o wiring do Player Universal, permitindo que Home, categorias VOD e Live TV encaminhassem `src` e `title` para `/player`.

A Fase 2.2 teve como objetivo diagnosticar e corrigir a falha de reprodução real no Fire Stick sem alterar Home, Live TV real, Supabase, TMDB, IPTV/importação, warmup ou preview inline.

## 2. Diagnóstico

O Player Universal recebia corretamente `src` e `title`, porém a reprodução de MP4 via WebView/HTMLVideoElement falhava no Fire Stick.

Sintomas observados:

- `MEDIA_ELEMENT_ERROR`;
- `errorCode=4`;
- `readyState=0`;
- `networkState=3`;
- falha no caminho web mesmo com URL recebida pelo Player.

A hipótese consolidada foi limitação/falha do WebView/HTMLVideoElement no ambiente Fire Stick para determinados MP4, exigindo fallback Android nativo.

## 3. Solução implementada

- O adapter Android nativo passou a aceitar `mp4`, além de `mpegts`.
- O `nativeVideoAdapter` recebeu telemetria detalhada para diagnóstico do HTMLVideoElement.
- O Player Universal passou a acionar o fallback Android nativo quando adequado.
- O plugin Android passa a receber `url`, `title` e `kind`.
- A `NativePlayerActivity` usa ExoPlayer/Media3 para reprodução nativa.
- A Activity nativa recebeu fundo preto, modo fullscreen/landscape e ajuste visual para remover faixas brancas.
- Foi aplicado `RESIZE_MODE_ZOOM`.
- Foram adicionados controles por D-pad/controle remoto:
  - OK/Enter;
  - avançar;
  - retroceder;
  - menu;
  - voltar.
- Os controles passam a sumir automaticamente.
- Ao voltar da Activity nativa, o foco retorna para o Player web.

## 4. Resultado funcional

- MP4 passou a usar player nativo Android no Fire Stick.
- ExoPlayer/Media3 reproduz MP4 quando a rede/provedor permite.
- Erro HTTP 403 foi classificado como falha externa de rede/provedor, não como bug do Player.
- O usuário validou reprodução e retorno no Fire Stick durante a Fase 2.2.

## 5. Escopo preservado

Não houve alteração intencional em:

- Home;
- Live TV real;
- wiring de Live TV além do já consolidado na PR #77;
- Supabase;
- TMDB;
- IPTV/importação;
- warmup automático;
- preview inline;
- player flutuante.

## 6. Arquivos alterados

- `src/features/player/lib/nativeAndroidPlayerAdapter.ts`
- `src/features/player/lib/nativeVideoAdapter.ts`
- `src/features/player/pages/UniversalPlayerPage.tsx`
- `android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java`
- `android/app/src/main/java/com/xandeflix/app/NativePlayerActivity.java`

## 7. Limitações conhecidas

- Alguns streams podem falhar com HTTP 403 por bloqueio externo de provedor/rede.
- Live TV real ainda não foi validada nesta fase.
- Qualquer ajuste de Live TV deve virar fase própria posterior.
- Eventual problema de Home vazia/loading ao retornar do Player fica fora desta fase.

## 8. Conclusão

A Fase 2.2 corrigiu o bloqueio central de reprodução MP4 no Fire Stick usando fallback nativo Android com ExoPlayer/Media3, mantendo o escopo restrito ao Player/Android nativo.
