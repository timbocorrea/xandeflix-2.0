# RELATÓRIO FINAL — FASE 2.5
## Prévia inline nativa Android na Live TV — Xandeflix 2.0

## 1. Contexto

Projeto: Xandeflix 2.0
Branch de trabalho: `feat/live-tv-inline-preview`
PR relacionada: #79 — `feat: control live tv preview and native fullscreen`

A Fase 2.4 havia consolidado o fluxo controlado da Live TV:

- Primeiro OK em canal não abria mais a telemetria automaticamente.
- Segundo OK abria o player nativo em fullscreen.
- Voltar retornava direto para Live TV.
- D-pad/foco permaneciam funcionais.

Limitação restante após a Fase 2.4:

- A prévia inline real para canais MPEG-TS/MP4 ainda não funcionava no Fire Stick via WebView/mpegts.js.
- O WebView falhava com erro de fetch em streams MPEG-TS.
- O player nativo Android com ExoPlayer/Media3 reproduzia os mesmos canais corretamente.

Objetivo da Fase 2.5:

Implementar prévia inline real na Live TV usando player nativo Android com ExoPlayer/Media3, mantendo fullscreen nativo no segundo OK e preservando o fluxo de foco/D-pad.

## 2. Diagnóstico inicial

O diagnóstico técnico confirmou que:

- O projeto já possuía `NativeAndroidPlayerPlugin.java`.
- O projeto já possuía `NativePlayerActivity.java`.
- O app Android já usava Media3/ExoPlayer.
- O `MainActivity.java` já registrava o plugin nativo.
- O fullscreen nativo já estava funcional.
- A lacuna era criar um `PlayerView` inline sobre a WebView, posicionado na área de preview da `LiveTvPage`.

Conclusão do diagnóstico:

A solução correta para Fire Stick/Android TV era nativa, não WebView/mpegts.js.

## 3. Arquivos alterados

Arquivos funcionais alterados nesta fase:

- `android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java`
- `src/features/player/lib/nativeAndroidPlayerBridge.ts`
- `src/features/live/pages/LiveTvPage.tsx`

Relatório criado:

- `docs/audits/fase-2-5-live-tv-native-inline-preview.md`

## 4. Alterações implementadas

### 4.1 Plugin nativo Android

Arquivo:

- `android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java`

Alterações:

- Adicionado suporte a preview inline nativo.
- Criado método `startPreview`.
- Criado método `stopPreview`.
- Criado controle interno de:
  - `inlinePreviewView`
  - `inlinePreviewPlayer`
  - `inlinePreviewMaskedUrl`
- O plugin cria um `PlayerView` Android sobre o root view da Activity.
- O `PlayerView` é posicionado com base em coordenadas recebidas do frontend:
  - `x`
  - `y`
  - `width`
  - `height`
- O preview usa ExoPlayer/Media3.
- O preview é iniciado sem controles nativos.
- O preview usa `AspectRatioFrameLayout.RESIZE_MODE_FIT`.
- O plugin remove e libera o player anterior ao trocar de canal.
- O plugin mascara URL nos logs.
- Adicionado evento nativo de resume via `handleOnResume`.
- O evento dispara `notifyListeners("resume", event, true)` para o frontend.

### 4.2 Bridge TypeScript do player nativo

Arquivo:

- `src/features/player/lib/nativeAndroidPlayerBridge.ts`

Alterações:

- Adicionado tipo `NativeAndroidInlinePreviewOptions`.
- Adicionado método `startNativeAndroidInlinePreview`.
- Adicionado método `stopNativeAndroidInlinePreview`.
- Adicionado tipo de evento `NativeAndroidPlayerResumeEvent`.
- Adicionado método `addNativeAndroidPlayerResumeListener`.
- Mantido método de fullscreen nativo existente.

### 4.3 LiveTvPage

Arquivo:

- `src/features/live/pages/LiveTvPage.tsx`

Alterações:

- Adicionado `previewContainerRef`.
- A área visual de preview passou a informar sua posição real via `getBoundingClientRect`.
- O layout é convertido considerando `window.devicePixelRatio`.
- O primeiro OK em canal compatível chama `startNativeAndroidInlinePreview`.
- O segundo OK no mesmo canal chama fullscreen nativo direto.
- Antes de abrir fullscreen, o preview inline é parado.
- Ao trocar de canal, o preview anterior é destruído e o novo preview é iniciado.
- Ao desmontar a página, o preview inline é encerrado.
- Adicionada tentativa inicial de restauração via:
  - `App.resume`
  - `visibilitychange`
  - `window.focus`
- Após teste manual mostrar que não bastava, foi adicionado listener explícito do evento nativo `resume` do `NativeAndroidPlayerPlugin`.
- A restauração pós-fullscreen passou a reiniciar a prévia do último canal ativo.
- D-pad/foco foram preservados.

## 5. Fluxo final validado

### Primeiro OK/Enter no canal

Resultado final:

- Seleciona canal.
- Mantém usuário na Live TV.
- Inicia preview inline nativo com vídeo real.
- Preview aparece alinhado dentro do quadro de preview.
- Preview tem áudio.

### OK/Enter em outro canal

Resultado final:

- Troca o canal ativo.
- Encerra preview anterior.
- Inicia preview inline nativo do novo canal.
- D-pad/foco continuam funcionais.

### Segundo OK/Enter no mesmo canal

Resultado final:

- Encerra preview inline.
- Abre fullscreen nativo direto.
- Canal reproduz em tela cheia.
- Não passa pela telemetria do Player Universal.

### Voltar do fullscreen

Resultado final:

- Retorna direto para Live TV.
- Preview inline do canal volta sozinho.
- Preview retorna alinhado no quadro.
- Grade de canais permanece carregada.
- D-pad/foco continuam funcionais.

## 6. Validações técnicas executadas

### 6.1 Validação do patch inicial da prévia nativa

Executado:

- `git diff --check`
- `npx.cmd tsc -b`
- `VITE_PLAYER_DEBUG=true npx.cmd vite build --emptyOutDir false`
- `./gradlew.bat :app:assembleDebug`

Resultado:

- `git diff --check`: aprovado.
- TypeScript: aprovado.
- Vite build: aprovado.
- Gradle assembleDebug: aprovado.

### 6.2 Teste Fire Stick da prévia inline nativa

Resultado manual:

- Primeiro OK abriu preview inline nativo: sim.
- Vídeo ficou alinhado no quadro: sim.
- Preview teve áudio: sim, com volume baixo por limitação do dispositivo/controlador de áudio usado no teste.
- OK em outro canal trocou o preview: sim.
- Segundo OK no mesmo canal abriu fullscreen nativo: sim.
- Ao voltar da tela cheia, retornou para Live TV: sim.
- D-pad/foco continuou funcionando: sim.
- App fechou sozinho: não.

Problema encontrado:

- Ao voltar do fullscreen, a prévia inline não voltava automaticamente.

### 6.3 Correção de restauração pós-fullscreen

Primeira tentativa:

- Listener via `App.resume`.
- Listener via `visibilitychange`.
- Listener via `window.focus`.

Resultado:

- Build técnico passou.
- Teste manual confirmou que a prévia ainda não voltava sozinha.

Segunda tentativa consolidada:

- Adicionado evento nativo explícito no `NativeAndroidPlayerPlugin.java` com `handleOnResume`.
- Adicionado listener TypeScript `addNativeAndroidPlayerResumeListener`.
- Live TV passou a ouvir o evento `XANDEFLIX_LIVE_NATIVE_RESUME_EVENT`.
- Ao receber o evento, reinicia o preview do canal ativo.

Resultado final manual:

- Ao voltar do fullscreen, a prévia inline voltou sozinha: sim.
- A prévia voltou alinhada no quadro: sim.

### 6.4 Recompilação Android/Capacitor

Problema encontrado:

- Gradle falhou temporariamente por ausência de:
  - `android/capacitor-cordova-android-plugins/cordova.variables.gradle`

Correção:

- Executado `npx.cmd cap update android`.
- Arquivo `cordova.variables.gradle` foi regenerado.
- Gradle voltou a compilar.

Problema adicional:

- `npx.cmd cap copy android` falhou temporariamente por `EBUSY` no diretório:
  - `android/app/src/main/assets/public`

Correção:

- App foi parado no Fire Stick.
- Gradle daemon foi parado.
- Diretório `android/app/src/main/assets/public` foi removido.
- Vite build foi recriado.
- `npx.cmd cap copy android` passou.
- Assets novos foram copiados para Android.
- Gradle `:app:assembleDebug` passou.

## 7. Teste final Fire Stick

Checklist final informado:

- [x] Primeiro OK abriu preview inline nativo.
- [x] Segundo OK abriu fullscreen nativo.
- [x] Ao voltar do fullscreen, a prévia inline voltou sozinha.
- [x] A prévia voltou alinhada no quadro.
- [x] Trocar para outro canal ainda troca a prévia.
- [x] D-pad/foco continuou funcionando.
- [x] App não fechou sozinho.

## 8. Checklist consolidado da Fase 2.5

### Implementação nativa

- [x] Criado preview inline nativo em Android.
- [x] Usado ExoPlayer/Media3.
- [x] Usado `PlayerView` sobre a WebView.
- [x] Implementado `startPreview`.
- [x] Implementado `stopPreview`.
- [x] Implementado encerramento seguro do preview anterior.
- [x] Implementado mascaramento de URL em logs.
- [x] Implementado evento nativo de resume.
- [x] Implementado listener TypeScript para resume nativo.

### Integração frontend

- [x] Criado bridge TypeScript do preview inline.
- [x] Live TV calcula posição real do quadro de preview.
- [x] Live TV envia coordenadas para o Android.
- [x] Primeiro OK inicia preview inline.
- [x] Segundo OK abre fullscreen nativo.
- [x] Troca de canal troca preview.
- [x] Voltar do fullscreen restaura preview.
- [x] Preview é destruído ao desmontar a página.
- [x] Foco/D-pad preservado.

