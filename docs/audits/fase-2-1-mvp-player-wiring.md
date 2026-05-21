# RELATÓRIO FINAL — FASE 2.1
## MVP Player: conexão Live TV e VOD ao Player Universal — Xandeflix 2.0

## 1. Contexto

Projeto: Xandeflix 2.0
Branch base: main
Branch de trabalho: feat/mvp-player-wiring
Objetivo: conectar telas existentes ao Player Universal para reprodução real, sem criar preview inline e sem refatorar o Player inteiro.

A Fase 2.1 foi iniciada após a consolidação da PR #76 na main, com Home, D-pad, Live TV e loading inicial já validados em fases anteriores.

## 2. Objetivo da fase

Permitir que Live TV, Home e categorias VOD abram o Player Universal com parâmetros reais `src` e `title`.

Escopo permitido:
- Live TV abrir `/player?src=...&title=...` com um OK.
- Home preservar `streamUrl` e abrir `/player`.
- Categorias serem apenas validadas, corrigidas somente se necessário.
- Player receber apenas correções pontuais bloqueadoras.

Escopo proibido respeitado:
- Não foi criado preview inline.
- Não foi criado player flutuante.
- O Player Universal não foi reescrito.
- Supabase, TMDB, Edge Functions e importação IPTV não foram alterados.
- Warmup automático não foi religado.
- Performance/cache/splash Android não foram alterados.

## 3. Diagnóstico inicial

### Rota /player

A rota `/player` já estava registrada em `src/app/routes.tsx`.

### UniversalPlayerPage

O `UniversalPlayerPage.tsx` já lia `src` e `title` via URLSearchParams e já possuía adapters:
- HLS;
- MPEG-TS;
- native video;
- native Android.

### Live TV

A Live TV já possuía navegação para `/player`, mas exigia clicar duas vezes no mesmo canal:
1. primeiro OK selecionava o canal;
2. segundo OK abria o Player.

Essa exigência bloqueava o MVP de reprodução direta.

### Home

A Home já recebia dados VOD, mas:
- o mapeamento da Home não preservava `streamUrl` no tipo/render;
- o `onEnterPress` dos cards apenas registrava debug com `spatialDebug`;
- não havia navegação efetiva para `/player`.

### Categorias

`CatalogCategoryPage.tsx` já possuía lógica para abrir `/player` usando `URLSearchParams` quando `item.streamUrl` existia. Não foi necessário alterar.

### homeVod.service

O `homeVod.service.ts` já expunha `streamUrl` nos itens, então o problema estava no mapeamento/render da Home, não no serviço.

## 4. Alterações realizadas

### Live TV

Arquivo:
- `src/features/live/pages/LiveTvPage.tsx`

Alterações:
- `handleSelectChannel(channel)` passou a chamar `selectChannel(channel)` e abrir diretamente:
  `/player?src=...&title=...`.
- Removida a lógica que exigia clicar novamente no mesmo canal.
- Texto visual alterado de orientação de duplo clique para:
  `Pressione OK para assistir`.
- Texto do painel atualizado para deixar claro que a prévia inline continua fora desta fase.

Resultado:
- Live TV passa a abrir o Player Universal com um único OK.

### Home

Arquivo:
- `src/features/catalog/pages/CatalogPage.tsx`

Alterações:
- Criado tipo local `CatalogPageItem` com `streamUrl?: string`.
- `CatalogPageSection` passou a aceitar `items: CatalogPageItem[]`.
- `mapHomeVodSectionsToCatalogSections` passou a preservar `streamUrl`.
- `onEnterPress` dos cards da Home passou a:
  - registrar debug;
  - verificar `streamUrl`;
  - montar `URLSearchParams`;
  - navegar para `/player?src=...&title=...`.
- Quando `streamUrl` não existe, o card não quebra a navegação.

Resultado:
- Cards reais da Home com `streamUrl` abrem o Player Universal.

### Categorias

Arquivo:
- `src/features/catalog/pages/CatalogCategoryPage.tsx`

Alteração:
- Nenhuma.

Motivo:
- A tela de categoria já estava conectada ao Player Universal usando `streamUrl`.

### Player

Arquivo:
- `src/features/player/pages/UniversalPlayerPage.tsx`

