# RELATÓRIO — FASE 3.9.6
## Bug: interrupção de vídeo em Canais ao Vivo após ~2min30s

## 1. Sintoma investigado

Durante reprodução de Canais ao Vivo, o vídeo era interrompido após aproximadamente 2 minutos e 30 segundos.

## 2. Escopo da investigação

A investigação foi feita sem alterar:

- Home.
- Live TV.
- VOD.
- Player nativo Android.
- D-pad/focus/spatial/Norigin.
- Layout responsivo Android TV/Fire Stick.

## 3. Evidência encontrada

O fluxo do Player Universal inicia sessão de reprodução para controle de telas simultâneas e agenda heartbeat a cada 60 segundos.

As Edge Functions `start-playback-session` e `heartbeat-playback-session` criavam/renovavam a validade da sessão com apenas 3 minutos:

`now + 3 * 60 * 1000`

No player nativo Android fullscreen, o WebView/JS pode ser pausado, atrasado ou sofrer throttling. Nesse cenário, o heartbeat pode não renovar a sessão a tempo, causando expiração próxima de 3 minutos. O sintoma visual pode aparecer perto de 2min30s dependendo do tempo entre abertura, início real do stream e atualização do estado.

## 4. Correção aplicada

Foi criada a constante:

`PLAYBACK_SESSION_TTL_MS = 10 * 60 * 1000`

E a expiração passou a usar essa constante em:

- `supabase/functions/start-playback-session/index.ts`
- `supabase/functions/heartbeat-playback-session/index.ts`

## 5. Justificativa

A alteração aumenta a tolerância contra atrasos de heartbeat causados pelo ciclo de vida do WebView quando o player nativo Android está ativo.

Essa correção não altera o player, o ExoPlayer, a navegação, o layout ou a lógica visual do app. Ela apenas reduz falso encerramento/expiração prematura da sessão de playback.

## 6. Risco residual

A correção reduz fortemente o risco de corte por expiração de sessão, mas ainda é necessário validar reprodução real por mais de 10 minutos em:

- Tablet Android/touch.
- Fire Stick/Android TV quando disponível.

Caso o corte continue exatamente no mesmo tempo mesmo após deploy das funções, a próxima investigação deve focar em:

- URL/token do provedor IPTV.
- Erros HTTP do ExoPlayer após tempo fixo.
- Logs `XandeflixNativePlayer` durante a reprodução contínua.
- Possível pausa/lifecycle nativo.

## 7. Validação técnica local

- Escopo restrito às funções de sessão.
- `git diff --check`: OK.
- TypeScript frontend: OK.
- Build Vite: OK.

## 8. Conclusão

A principal causa provável do bug de interrupção por volta de 2min30s foi mitigada aumentando a janela de expiração da sessão de playback de 3 para 10 minutos. A próxima etapa é commit/push e deploy das funções Supabase antes do reteste real no tablet Android.
