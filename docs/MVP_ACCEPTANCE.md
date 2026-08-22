# Xandeflix 2.0 — MVP Acceptance

## 1. Controle do documento

STATUS=APPROVED

CANON_APPROVED=SIM

MATERIALIZED_BY_CYCLE=MVP-S0.2

Este documento é a autoridade canônica para gates de Vertical Slice, validação multi-device e release comercial do Xandeflix 2.0.

Ele deve ser interpretado em conjunto com:

- `docs/product/XANDEFLIX_PRD.md`;
- `docs/FSD.md`;
- `docs/DESIGN.md`;
- `docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md`;
- `docs/architecture/XANDEFLIX_MVP_EXECUTION_CONTRACT.md`.

Conflito canônico:

`CANONICAL_DOCUMENT_CONFLICT → STOP → MASTER_DECISION_REQUIRED`

---

# 2. Tipos de Gate

## AUTOMATED_REQUIRED

Há validação automatizada obrigatória aplicável à slice.

## PHONE_REQUIRED

Há validação física obrigatória em Android Phone para a slice.

## TABLET_REQUIRED

Há validação física obrigatória em Android Tablet para a slice.

## TV_REQUIRED

Há validação física obrigatória em Fire Stick / Android TV para a slice.

## TV_DEFER_ALLOWED

A validação TV pode ser adiada durante desenvolvimento quando a slice não altera comportamento específico de TV e os demais gates obrigatórios foram aprovados.

## BLOCKING_FOR_SLICE

A falha impede o Definition of Done da Vertical Slice atual.

## BLOCKING_FOR_COMMERCIAL_RELEASE

A falha impede o lançamento comercial, mesmo quando não bloqueou avanço temporário entre slices.

---

# 3. Princípio de validação

A validação deve seguir, quando tecnicamente possível:

`SPEC`

→ `IMPLEMENTATION`

→ `AUTOMATED_REQUIRED`

→ `PHONE_REQUIRED`

→ `TABLET_REQUIRED`

→ `TV_REQUIRED_WHEN_APPLICABLE`

→ `SLICE_DOD`

Validação física não substitui automaticamente validação automatizada.

Validação automatizada não substitui automaticamente gate físico obrigatório.

---

# 4. Matriz canônica VS-01 → VS-10

| Slice | AUTOMATED_REQUIRED | PHONE_REQUIRED | TABLET_REQUIRED | TV_REQUIRED | TV_DEFER_ALLOWED | BLOCKING_FOR_SLICE | BLOCKING_FOR_COMMERCIAL_RELEASE |
|---|---|---|---|---|---|---|---|
| VS-01 — Ativar e abrir | SIM | SIM | SIM | CONDICIONAL | SIM | Automated + Phone + Tablet + TV quando específico | SIM |
| VS-02 — Descobrir conteúdo | SIM | SIM | SIM | CONDICIONAL | SIM | Automated + Phone + Tablet + TV quando específico | SIM |
| VS-03 — Assistir Live + continuidade | SIM | SIM | SIM | SIM quando TV/D-pad/player TV for alterado | CONDICIONAL | Matriz específica da mudança | SIM |
| VS-04 — Assistir Filme + continuidade | SIM | SIM | SIM | CONDICIONAL | SIM | Automated + Phone + Tablet + TV quando específico | SIM |
| VS-05 — Assistir Episódio + continuidade | SIM | SIM | SIM | CONDICIONAL | SIM | Automated + Phone + Tablet + TV quando específico | SIM |
| VS-06 — Buscar e reproduzir | SIM | SIM | SIM | CONDICIONAL | SIM | Automated + Phone + Tablet + TV quando específico | SIM |
| VS-07 — Resiliência online | SIM | SIM | SIM | CONDICIONAL | SIM | Automated + Phone + Tablet + TV quando específico | SIM |
| VS-08 — Multi-user / Stress Test | SIM | SMOKE_QUANDO_UTIL | SMOKE_QUANDO_UTIL | NAO | SIM | Stress Gate | SIM |
| VS-09 — Control Plane pré-comercial | SIM | NAO | NAO | NAO | SIM | Operational Gate | SIM |
| VS-10 — Release Multi-Device | SIM | SIM | SIM | SIM | NAO | TODOS | SIM |

---

# 5. Regra de deferimento de TV durante desenvolvimento

A ausência temporária do Fire Stick não deve bloquear automaticamente uma slice sem mudança específica de TV.

A próxima slice pode avançar quando todos os seguintes predicados forem verdadeiros:

`FIRE_STICK_UNAVAILABLE=SIM`

