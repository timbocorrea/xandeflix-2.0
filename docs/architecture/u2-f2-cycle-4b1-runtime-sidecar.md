# U2-F2 — Ciclo 4B1: sidecar de snapshots no runtime

## Ativação controlada

O sidecar v3 é controlado por duas flags booleanas:

- `VITE_LOCAL_CATALOG_SNAPSHOT_IMPORT_ENABLED` habilita a preparação e a
  escrita do snapshot.
- `VITE_LOCAL_CATALOG_SNAPSHOT_PROMOTION_ENABLED` permite a promoção explícita
  depois da conclusão; ela só é efetiva quando a importação também está ativa.

Ambas são `false` quando ausentes. Com a importação desativada, o provider não
importa o bridge dinamicamente, não deriva escopo e não abre o IndexedDB v3.

## Identidade e escopo opaco

O `internalLicenseId` chega ao provider somente pelo contexto runtime definido
no 4B0. O bridge usa esse valor temporariamente para derivar, com SHA-256 e
separação de domínio versionada, um `tenantScopeId` opaco. O `scopeKey` combina
de forma criptográfica esse tenant opaco com o `sourceId` validado.

O identificador interno bruto não é mantido pelo bridge nem persistido. Código
de licença, URL, token e identificador de dispositivo não participam da
derivação.

## Runtime epoch e staging anterior

Cada nova sessão real prepara o scope em uma transação que incrementa
`runtimeEpoch`, preserva o snapshot ativo e limpa o ponteiro de staging antigo.
Snapshots antigos `building` ou `validating` são cancelados com código
sanitizado. Um snapshot `ready` é preservado, mas destacado e nunca promovido
implicitamente. A epoch impede gravações e promoções tardias.

## Download, parser e dual-write

O provider continua chamando o loader uma única vez. O parser existente emite
e aguarda os lotes em ordem. Cada mesmo lote segue para:

1. o array React legado;
2. o importador IndexedDB v2 existente;
3. o sidecar v3, quando habilitado.

O sidecar não inicia download ou parser e não mantém um segundo catálogo
crescente. A transformação interna é limitada ao lote corrente, com
concorrência padrão 2 e máximo 4.

## Fila, conclusão e cancelamento

A sessão v3 encadeia gravações, mantendo apenas uma transação de lote ativa.
`complete` aguarda a fila antes de validar e marcar o snapshot como `ready`.
Abort, troca de fonte, request superado, `loadFromChannels`, `clearRuntime` e
unmount impedem novos lotes. Uma transação já iniciada pode terminar
atomicamente, mas a epoch impede efeitos tardios na sessão nova.

## Fail-open e observabilidade

A política é `FAIL_OPEN_TO_LEGACY`. Falhas de criptografia, IndexedDB,
transformação, escrita, conclusão ou promoção são convertidas em códigos
sanitizados e não interrompem loader, importador v2, estado React ou navegação.

Somente métricas agregadas de preparação, estado, lotes, itens, duplicatas,
falha sanitizada e faixa de duração são expostas. Identidades, hashes completos,
URLs, títulos, grupos, validadores, tokens, payloads e erros brutos não são
registrados.

## Promoção e leitores

Com promoção desativada, o snapshot termina `ready` e o ativo anterior é
preservado. Com promoção ativada, a promoção ocorre somente após loader,
parser, v2 classificado, fila v3 vazia, request atual e signal válido.

Home, Filmes, Séries, Live TV e Player continuam lendo o runtime legado. Este
ciclo não ativa leitores v3.

## Source revision e retomada

O loader atual não fornece ao provider uma revisão forte, ETag ou
Last-Modified. `sourceId` não é usado como revisão. Portanto, uma sessão real
sempre substitui com segurança um staging incompleto anterior:

- `NETWORK_RANGE_RESUME=NAO_ATIVADO`
- `PARSER_STATE_RESUME=NAO_ATIVADO`
- `RUNTIME_REAL_RESUME_WITHOUT_VALIDATORS=NAO`

O replay do 4A permanece disponível somente para importações que forneçam
evidência compatível.

## Conflito futuro com U2-F1B

Logout, revogação e troca de licença ainda precisam incrementar/inutilizar a
epoch e limpar ou bloquear scopes associados. Essa coordenação pertence ao
handoff com U2-F1B e não foi adicionada neste ciclo.

## Gates do Ciclo 4B2

O próximo ciclo deve validar flags ligadas e desligadas no runtime real,
cancelamento por troca de fonte, comportamento em dispositivos, estabilidade
de memória, ausência de regressão em Live TV/Player e promoção controlada.
