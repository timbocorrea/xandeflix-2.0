# Auditoria — Sanitização de logs nativos Android / Player

## Contexto

Demanda aberta após o merge da PR #15.

A PR #15 sanitizou logs runtime TSX de Live TV em `src/features/live/pages/LiveTvPage.tsx`, mas manteve Android nativo e Player fora do escopo. A auditoria posterior confirmou riscos remanescentes em:

- `android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java`
- `android/app/src/main/java/com/xandeflix/app/NativePlayerActivity.java`

## Escopo permitido aplicado

- Sanitização de logs runtime do plugin Android nativo.
- Sanitização de logs runtime da Activity do player Android nativo.
- Remoção do `streamUrl` cru no payload do evento de resume emitido pelo plugin.
- Documentação da auditoria nativa.

## Fora do escopo mantido

- Supabase.
- Edge Functions.
- Migrations/schema.
- Home.
- Filmes.
- Séries.
- `LiveTvPage.tsx` já mergeado na PR #15.
- Troca de biblioteca de reprodução.
- Refatoração ampla Android.
- Limpeza de dados do app.
- Mudança visual do player.
- Mudança funcional do player.
- Troca da chave de progresso baseada em URL real.

## Sanitização aplicada

Campos removidos dos logs nativos:

- título real (`title`, `currentTitle`, `safeTitle`);
- URL real;
- URL mascarada;
- resumo de headers (`getHeaderSummary`);
- exceção crua como terceiro argumento de `Log.e` / `Log.w`;
- mensagem crua de erro via `error.getMessage()` nos rejeitos internos;
- payload cru de resume contendo `streamUrl`.

Campos seguros mantidos/adicionados:

- `hasTitle`;
- `hasStreamUrl`;
- `streamKind`;
- `candidateIndex`;
- `candidateCount`;
- `nextCandidateIndex`;
- `nextCandidateCount`;
- `errorName`;
- `httpStatus` sanitizado ou `unknown`;
- `eventCode`;
- `positionMs`;
- `hasSavedPosition`.

## Evento de resume

Antes, o evento de resume podia incluir:

```text
streamUrl=<valor cru>
```

Agora, quando há posição salva, o evento mantém somente:

```text
positionMs=<numero>
hasStreamUrl=<boolean>
hasSavedPosition=true
```

A URL real continua sendo consumida internamente para limpar o estado temporário, mas não é emitida para listeners nem para logs.

## Persistência de progresso

A persistência atual continua usando chave baseada em URL real:

```text
url:<streamUrl>
```

Essa decisão foi mantida intencionalmente nesta demanda para não afetar retomada de reprodução já salva.

A troca para hash estável deve ser tratada em fase separada, com plano de migração/compatibilidade, porque pode alterar comportamento de retomada existente.

## Classificação técnica

```text
NATIVE_PLAYER_LOG_SANITIZATION_PATCH=APLICADO
COMPORTAMENTO_FUNCIONAL_INTENCIONALMENTE_ALTERADO=NAO
PLAYER_LIBRARY_CHANGED=NAO
PROGRESS_STORAGE_KEY_CHANGED=NAO
RESUME_EVENT_STREAM_URL_REMOVED=SIM
RAW_EXCEPTION_LOGGING_REMOVED=SIM
MASKED_URL_LOGGING_REMOVED=SIM
HEADER_SUMMARY_LOGGING_REMOVED=SIM
```

## Gates obrigatórios pendentes

Executar no ambiente local antes de Ready for Review:

```text
npm run governance:check
npm run build --if-present
git diff --check
```

Executar Gate Fire Stick obrigatório antes de merge:

- abrir Home;
- abrir Live TV;
- abrir preview inline, quando aplicável;
- abrir player fullscreen nativo;
- validar fallback de candidatos quando ocorrer erro HTTP;
- validar retomada de posição em VOD/episódio;
- validar D-pad: play/pause, avançar, voltar, menu/controller, BACK;
- confirmar ausência de título real, URL real, URL mascarada, headers summary, exceção crua e mensagem crua de erro em logs nativos.

## Próximo passo recomendado

Abrir PR como Draft a partir de `fix/issue-native-player-log-sanitization` para `main`, executar gates locais e depois Gate Fire Stick físico antes de Ready for Review.
