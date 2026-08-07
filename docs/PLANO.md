# Xandeflix 2.0 — Plano de Execução do MVP

## 1. Controle do documento

STATUS=OPERATIONAL_MEMORY

CANONICAL_SPEC=NAO

MATERIALIZED_BY_CYCLE=MVP-S0.2

Este documento organiza a execução operacional das Vertical Slices do MVP.

Ele não substitui:

- `docs/product/XANDEFLIX_PRD.md`;
- `docs/FSD.md`;
- `docs/DESIGN.md`;
- `docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md`;
- `docs/architecture/XANDEFLIX_MVP_EXECUTION_CONTRACT.md`;
- `docs/MVP_ACCEPTANCE.md`.

Em caso de divergência:

`CANONICAL_DOCUMENT_CONFLICT → STOP → MASTER_DECISION_REQUIRED`

---

# 2. Estado inicial deste plano

`MVP_S0_2=MATERIALIZATION_IN_PROGRESS`

`VS_01_STARTED=NAO`

`ACTIVE_VERTICAL_SLICE=NONE`

Nenhuma Vertical Slice do roadmap MVP é iniciada pela simples criação deste documento.

Este ciclo é exclusivamente de materialização documental.

---

# 3. Regra de execução

A ordem canônica do roadmap é:

`VS-01`

→ `VS-02`

→ `VS-03`

→ `VS-04`

→ `VS-05`

→ `VS-06`

→ `VS-07`

→ `VS-08`

→ `VS-09`

→ `VS-10`

A ordem pode ter dependências técnicas internas, mas não deve ser fragmentada em microciclos que substituam as slices.

Regra:

`ONE_SLICE_REMAINS_IN_PROGRESS_UNTIL_DOD=SIM`

Quando um bug pertencente à slice ativa for descoberto:

`BUG_WITHIN_ACTIVE_SLICE → KEEP_SAME_SLICE_IN_PROGRESS`

Não criar automaticamente:

- VS-01A;
- VS-01B;
- VS-03.1;
- VS-05-fix;
- micro-slices equivalentes.

Correções internas fazem parte do DoD da própria slice.

---

# 4. VS-01 — Ativar e abrir

## Objetivo

Entregar a jornada mínima confiável:

Activation → Device Authorization → Source Resolution → Cold Start → Catalog Local → Home utilizável.

## Escopo funcional principal

- FSD-01 Activation;
- FSD-02 Source Resolution;
- FSD-03 Cold Start;
- partes aplicáveis de FSD-06 Catalog Import;
- partes aplicáveis de FSD-08 Home;
- FSD-16 Revocation quando necessário para acesso inicial;
- FSD-17 Loading / Empty / Error / Retry.

## Dependências

- PRD aprovado;
- FSD aprovado;
- Architecture Contract vigente;
- Acceptance Matrix vigente;
- Control Plane mínimo disponível para teste real.

## Definition of Done

- activation válida;
- dispositivo válido;
- source resolution válida;
- fetch da source direto pelo endpoint;
- import local funcional;
- Home utilizável;
- `NO_FALSE_EMPTY`;
- `NO_INFINITE_LOADING`;
- retry quando aplicável;
- Architecture Gate PASS;
- Automated Gate PASS;
- Phone Gate PASS;
- Tablet Gate PASS;
- TV Gate quando mudança específica de TV exigir.

## Estado

`VS-01=NOT_STARTED`

---

# 5. VS-02 — Descobrir conteúdo

## Objetivo

Entregar discovery utilizável sobre catálogo local.

## Escopo funcional principal

- FSD-08 Home;
- Hero;
- carrosséis;
- categorias;
- cards;
- artwork fallback;
- FSD-18 Touch;
- FSD-19 D-pad quando aplicável;
- FSD-20 BACK;
- FSD-21 Orientation.

## Dependências

`VS-01=DONE`

## Definition of Done

