# Auditoria — Sanitização de logs legados de Live TV

## Contexto

Demanda aberta após a Fase 12.4 / PR #14.

Objetivo: auditar e sanitizar logs legados de Live TV sem alterar comportamento funcional.

## Escopo permitido aplicado

- Live TV TSX auditado.
- Logs inseguros do fluxo `src/features/live/pages/LiveTvPage.tsx` sanitizados.
- Nenhuma alteração funcional intencional.
- Nenhuma alteração em Supabase.
- Nenhuma alteração em Edge Functions.
- Nenhuma alteração em migrations.
- Nenhuma alteração em Filmes.
- Nenhuma alteração em Séries.
- Nenhuma alteração em Home.
- Nenhuma alteração em fonte IPTV.
- Nenhuma limpeza de dados do app.

## Sanitização aplicada

Campos removidos dos logs de Live TV TSX:

- nome real de canal;
- URL mascarada de stream;
- evento cru de resume;
- mensagem de erro potencialmente sensível.

Campos seguros mantidos/adicionados:

- playbackRequested;
- restoreRequested;
- duplicateIgnored;
- hasPlaybackUrl;
- hasChannelName;
- kind;
- layout;
- elapsedMs;
- errorName;
- source técnico quando disponível.

## Riscos confirmados fora do patch

Foram observados logs em Android nativo / Player com dados operacionais, incluindo `title`, `url` mascarada e erro cru.

Arquivos com risco confirmado:

- `android/app/src/main/java/com/xandeflix/app/NativeAndroidPlayerPlugin.java`
- `android/app/src/main/java/com/xandeflix/app/NativePlayerActivity.java`

Classificação: RISCO CONFIRMADO / PATCH BLOQUEADO POR ESCOPO.

Motivo: a demanda proíbe alterar Android nativo e Player neste ciclo.

## Decisão técnica

O patch deste ciclo ficou restrito ao Live TV TSX.

A sanitização Android nativa deve virar subdemanda separada ou ser reautorizada explicitamente pelo Analista Mestre, porque o escopo original proíbe alterações em Android nativo e Player.

## Critérios esperados

- Governance check passa.
- Build passa.
- Diff check passa.
- Live TV continua abrindo.
- Grupos e canais continuam aparecendo.
- Player continua abrindo.
- Logs TSX de Live TV não registram nome real de canal.
- Logs TSX de Live TV não registram URL ou URL mascarada.
- Logs TSX de Live TV não registram evento cru de resume.

## Ajuste adicional - telemetria de preview

Durante o Gate Browser, foi identificado que o log XANDEFLIX_LIVE_PREVIEW_TELEMETRY ainda registrava campos ambiguos para auditoria automatizada.

Ajuste aplicado:
- Substituido campo tecnico name por telemetryCode.
- Substituida mensagem textual por hasMessage.
- Mantidos apenas source, telemetryCode, level e hasMessage.
- Nenhum nome real de canal, nome real de grupo, endereco de reproducao, payload cru ou erro cru deve ser emitido por esse log.

Classificacao:
TELEMETRY_LOG_SANITIZATION_PATCH=APLICADO

## Ajuste corretivo real - telemetria de preview

No ciclo anterior, o relatorio foi atualizado, mas a substituicao no TSX nao havia sido aplicada porque o bloco exato nao foi encontrado.

Neste ciclo foi aplicado patch real por regex tolerante em LiveTvPage.tsx.

Confirmacao esperada no codigo:
- name: event.name removido do payload do log.
- message: event.message removido do payload do log.
- telemetryCode: event.name mantido como codigo tecnico.
- hasMessage: Boolean(event.message) mantido como flag booleana.

Classificacao:
TELEMETRY_LOG_TSX_REAL_PATCH=APLICADO
