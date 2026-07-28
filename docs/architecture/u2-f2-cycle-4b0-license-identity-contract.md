# U2-F2 — Subciclo 4B0: contrato de identidade interna da licença

## Causa do bloqueio

O carregamento autorizado obtinha um `AuthorizedIptvSource` com o identificador
interno estável `license.id`, mas o convertia para `PlaylistSource` antes de
chamar o runtime. Como `PlaylistSource` representa somente a fonte, o
identificador da licença era descartado e o sidecar v3 não tinha material
seguro para derivar um escopo opaco.

## Contrato runtime-only

`PlaylistRuntimeAuthorizationContext` transporta somente
`internalLicenseId`. O call site autorizado deriva esse contexto de
`AuthorizedIptvSource.license.id`, aplica `trim` e o entrega como segundo
argumento opcional de `loadFromSource`.

`PlaylistSource` permanece funcionalmente inalterado e não contém identidade
de licença. Fontes manuais continuam chamando `loadFromSource` apenas com a
fonte.

## Segurança e persistência

- `license.code` não é usado como fallback nem copiado para o contexto.
- Identificadores de dispositivo, cliente e fonte não substituem a identidade
  do tenant.
- O contexto não é armazenado em estado React, localStorage, sessionStorage ou
  IndexedDB.
- O identificador não é incluído em logs, erros, diagnósticos ou métricas.
- O contexto não é enviado ao downloader, parser, player ou importador v2.
- Este documento não contém valores reais.

## Compatibilidade legada

Quando `license.id` estiver ausente ou vazio, o mapper retorna `null`. O
segundo argumento de `loadFromSource` é opcional, preservando fontes manuais e
o modo legado.

## Limites do subciclo

Este subciclo não deriva `tenantScopeId`, não abre o IndexedDB v3, não cria
scope ou snapshot, não inicia staging, não ativa flags e não altera download,
parser ou comportamento funcional do runtime.

## Handoff para o Ciclo 4B1

O Ciclo 4B1 poderá consumir o `internalLicenseId` efêmero dentro da chamada do
provider para derivar o escopo opaco e preparar o sidecar opt-in. A ausência do
contexto deverá continuar sendo tratada de forma fail-open para o runtime
legado.