- Home funcional;
- Hero funcional;
- carrosséis funcionais;
- categorias funcionais;
- cards funcionais;
- artwork fallback funcional;
- loading/empty/error distintos;
- touch aprovado;
- navegação adaptada ao device;
- D-pad quando aplicável;
- Phone Gate PASS;
- Tablet Gate PASS;
- TV Gate conforme matriz.

## Estado

`VS-02=NOT_STARTED`

---

# 6. VS-03 — Assistir Live + continuidade

## Objetivo

Entregar Live TV com seleção, preview, player e continuidade local.

## Escopo funcional principal

- FSD-09 Live;
- FSD-14 Player;
- FSD-15 Continuity State;
- FSD-18 Touch;
- FSD-19 D-pad;
- FSD-20 BACK;
- FSD-21 Orientation.

## Dependências

`VS-01=DONE`

`VS-02=DONE`

## Definition of Done

- grupos e canais;
- seleção correta;
- preview;
- playback;
- `LIVE_LAST_CHANNEL=CORE`;
- `LIVE_PREVIEW_RESUMES_LAST_CHANNEL=CORE`;
- aspect ratio correto;
- BACK correto;
- erro seguro;
- continuity local;
- Phone Gate PASS;
- Tablet Gate PASS;
- TV/D-pad Gate quando aplicável pela matriz.

## Estado

`VS-03=NOT_STARTED`

---

# 7. VS-04 — Assistir Filme + continuidade

## Objetivo

Entregar jornada completa de Filme com detalhe, playback e resume.

## Escopo funcional principal

- FSD-10 Movies;
- FSD-14 Player;
- FSD-15 Continuity State;
- FSD-18 Touch;
- FSD-19 D-pad quando aplicável;
- FSD-20 BACK.

## Dependências

`VS-02=DONE`

## Definition of Done

- navegação de Filmes;
- categorias;
- cards;
- detalhe;
- artwork fallback;
- playback direto da source;
- `MOVIE_RESUME=CORE`;
- BACK correto;
- Phone Gate PASS;
- Tablet Gate PASS;
- TV Gate conforme matriz.

## Estado

`VS-04=NOT_STARTED`

---

# 8. VS-05 — Assistir Episódio + continuidade

## Objetivo

Entregar jornada de Séries/Episódios com episódio correto, playback e continuidade.

## Escopo funcional principal

- FSD-11 Series;
- FSD-12 Episodes;
- FSD-14 Player;
- FSD-15 Continuity State;
- FSD-18 Touch;
- FSD-19 D-pad quando aplicável;
- FSD-20 BACK.

## Dependências

`VS-02=DONE`

## Definition of Done

- Séries funcionais;
- temporadas funcionais;
- episódios funcionais;
- episódio selecionado abre o episódio correto;
- player funcional;
- `EPISODE_RESUME=CORE`;
- `SERIES_CONTINUITY=CORE`;
- BACK retorna ao contexto correto;
- Phone Gate PASS;
- Tablet Gate PASS;
- TV Gate conforme matriz.

## Regra de correção interna

Se um bug for encontrado durante esta slice:

`VS-05=IN_PROGRESS`

até que o DoD integral seja satisfeito.

Não criar micro-slice apenas para correção do bug.

## Estado

`VS-05=NOT_STARTED`

---

# 9. VS-06 — Buscar e reproduzir

## Objetivo

Entregar Search local completo e abertura/reprodução do resultado correto.

## Escopo funcional principal

- FSD-13 Search;
- integração aplicável com FSD-14 Player;
- loading/indexing/error/zero results;
- touch;
- D-pad quando aplicável;
- BACK.

## Dependências

- catálogo local funcional;
- índice local funcional;
- entidades de Movies/Series/Live suficientemente estáveis.

## Definition of Done

