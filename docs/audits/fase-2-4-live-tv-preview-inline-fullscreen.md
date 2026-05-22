# RELATÓRIO FINAL — FASE 2.4
## Live TV preview inline + fullscreen controlado — Xandeflix 2.0

## 1. Contexto

Projeto: Xandeflix 2.0
Branch base: main pós-PR #78
Branch de trabalho: feat/live-tv-inline-preview
Objetivo: implementar fluxo controlado na Live TV em que o primeiro OK/Enter não abra diretamente a tela de player/telemetria e o segundo OK/Enter no mesmo canal abra reprodução em tela cheia.

## 2. Diagnóstico inicial

Antes da Fase 2.4, o fluxo da Live TV estava funcional, mas ainda não era a experiência desejada:

- OK/Enter em canal abria `/player`.
- A tela do Player Universal/telemetria era exibida.
- O usuário precisava acionar “Abrir player”.
- O player nativo Android abria e reproduzia o canal em tela cheia.

A Fase 2.3 já havia validado que a reprodução real de Live TV funcionava no Fire Stick quando acionada pelo player nativo.

## 3. Alterações realizadas

Arquivo alterado:

- `src/features/live/pages/LiveTvPage.tsx`

Relatório criado:

- `docs/audits/fase-2-4-live-tv-preview-inline-fullscreen.md`

Alterações principais:

- Adicionado estado local de preview:
  - `previewChannel`
  - `previewStatus`
  - `previewError`
  - `previewVideoRef`
  - `previewAdapterRef`
  - `previewRequestIdRef`
- Adicionada lógica de seleção em dois passos:
  - primeiro OK seleciona o canal e tenta iniciar o fluxo de preview;
  - segundo OK no mesmo canal abre fullscreen.
- Corrigido duplo acionamento do Fire Stick:
  - removido `onClick` duplicado dos botões de canal;
  - adicionado `lastChannelActivationRef` para ignorar acionamentos duplicados em janela curta.
- Adicionada proteção para Fire Stick/Android:
  - canais MPEG-TS/MP4 que dependem do player nativo Android não tentam mais preview via WebView/mpegts.js;
  - nesses casos, o primeiro OK exibe mensagem controlada informando que a prévia inline está indisponível;
  - o segundo OK abre o player nativo direto.
- Adicionado fullscreen nativo direto na Live TV para streams suportados pelo `nativeAndroidPlayerAdapter`.
- Mantido fallback para `/player` apenas quando o stream não for elegível ao player nativo Android direto.

## 4. Fluxo implementado

### Primeiro OK/Enter

- Seleciona o canal.
- Mantém o usuário na Live TV.
- Para streams MPEG-TS/MP4 no Fire Stick/Android, exibe mensagem controlada:

> Prévia inline indisponível para este tipo de canal no Fire Stick. Pressione OK novamente para abrir em tela cheia.

### Segundo OK/Enter no mesmo canal

- Abre o player nativo Android direto.
- Não passa mais pela tela de telemetria do Player Universal.
- O canal reproduz em tela cheia.

### Canal diferente

- Troca o canal ativo.
- Reinicia o fluxo de preview/aviso controlado para o novo canal.

### Voltar

- Ao voltar do player nativo, retorna direto para Live TV.
- Não retorna para a tela de telemetria.
- A grade de canais permanece carregada.

### Foco / D-pad

- O foco permanece funcional na lista de canais.
- D-pad continua navegando normalmente.

## 5. Validações técnicas executadas

### Validação curta pós-patch

- Escopo restrito: somente `src/features/live/pages/LiveTvPage.tsx`.
- `git diff --check`: aprovado.
- TypeScript (`npx.cmd tsc -b`): aprovado.
- Build Vite: aprovado.

### Pós-correção do duplo OK

- `lastChannelActivationRef` aplicado.
- `onClick` duplicado removido dos botões de canal.
- `git diff --check`: aprovado.
- TypeScript: aprovado.
- Build Vite: aprovado.

### Pós-fullscreen nativo direto

- `nativeAndroidPlayerAdapter` importado e usado na Live TV.
- `git diff --check`: aprovado.
- TypeScript: aprovado.
- Build Vite: aprovado.
- Aviso conhecido do Vite: chunks acima de 500 kB, sem bloquear build.

## 6. Teste Fire Stick