Alterações pontuais:
- Importado `setFocus` de `@noriginmedia/norigin-spatial-navigation`.
- Adicionado foco inicial no botão `player-play-button`.
- Em erro ou unsupported, o foco passa para `player-back-button`.
- `normalizePlaybackError` foi melhorado para extrair `message`, `name`, `code`, `nativeCode` e mensagens nativas quando disponíveis.
- `onError` do elemento de vídeo passou a registrar:
  - `nativeCode`;
  - `nativeMessage`;
  - `readyState`;
  - `networkState`;
  - `currentSrc` mascarado.

Resultado:
- O Player passou a exibir botões com foco visual no Fire Stick.
- O botão Voltar funcionou.
- A reprodução ainda falha para MP4 testado.

## 5. Arquivos alterados

- `src/features/live/pages/LiveTvPage.tsx`
- `src/features/catalog/pages/CatalogPage.tsx`
- `src/features/player/pages/UniversalPlayerPage.tsx`

Nenhum arquivo de Supabase/TMDB/IPTV/importação foi alterado.

## 6. Validações técnicas

### Primeira validação pós-patch

- `git diff --check`: passou.
- `npx.cmd tsc -b`: falhou inicialmente por tipo `streamUrl` em `CatalogPage.tsx`.
- Correção pontual aplicada com type guard e tipo local.
- `npx.cmd tsc -b`: passou.
- `npx.cmd vite build --emptyOutDir false`: passou.

### Validação pós-patch do Player

- `git diff --check`: passou.
- TypeScript: passou.
- Vite build: passou.
- Aviso de chunks grandes: não bloqueante e já esperado.

### Android / Capacitor / Gradle

Houve bloqueios temporários por ambiente local:
- `cap sync android` falhou algumas vezes com `EBUSY`, provavelmente por Dropbox/Windows/Android Studio/arquivos travados.
- `cordova.variables.gradle` ficou ausente após sync parcial.
- Java/JDK não estava disponível no PATH.
- Foi usado o JBR do Android Studio:
  `/c/Program Files/Android/Android Studio/jbr`.

Após recuperação:
- `cap sync android`: passou.
- `cordova.variables.gradle`: recriado.
- `./gradlew.bat :app:assembleDebug`: passou.
- APK gerado corretamente:
  `android/app/build/outputs/apk/debug/app-debug.apk`
- APK final testado:
  `9.1M May 21 10:21`.

## 7. Teste Fire Stick

### Instalação

- APK instalado no Fire Stick com sucesso.
- App abriu.
- Sem evidência de `FATAL EXCEPTION` do app nos logs capturados.

### Home

- Home abriu.
- OK em conteúdo real da Home abriu o Player.
- O Player recebeu tipo detectado `mp4`.
- O Player exibiu URL mascarada.

### Player

- Botões do Player foram exibidos:
  - Voltar;
  - Reproduzir;
  - Retry;
  - Tela cheia.
- O foco visual apareceu nos botões após APK correto.
- Botão Voltar funcionou.
- Botão Reproduzir foi acionável.
- Reprodução MP4 não iniciou.
- Telemetria visual mostrou eventos:
  - `LOAD_START`;
  - erro nativo do HTMLVideoElement;
  - `LOAD_FAILED`;
  - `PLAYBACK_SESSION_STARTED`;
  - `PLAY_REQUEST_FAILED`.

### Live TV

A alteração implementada permite abrir o Player com um OK. A validação visual final relatada concentrou-se em conteúdo da Home MP4. Live TV deve ser revalidada na próxima rodada curta ou no início da Fase 2.2.

### Logcat

O logcat não mostrou erro JavaScript útil do Player. Houve muitos ruídos do Fire OS/Amazon WebView:
- `androidx.window...Consumer`;
- Amazon WebView;
- Alexa/ExternalMediaPlayer;
- lowmemorykiller;
- MediaCodecDenylist;
- processos Amazon externos.

Não foi identificada falha fatal do processo `com.xandeflix.app`.

## 8. Problemas encontrados

### 8.1. Reprodução MP4 falhou no Fire Stick

O Player abre, recebe `src/title`, identifica o conteúdo como `mp4`, mas a reprodução não inicia.

Sintomas:
- Player mostra tela de vídeo;
- ao tentar reproduzir, nada abre;
- telemetria mostra erro no HTMLVideoElement e `PLAY_REQUEST_FAILED`.

Hipóteses para Fase 2.2:
- incompatibilidade do Amazon WebView com o MP4/codec específico;
- CORS/header/range request;
- bloqueio de autoplay ou play promise;
- origem HTTP/HTTPS ou política do WebView;
- necessidade de player nativo Android/intent para MP4;
- URL expirada, bloqueada ou exigindo headers;
- problema de codec/container;
- necessidade de capturar console JS remoto ou instrumentar erro em tela com mais detalhes.