`NO_TV_SPECIFIC_CHANGE=SIM`

`AUTOMATED_PASS=SIM`

`PHONE_PASS=SIM`

`TABLET_PASS=SIM`

`TV_DEFER_ALLOWED=SIM`

Resultado possível:

`SLICE_ADVANCE_ALLOWED=SIM`

Essa regra não equivale a aprovação de release comercial.

---

# 6. Regra final obrigatória de TV

Antes do release comercial:

`FIRE_STICK_FINAL_GATE_BEFORE_COMMERCIAL_RELEASE=REQUIRED`

`TV_FINAL_GATE_REQUIRED_BEFORE_COMMERCIAL_RELEASE=SIM`

`DPAD_FINAL_PHYSICAL_GATE=REQUIRED`

`COMMERCIAL_RELEASE_WITHOUT_TV_GATE=PROIBIDO`

A indisponibilidade do Fire Stick no momento do release bloqueia a comercialização até execução satisfatória do gate.

---

# 7. Phone Continuous Gate

`PHONE_CONTINUOUS_GATE=REQUIRED`

Phone é dispositivo primário de desenvolvimento contínuo.

As slices de produto que alterarem jornadas endpoint devem validar, conforme aplicável:

- activation;
- bootstrap;
- Home;
- discovery;
- Live;
- Movies;
- Series;
- Episodes;
- Search;
- Player;
- BACK;
- Continuity State;
- loading;
- empty;
- error;
- retry;
- orientation quando aplicável.

Uma evidência antiga não substitui regressão mais recente.

`LATEST_REGRESSION_WINS=SIM`

---

# 8. Tablet Continuous Gate

`TABLET_CONTINUOUS_GATE=REQUIRED`

Tablet é dispositivo primário de desenvolvimento contínuo.

A validação deve considerar:

- touch;
- portrait;
- landscape;
- Hero;
- cards;
- carrosséis;
- Search;
- details;
- episodes;
- Live preview;
- Player;
- aspect ratio;
- BACK;
- Continuity State;
- orientation.

Quando houver regressão de orientação ou aspect ratio:

`TABLET_GATE=NOT_PASS`

até revalidação física.

---

# 9. TV / Fire Stick Gate

O Gate TV deve verificar, conforme escopo:

- abertura da aplicação;
- navegação global;
- foco inicial;
- foco visível;
- setas;
- OK;
- BACK;
- Home;
- Hero;
- cards;
- carrosséis;
- Live;
- preview;
- Player;
- Movies;
- Series;
- Episodes;
- Search;
- Continuity State;
- ausência de crop indevido;
- ausência de focus trap.

Quando D-pad for aplicável:

`DPAD_GATE=REQUIRED`

---

# 10. Automated Gate

Cada Vertical Slice deve possuir evidência automatizada proporcional ao comportamento alterado.

A automação pode incluir, conforme aplicável:

- testes unitários;
- testes de política;
- testes de serviço;
- testes de integração;
- smoke tests;
- build;
- typecheck;
- governança;
- testes Android;
- assemble Android.

Não canonizar neste documento um único comando universal enquanto a suíte do repositório não possuir essa autoridade.

`AUTOMATED_FIRST=SIM`

Falha global preexistente pode ser tratada como dívida separada somente quando houver evidência focal suficiente da slice e não tiver sido causada pelo patch.

---

# 11. Lint Gate

Há duas dívidas distintas conhecidas:

`ERR-LINT-01 — NESTED_PROJECT_LINT_SCOPE`

e

`ERR-LINT-02 — ROOT_PROJECT_PREEXISTING_LINT_DEBT`

Essas dívidas não bloqueiam automaticamente uma slice quando:

- o patch não as causou;
- gates focais relevantes passam;
- não existe regressão nova correspondente;
- Architecture Gate passa.

Isso não autoriza ignorar erro de lint causado pelo patch atual.

---

# 12. U2F3 Aggregate Smoke

`U2F3_AGGREGATE_SMOKE_ENV_DEPENDENCY=CONFIRMED`

`ROOT_CAUSE_CONFIDENCE=HIGH`

`STATUS=OPEN_TEST_HARNESS_DEBT`

`MVP_BLOCKER=NAO_ENQUANTO_HOUVER_EVIDENCIA_AUTOMATIZADA_FOCAL_SUFICIENTE`

Uma falha do smoke agregado só pode ser desconsiderada como blocker quando a provenance conhecida realmente se aplicar à execução atual.

Não generalizar essa exceção para testes diferentes.

---

# 13. Architecture Gate

Toda slice deve preservar:

`XANDEFLIX_BACKEND=CONTROL_PLANE_ONLY`

`SOURCE_FETCH=DEVICE_DIRECT`

`CATALOG_PROCESSING=DEVICE_LOCAL`

`CATALOG_STORAGE=DEVICE_LOCAL_ONLY`

`CONTENT_SEARCH=DEVICE_LOCAL`

`PLAYER_CONNECTION=DEVICE_TO_SOURCE_DIRECT`

E:

`CENTRAL_IPTV_CATALOG=NAO`

`CENTRAL_PLAYLIST_PROXY=NAO`

`CENTRAL_STREAM_PROXY=NAO`

`LOCAL_CATALOG_SYNC_TO_BACKEND=NAO`

Se houver conflito:

`ARCHITECTURE_GATE=FAIL`

`SLICE_DOD=BLOCKED`

---

# 14. Security Gate

Cada slice deve confirmar, quando aplicável:

- nenhuma credencial introduzida;
- nenhuma URL sensível nova em logs;
- nenhum stream URL real documentado;
- nenhum segredo em fixture;
- auditoria sanitizada;
- revogação preservada;
- isolamento por licença, device e source preservado.

Qualquer exposição real de segredo deve bloquear conclusão até tratamento adequado.

---

# 15. No False Empty Gate

Aplicável especialmente a:

- bootstrap;
- Home;
- Search;
- categorias;
- Live;
- Movies;
- Series.

O gate deve distinguir:

`LOADING`

`INDEXING`

`CONTENT`

`EMPTY_CONFIRMED`

`ERROR`

`RETRY`

`NO_FALSE_EMPTY=REQUIRED`

Uma superfície não passa quando exibe vazio devido a:

- corrida;
- import incompleto;
- índice ainda não pronto;
- timeout;
- falha de refresh;
- geração parcial.

---

# 16. Active Generation Safety Gate

Refresh ou import que trabalhe com gerações deve comprovar:

- geração válida existente não é destruída prematuramente;
- geração nova é processada separadamente quando necessário;
- geração parcial não é autoritativa;
- falha recuperável preserva estado válido;
- promoção ocorre somente após condição válida.

`ACTIVE_GENERATION_SAFETY=REQUIRED`

## 16.1 Bounded Non-Authoritative Staging Content Gate

`POLICY_NAME=BOUNDED_NON_AUTHORITATIVE_STAGING_CONTENT`

Durante cold bootstrap sem geração active válida/utilizável, conteúdo staging local estruturalmente renderizável pode ser lido de forma bounded, incremental, somente leitura, não autoritativa e limitada ao source/scope autorizado. A construção do catálogo completo continua em background.

Critérios obrigatórios cross-route:

`COLD_NO_ACTIVE_HOME_PARTIAL_CONTENT=REQUIRED_WHEN_RENDERABLE_BEFORE_EOF`

`COLD_NO_ACTIVE_MOVIES_PARTIAL_CONTENT=REQUIRED_WHEN_RENDERABLE_BEFORE_EOF`

`COLD_NO_ACTIVE_SERIES_PARTIAL_CONTENT=REQUIRED_WHEN_RENDERABLE_BEFORE_EOF`

`COLD_NO_ACTIVE_LIVE_PARTIAL_CONTENT=REQUIRED_WHEN_RENDERABLE_BEFORE_EOF`

`NO_RENDERABLE_CONTENT_YET=PREPARING_OR_LOADING`

`FALSE_EMPTY_DURING_PARTIAL_IMPORT=PROIBIDO`

`VALID_ACTIVE_DURING_REFRESH=ACTIVE_REMAINS_VISIBLE_AND_AUTHORITATIVE`

`STAGING_VISIBILITY_DOES_NOT_PROMOTE=REQUIRED`

`FAILED_STAGING_DOES_NOT_REPLACE_ACTIVE=REQUIRED`

`PROMOTION_REMAINS_ONLY_AUTHORITY_BOUNDARY=REQUIRED`

`EARLY_PROMOTION=PROIBIDO`

`PROMOTION_BEFORE_EOF=PROIBIDO`

`PARTIAL_USABLE_CONTENT_IS_FULL_CATALOG_READY=NAO`

`PARTIAL_CONTENT_ALLOWED_WHILE_IMPORT_STATUS_IN_PROGRESS=SIM`

`ALL_SOURCE_CATEGORIES_REQUIRED_FOR_PARTIAL_CONTENT=NAO`

`INCREMENTAL_BOUNDED_EXPANSION_BEFORE_EOF=REQUIRED_WHEN_NEW_RENDERABLE_DATA_EXISTS`