- exact match;
- partial match;
- internal token;
- zero result verdadeiro;
- indexing distinto de zero result;
- error distinto;
- abertura do resultado correto;
- playback quando aplicável;
- `CONTENT_SEARCH=DEVICE_LOCAL`;
- performance evidence registrada;
- Phone Gate PASS;
- Tablet Gate PASS;
- TV Gate conforme matriz.

## Performance

A evidência:

`SEARCH_QUERY=Silo`

`OBSERVED_TERMINAL_TIME≈55s`

`APPARENT_VISUAL_PAUSE≈20s`

continua classificada como:

`PERFORMANCE_EVIDENCE=SIM`

`PERFORMANCE_DEBT=SIM`

`ACCEPTED_AS_TARGET=NAO`

`AUTOMATIC_SLA=NAO`

## Estado

`VS-06=NOT_STARTED`

---

# 10. VS-07 — Resiliência online

## Objetivo

Garantir comportamento correto diante de warm start, refresh e falhas de rede sem criar promessa offline-first.

## Escopo funcional principal

- FSD-04 Warm Start;
- FSD-05 Network Failure;
- FSD-07 Catalog Refresh;
- FSD-16 Revocation;
- FSD-17 Loading / Empty / Error / Retry;
- Active Generation Safety.

## Dependências

- catálogo local funcionando;
- jornadas Core das slices anteriores suficientemente integradas.

## Definition of Done

- warm start local-first;
- refresh seguro;
- rede lenta tratada;
- falha de rede tratada;
- retry quando aplicável;
- geração válida preservada;
- `ACTIVE_GENERATION_SAFETY=SIM`;
- `NO_FALSE_EMPTY=SIM`;
- `NO_INFINITE_LOADING=SIM`;
- revogação funcional;
- loading/empty/error corretos.

## Restrição

`LOCAL_FIRST=SIM`

`OFFLINE_FIRST=NAO`

Não criar offline playback ou full offline mode como requisito MVP.

## Estado

`VS-07=NOT_STARTED`

---

# 11. VS-08 — Multi-user / Stress Test

## Objetivo

Validar isolamento, concorrência e comportamento real do produto sob múltiplos usuários/licenças/dispositivos.

## Escopo

- múltiplos usuários;
- múltiplos clientes;
- múltiplas licenças;
- múltiplos dispositivos;
- activation concorrente;
- revogações;
- isolamento;
- sessões;
- concorrência;
- segurança.

## Dependências

- jornadas endpoint principais concluídas;
- Control Plane mínimo operacional;
- ambiente de teste adequado.

## Definition of Done

- testes de stress executados;
- isolamento preservado;
- nenhuma autorização cruzada;
- concorrência aceitável para requisitos definidos;
- regressões críticas resolvidas;
- Security Gate PASS.

`MULTI_USER_STRESS_TEST=REQUIRED_BEFORE_COMMERCIAL_RELEASE`

## Estado

`VS-08=NOT_STARTED`

---

# 12. VS-09 — Control Plane pré-comercial

## Objetivo

Validar que o Control Plane mínimo evoluiu para capacidade operacional suficiente antes da comercialização.

## Escopo

- clientes;
- usuários;
- licenças;
- dispositivos;
- authorized sources;
- activation/binding;
- status;
- validade;
- revogação;
- instalações;
- auditoria sanitizada;
- suporte operacional.

## Dependências

- decisões de operação comercial definidas;
- VS-08 suficientemente concluída;
- Architecture Contract preservado.

## Definition of Done

- operações necessárias executáveis;
- segurança aprovada;
- revogação aprovada;
- auditoria sanitizada;
- isolamento comprovado;
- nenhum catálogo IPTV central introduzido.

`FULL_CONTROL_PLANE_OPERATIONAL_GATE=REQUIRED_BEFORE_COMMERCIAL_RELEASE`

## Estado

`VS-09=NOT_STARTED`

---

# 13. VS-10 — Release Multi-Device

## Objetivo

Executar o Gate Final do MVP antes de qualquer decisão de release comercial.