### Validações

- [x] `git diff --check` aprovado.
- [x] TypeScript aprovado.
- [x] Vite build aprovado.
- [x] Capacitor update/copy executado.
- [x] Gradle assembleDebug aprovado.
- [x] APK instalado e testado no Fire Stick.
- [x] Teste manual final aprovado.

### Escopo preservado

- [x] Home/cache não alterados.
- [x] Supabase não alterado.
- [x] TMDB não alterado.
- [x] IPTV/importação não alterados.
- [x] Warmup não foi ligado.
- [x] Player Universal não foi refatorado.
- [x] NativePlayerActivity não precisou ser alterada.
- [x] Alterações concentradas em Live TV + bridge nativo + plugin Android.

## 9. Problemas encontrados e decisões

### 9.1 WebView/mpegts.js inadequado para MPEG-TS no Fire Stick

Decisão:

- Abandonar preview MPEG-TS via WebView.
- Usar preview nativo Android.

Resultado:

- Preview inline real passou a funcionar.

### 9.2 Restauração após fullscreen não disparava apenas com eventos web

Decisão:

- Adicionar evento nativo explícito de resume no plugin Android.

Resultado:

- Preview voltou sozinho ao retornar da tela cheia.

### 9.3 EBUSY no cap copy

Decisão:

- Parar app.
- Parar Gradle daemon.
- Remover assets gerados.
- Reexecutar Vite build e `cap copy android`.

Resultado:

- Assets novos foram copiados corretamente.

## 10. Riscos restantes

- O preview inline nativo é um overlay Android sobre a WebView; futuras mudanças fortes de layout na Live TV podem exigir recalcular ou atualizar o posicionamento.
- A próxima fase de refinamento visual deve preservar o `previewContainerRef` e a área usada para cálculo do overlay.
- Se o layout da página mudar após scroll, resize ou animações, pode ser necessário criar método futuro de `refreshPreviewLayout`.
- O volume do preview foi percebido baixo no dispositivo testado, mas o teste foi feito em Fire Stick sem controlador de áudio adequado; não foi classificado como bug funcional nesta fase.
- Logs do Amazon WebView continuam ruidosos, mas não houve crash funcional observado.
- Há avisos conhecidos de chunks grandes no Vite, não bloqueadores nesta fase.

## 11. Decisão recomendada

Marcação:

- [x] Commitar e enviar a Fase 2.5 como incremento da PR #79.
- [ ] Corrigir bug funcional antes do commit.
- [ ] Reverter preview inline nativo.
- [ ] Separar Android nativo e Live TV em PR diferente.
- [ ] Outra decisão.

Justificativa:

A Fase 2.5 atingiu o objetivo principal:

- Preview inline real funcionando no Fire Stick.
- Preview alinhado.
- Troca de canal funcionando.
- Fullscreen nativo funcionando.
- Retorno do fullscreen restaurando preview.
- D-pad/foco funcionais.
- Sem crash.

## 12. Recomendações para próxima fase

Próxima fase recomendada:

## Fase 2.6 — Refinamento de UI/UX da página Canais ao Vivo

Objetivo sugerido:

Aprimorar visualmente e operacionalmente a página Live TV agora que a reprodução inline e fullscreen estão funcionais.

Escopo recomendado:

- Refinar layout da área de preview.
- Melhorar hierarquia visual entre grupos, lista de canais e preview.
- Melhorar destaque do canal ativo.
- Adicionar metadados úteis no painel do preview:
  - nome do canal;
  - grupo/categoria;
  - estado de reprodução;
  - instrução curta de controle.
- Avaliar botão/label visual para fullscreen.
- Ajustar espaçamento, proporção e responsividade para TV.
- Preservar `previewContainerRef`.
- Preservar cálculo de posição do overlay nativo.
- Preservar foco/D-pad.
- Não mexer em Supabase, TMDB, importação ou warmup.
- Não refatorar Player Universal.
- Não mexer em NativePlayerActivity salvo bug objetivo.

Critério de aceite sugerido:

- Live TV abre normalmente.
- Primeiro OK inicia preview inline.
- Preview fica alinhado após refinamento visual.
- Troca de canal continua funcionando.
- Segundo OK abre fullscreen.
- Voltar restaura preview.
- D-pad/foco continuam funcionais.
- Sem crash no Fire Stick.

## 13. Conclusão executiva

A Fase 2.5 consolidou a principal lacuna funcional da Live TV: a prévia inline real.

O fluxo final validado no Fire Stick é:

1. Primeiro OK em canal abre preview inline nativo.
2. Preview fica alinhado dentro do quadro visual.
3. OK em outro canal troca o preview.
4. Segundo OK no mesmo canal abre fullscreen nativo.
5. Voltar retorna para Live TV.
6. A prévia inline volta automaticamente.
7. D-pad/foco continuam funcionais.
8. O app não fecha sozinho.

A fase está recomendada para commit, push e atualização da PR #79.