Resultado manual informado:

- App abriu normalmente: sim.
- Live TV abriu: sim.
- Lista de canais carregou: sim.
- Primeiro OK no canal não abriu mais telemetria: sim.
- Primeiro OK mostrou mensagem controlada de preview indisponível para o tipo de canal no Fire Stick: sim.
- Segundo OK abriu player nativo direto: sim.
- Canal reproduziu em tela cheia: sim.
- Voltar retornou direto para Live TV: sim.
- D-pad/foco continuou funcionando: sim.
- App fechou sozinho: não.

## 7. Problemas encontrados

### 7.1 Duplo acionamento no Fire Stick

Sintoma:

- Primeiro OK abria `/player`/telemetria mesmo após implementação inicial do preview.

Causa provável:

- O botão de canal chamava `handleSelectChannel` tanto por `onEnterPress` quanto por `onClick`.
- No Fire Stick, o Select podia gerar acionamento duplicado, transformando o primeiro OK em segundo OK.

Correção:

- Removido `onClick` duplicado dos botões de canal.
- Adicionado `lastChannelActivationRef` para ignorar acionamentos repetidos em janela curta.

### 7.2 Preview MPEG-TS via WebView/mpegts.js falhou

Sintoma:

- Preview inline tentou carregar via `mpegts.js`.
- Falhou com erro semelhante a:
  - `NetworkError | Exception | {"code":-1,"msg":"Failed to fetch"}`

Interpretação:

- O WebView do Fire Stick não foi confiável para preview inline MPEG-TS via `mpegts.js`.
- O player nativo Android continuou reproduzindo corretamente o mesmo canal.

Decisão técnica:

- Não insistir em MPEG-TS/MP4 inline via WebView nesta fase.
- Usar aviso controlado no primeiro OK e fullscreen nativo direto no segundo OK.
- Preservar a reprodução funcional já consolidada na PR #78.

## 8. Riscos restantes

- Preview inline com vídeo real ainda não está consolidado para canais MPEG-TS/MP4 no Fire Stick.
- A experiência final é controlada e funcional, mas o preview visual real depende de stream compatível com WebView/HLS ou de futura implementação nativa inline.
- Logs de sistema do Fire Stick continuam exibindo mensagens ruidosas do Amazon WebView, mas não houve crash funcional observado.
- Ainda pode ser necessário otimizar performance inicial por causa de avisos de frames pulados/chunks grandes, fora do escopo desta fase.

## 9. Decisão recomendada

Marcação:

- [x] Commitar Fase 2.4 após revisão final do diff.
- [ ] Corrigir bug pontual antes do commit.
- [ ] Separar preview e fullscreen em fases distintas.
- [ ] Reverter preview inline e manter `/player`.
- [ ] Outra decisão.

Justificativa:

A Fase 2.4 atingiu o objetivo principal de UX controlada na Live TV:

- primeiro OK não abre mais telemetria;
- segundo OK abre fullscreen;
- fullscreen usa player nativo direto;
- voltar retorna direto para Live TV;
- D-pad permanece funcional;
- app não fecha sozinho.

A prévia inline real em MPEG-TS/MP4 foi classificada como limitação técnica do WebView/Fire Stick e tratada com mensagem controlada, sem quebrar o player consolidado.

## 10. Confirmações finais

- [x] Home/cache não foi alterado.
- [x] Supabase/TMDB/IPTV/importação não foram alterados.
- [x] Warmup não foi ligado.
- [x] Player nativo MP4/MPEG-TS não foi quebrado.
- [x] Alteração funcional ficou restrita à Live TV.
- [x] Relatório foi criado.

## 11. Conclusão executiva

A Fase 2.4 está recomendada para commit como incremento funcional e seguro da Live TV.

O comportamento final validado no Fire Stick é:

1. Primeiro OK em canal mantém o usuário na Live TV e exibe estado controlado de preview.
2. Segundo OK no mesmo canal abre o player nativo direto em tela cheia.
3. O canal reproduz.
4. Voltar retorna diretamente para Live TV.
5. A grade permanece carregada.
6. D-pad/foco continuam funcionais.
7. O app não apresenta crash.

A limitação de preview inline real para MPEG-TS/MP4 no WebView deve ser registrada como risco técnico futuro, não como bloqueador desta fase.