## Dependências

`VS-01=DONE`

`VS-02=DONE`

`VS-03=DONE`

`VS-04=DONE`

`VS-05=DONE`

`VS-06=DONE`

`VS-07=DONE`

`VS-08=DONE`

`VS-09=DONE`

## Definition of Done

- automated final gate PASS;
- Phone final gate PASS;
- Tablet final gate PASS;
- Fire Stick / Android TV final gate PASS;
- D-pad physical gate PASS;
- Architecture Gate PASS;
- Security Gate PASS;
- Multi-user Stress Gate PASS;
- Full Control Plane Operational Gate PASS;
- regressão final PASS;
- nenhum CRITICAL blocker;
- NFRs numéricos de performance decididos.

Regras:

`TV_DEFER_ALLOWED=NAO`

`FIRE_STICK_FINAL_GATE_BEFORE_COMMERCIAL_RELEASE=REQUIRED`

`DPAD_FINAL_PHYSICAL_GATE=REQUIRED`

`COMMERCIAL_RELEASE_WITHOUT_TV_GATE=PROIBIDO`

`COMMERCIAL_RELEASE_WITH_UNDECIDED_PERFORMANCE_NFRS=NAO`

## Estado

`VS-10=NOT_STARTED`

---

# 14. NFRs pendentes de decisão

Os seguintes valores ainda não são automaticamente decididos pelo plano:

`COLD_START_SLA=NFR_UNDECIDED`

`SEARCH_SLA=NFR_UNDECIDED`

`SLOW_NETWORK_SLA=NFR_UNDECIDED`

Podem permanecer assim durante slices intermediárias:

`NFR_NUMERIC_TARGETS_MAY_REMAIN_UNDECIDED_DURING_SLICES=SIM`

Mas devem ser decididos antes do release comercial.

---

# 15. Ordem operacional resumida

| Ordem | Slice | Dependência principal | Estado inicial |
|---|---|---|---|
| 1 | VS-01 — Ativar e abrir | Specs + Control Plane mínimo | NOT_STARTED |
| 2 | VS-02 — Descobrir conteúdo | VS-01 | NOT_STARTED |
| 3 | VS-03 — Assistir Live + continuidade | VS-01/VS-02 | NOT_STARTED |
| 4 | VS-04 — Assistir Filme + continuidade | VS-02 | NOT_STARTED |
| 5 | VS-05 — Assistir Episódio + continuidade | VS-02 | NOT_STARTED |
| 6 | VS-06 — Buscar e reproduzir | Catálogo/índice/jornadas | NOT_STARTED |
| 7 | VS-07 — Resiliência online | Jornadas Core | NOT_STARTED |
| 8 | VS-08 — Multi-user / Stress Test | Core integrado | NOT_STARTED |
| 9 | VS-09 — Control Plane pré-comercial | VS-08 + operação | NOT_STARTED |
| 10 | VS-10 — Release Multi-Device | VS-01 → VS-09 | NOT_STARTED |

---

# 16. Política contra microciclos

Os antigos identificadores técnicos ou históricos podem continuar existindo como provenance, mas não formam o roadmap canônico do MVP.

Não recriar como plano:

`U2-F3.1A`

`U2-F3.1B`

`U2-F3.1C`

`U2-F3.1D`

Nem criar novas subdivisões equivalentes apenas para bugs internos.

Regra:

`BUG_FIX_INSIDE_SLICE=KEEP_SLICE_IN_PROGRESS`

`NEW_SLICE_ONLY_FOR_DISTINCT_PRODUCT_OUTCOME=SIM`

---

# 17. Regra final

Até autorização explícita para iniciar implementação:

`ACTIVE_VERTICAL_SLICE=NONE`

`VS_01_STARTED=NAO`

`VS_01_TO_VS_10_IMPLEMENTATION_STARTED=NAO`

A materialização deste plano:

`DOES_NOT_START_VS_01=SIM`