`COLLECT_CHANNELS_FALSE=PRESERVED`

Para Live, o gate exige leitura local bounded compatível com a arquitetura e proíbe exigir um array React completo crescente do catálogo. O mecanismo concreto de atualização ou leitura não é definido neste gate.

Em warm refresh com active válida, staging pode continuar sendo construído, mas não substitui active antes de promotion válida. Falha, cancelamento ou descarte de staging não invalida active.

Nenhum critério desta seção cria SLA numérico. First fold ou conteúdo parcial utilizável não equivale a `FULL_CATALOG_READY`, e o limite operacional de quinze minutos de gate físico não é SLA de produto.

`PHYSICAL_GATE_15_MINUTES_IS_SLA=NAO`

---

# 17. Continuity Gate

`CONTINUITY_STATE=CORE`

Devem ser validados nas slices correspondentes:

`MOVIE_RESUME=CORE`

`EPISODE_RESUME=CORE`

`SERIES_CONTINUITY=CORE`

`LIVE_LAST_CHANNEL=CORE`

`LIVE_PREVIEW_RESUMES_LAST_CHANNEL=CORE`

Central progress sync não é requisito para aprovação MVP.

`CENTRAL_PROGRESS_SYNC=NOT_REQUIRED_FOR_MVP`

---

# 18. Search Acceptance

VS-06 deve validar funcionalmente:

- exact;
- partial;
- internal token;
- zero result;
- indexing state;
- abertura do resultado correto;
- playback quando aplicável.

A evidência atual:

`SEARCH_QUERY=Silo`

`OBSERVED_TERMINAL_TIME≈55s`

`APPARENT_VISUAL_PAUSE≈20s`

deve continuar classificada como:

`PERFORMANCE_EVIDENCE=SIM`

`PERFORMANCE_DEBT=SIM`

`ACCEPTED_AS_TARGET=NAO`

`AUTOMATIC_SLA=NAO`

---

# 19. Performance NFR Gate

Durante Vertical Slices:

`COLD_START_SLA=NFR_UNDECIDED`

`SEARCH_SLA=NFR_UNDECIDED`

`SLOW_NETWORK_SLA=NFR_UNDECIDED`

`NFR_NUMERIC_TARGETS_MAY_REMAIN_UNDECIDED_DURING_SLICES=SIM`

Esses valores não bloqueiam automaticamente o início ou conclusão intermediária das slices enquanto não houver threshold canônico aplicável.

Para release comercial:

`COMMERCIAL_RELEASE_WITH_UNDECIDED_PERFORMANCE_NFRS=NAO`

Portanto, todos os NFRs numéricos ainda não decididos devem receber decisão explícita antes de VS-10 finalizar o release.

---

# 20. VS-01 — Ativar e abrir

Definition of Done conceitual:

- activation válida;
- device válido;
- source resolution válida;
- cold start sem false empty;
- import local seguro;
- Home utilizável;
- error/retry funcional;
- Architecture Gate PASS;
- automated PASS;
- phone PASS;
- tablet PASS;
- TV quando mudança específica exigir.

Instalação nova com Home falsamente vazia:

`VS_01_DOD=BLOCKED`

até correção e revalidação.

---

# 21. VS-02 — Descobrir conteúdo

Definition of Done conceitual:

- Home;
- Hero;
- carrosséis;
- categorias;
- cards;
- artwork fallback;
- discovery;
- loading/empty/error distintos;
- touch;
- D-pad quando aplicável;
- phone/tablet gates;
- TV gate se comportamento TV for alterado.

---

# 22. VS-03 — Assistir Live + continuidade

Definition of Done conceitual:

- grupos;
- canais;
- seleção;
- último canal;
- preview;
- player;
- aspect ratio;
- BACK;
- erro;
- continuity;
- touch;
- D-pad quando aplicável.

Alteração específica de TV, preview, player TV ou D-pad exige gate TV antes do DoD da slice.

---

# 23. VS-04 — Assistir Filme + continuidade

Definition of Done conceitual:

- navegação de Filmes;
- categorias;
- cards;
- detalhe;
- artwork fallback;
- playback;
- movie resume;
- BACK;
- phone;
- tablet;
- TV quando aplicável.

---

# 24. VS-05 — Assistir Episódio + continuidade

Definition of Done conceitual:

- Séries;
- temporadas;
- episódios;
- episódio correto;
- player;
- episode resume;
- series continuity;
- BACK ao contexto correto;
- touch;
- phone;
- tablet;
- TV quando aplicável.

Bug descoberto dentro desta slice mantém:

`VS-05=IN_PROGRESS`