### 8.2. Logcat não mostrou erro JS útil

O logcat ficou dominado por ruído do Fire OS/Amazon WebView. O erro útil apareceu mais claramente na telemetria visual do próprio Player.

### 8.3. Ambiente Android local instável por EBUSY

`cap sync android` falhou algumas vezes por arquivos travados em diretórios gerados:
- `android/app/src/main/assets/public/assets`;
- `android/capacitor-cordova-android-plugins/build`.

Mitigação usada:
- pausar/evitar bloqueios;
- parar Gradle;
- remover diretórios gerados;
- rodar `cap sync android` novamente.

### 8.4. Múltiplos assets antigos no dist/assets

Como alguns builds usaram `--emptyOutDir false`, há múltiplos arquivos antigos `UniversalPlayerPage-*.js` em:
- `dist/assets`;
- `android/app/src/main/assets/public/assets`.

Isso não foi confirmado como causa da falha de reprodução, mas deve ser limpo em fase própria ou antes de fechamento final.

## 9. Riscos restantes

- O Player abre, mas não reproduz MP4 no Fire Stick.
- Live TV precisa de revalidação manual curta após o APK final correto.
- Categorização VOD foi considerada conectada, mas deve ser incluída em checklist manual posterior.
- Pode ser necessário criar uma estratégia de player nativo para MP4 e/ou MPEG-TS.
- Pode ser necessário habilitar instrumentação de erro em tela com `readyState`, `networkState`, `nativeCode` e eventos do video.
- O diretório `dist` deve ser limpo em build futuro para evitar assets antigos.

## 10. Decisão recomendada

Marcar uma opção:

- [ ] Commitar Fase 2.1 como totalmente concluída.
- [x] Corrigir bug pontual antes do commit somente se o Analista Mestre exigir reprodução real nesta mesma fase.
- [x] Commitar Fase 2.1 como wiring parcialmente consolidado, com reprodução real movida para Fase 2.2.
- [ ] Separar Live TV e Home em commits diferentes.
- [x] Abrir fase própria para codec/stream/player adapter.
- [ ] Outra decisão.

Justificativa:

A missão principal de wiring foi cumprida:
- Home abre `/player`;
- Live TV foi alterada para abrir `/player` com um OK;
- categorias já estavam conectadas;
- Player recebe `src/title`;
- Player mostra botões e foco básico;
- Voltar funciona.

Porém, a reprodução real ainda não está consolidada. O bloqueio remanescente pertence mais a Player/adapter/WebView/codec/stream do que ao wiring das telas.

## 11. Confirmações finais

- [x] Não houve preview inline.
- [x] Warmup não foi ligado.
- [x] Supabase/TMDB/IPTV não foram alterados.
- [x] Player não foi reescrito.
- [x] D-pad geral foi preservado.
- [x] Player recebeu foco básico nos controles.
- [x] Relatório foi criado.
- [ ] Reprodução MP4 no Fire Stick foi validada.
- [ ] Live TV final no APK correto foi revalidada manualmente.
- [ ] Categorias final no APK correto foram revalidadas manualmente.

## 12. Conclusão executiva

A Fase 2.1 conectou as telas existentes ao Player Universal de forma mínima e validável.

O wiring está tecnicamente implementado:
- Live TV agora abre o Player com um OK.
- Home preserva `streamUrl` e abre o Player.
- Categorias já estavam conectadas.
- Player recebeu melhoria pontual de foco e diagnóstico.

A validação no Fire Stick confirmou que a Home abre o Player e que o Player recebe os parâmetros corretos. Também confirmou que o botão Voltar funciona e que há foco visual nos controles.

Entretanto, a reprodução MP4 testada não iniciou. Portanto, a Fase 2.1 deve ser considerada **parcialmente consolidada**: wiring aprovado, reprodução real pendente.

Próximo passo recomendado:
**Fase 2.2 — Player playback/adapter no Fire Stick**, com foco em:
1. diagnosticar erro real do HTMLVideoElement em tela;
2. testar URL MP4 em WebView vs navegador/player externo;
3. avaliar CORS/range requests/codec;
4. decidir se MP4 deve usar native video, HLS adapter, player nativo Android ou intent externo;
5. validar Live TV/MPEG-TS separadamente.