Não criar micro-slice apenas para cada correção.

---

# 25. VS-06 — Buscar e reproduzir

Definition of Done conceitual:

- índice local utilizável;
- exact;
- partial;
- internal token;
- zero result verdadeiro;
- indexing distinto;
- error distinto;
- resultado correto;
- abertura;
- playback quando aplicável;
- performance evidence registrada.

`CONTENT_SEARCH=DEVICE_LOCAL`

---

# 26. VS-07 — Resiliência online

Definition of Done conceitual:

- warm start;
- refresh;
- slow network;
- network failure;
- retry;
- preservação local;
- no false empty;
- no infinite loading;
- Active Generation Safety;
- revogação;
- loading/empty/error corretos.

Não criar:

`OFFLINE_MODE`

Não transformar local-first em offline-first.

`OFFLINE_FIRST=NAO`

---

# 27. VS-08 — Multi-user / Stress Test

Obrigatório antes da comercialização.

Cobrir, conforme infraestrutura aplicável:

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

`MULTI_USER_STRESS_TEST=REQUIRED_BEFORE_COMMERCIAL_RELEASE`

Falha:

`BLOCKING_FOR_COMMERCIAL_RELEASE=SIM`

---

# 28. VS-09 — Control Plane pré-comercial

Obrigatório antes da comercialização.

Validar capacidade operacional real necessária para:

- clientes;
- usuários;
- licenças;
- dispositivos;
- authorized sources;
- binding;
- status;
- validade;
- revogação;
- instalações;
- auditoria sanitizada;
- suporte operacional.

`FULL_CONTROL_PLANE_OPERATIONAL_GATE=REQUIRED_BEFORE_COMMERCIAL_RELEASE`

---

# 29. VS-10 — Release Multi-Device

VS-10 não admite deferimento de TV.

Obrigatórios:

`AUTOMATED_REQUIRED=SIM`

`PHONE_REQUIRED=SIM`

`TABLET_REQUIRED=SIM`

`TV_REQUIRED=SIM`

`TV_DEFER_ALLOWED=NAO`

`DPAD_FINAL_PHYSICAL_GATE=REQUIRED`

Também devem estar aprovados:

- Architecture Gate;
- Security Gate;
- Multi-user Stress Gate;
- Full Control Plane Operational Gate;
- performance NFR decisions;
- regressão final;
- zero CRITICAL blocker.

---

# 30. Commercial Release Gate

`COMMERCIAL_RELEASE=PASS`

somente quando:

1. VS-01 → VS-10 concluídas;
2. Architecture Gate = PASS;
3. automated final gate = PASS;
4. Phone final gate = PASS;
5. Tablet final gate = PASS;
6. Fire Stick / Android TV final gate = PASS;
7. D-pad physical gate = PASS;
8. Multi-user Stress Gate = PASS;
9. Full Control Plane Operational Gate = PASS;
10. performance NFRs numéricos decididos;
11. nenhum CRITICAL aberto bloqueando release.

Regras absolutas:

`COMMERCIAL_RELEASE_WITHOUT_TV_GATE=PROIBIDO`

`COMMERCIAL_RELEASE_WITH_UNDECIDED_PERFORMANCE_NFRS=NAO`

---

# 31. Evidência e requisito

Passar um teste não transforma comportamento não especificado em requisito.

Falhar um teste histórico também não altera automaticamente o produto.

`EVIDENCE_IS_NOT_REQUIREMENT=SIM`

Entretanto, uma regressão física atual de requisito existente invalida aprovação anterior até revalidação.

`LATEST_REGRESSION_WINS=SIM`

---

# 32. Critério final de uma slice

Uma slice somente pode mudar de:

`IN_PROGRESS`

para:

`DONE`

quando:

- comportamento previsto foi atendido;
- Architecture Gate passou;
- gates automatizados obrigatórios passaram;
- gates físicos obrigatórios passaram;
- deferimentos permitidos estão explicitamente documentados;
- regressões bloqueadoras foram resolvidas;
- nenhum conflito canônico permanece.

`DEFINITION_OF_DONE=PASS`

---

# 33. Resumo da política multi-device

`PHONE_CONTINUOUS_GATE=REQUIRED`

`TABLET_CONTINUOUS_GATE=REQUIRED`

`TV_DEFER_ALLOWED_DURING_UNRELATED_SLICES=SIM`

`TV_FINAL_RELEASE_REQUIRED=SIM`

`DPAD_FINAL_REQUIRED=SIM`

`COMMERCIAL_RELEASE_WITHOUT_TV_GATE=PROIBIDO`
