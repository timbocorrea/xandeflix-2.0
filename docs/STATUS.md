# Xandeflix 2.0 — Status Operacional

## 1. Controle do documento

STATUS=OPERATIONAL_MEMORY

CANONICAL_SPEC=NAO

MATERIALIZED_BY_CYCLE=MVP-S0.2

Este documento registra estado operacional e provenance.

Ele não substitui:

- PRD;
- FSD;
- DESIGN;
- Architecture Contract;
- MVP Acceptance;
- Execution Contract.

Regra:

`CANONICAL_DOCUMENT_CONFLICT → STOP → MASTER_DECISION_REQUIRED`

---

# 2. Namespaces obrigatórios

O estado do projeto deve permanecer separado entre:

`REMOTE_BASELINE`

`LOCAL_VALIDATED_UNPUBLISHED`

`DRAFT_PR`

`CANONICAL_SPEC`

`PHYSICAL_EVIDENCE`

Nenhuma informação deve migrar entre namespaces por inferência.

---

# 3. REMOTE_BASELINE

`REPOSITORY=timbocorrea/xandeflix-2.0`

`REMOTE=origin`

`REMOTE_MAIN=a6815c8a8c99ada61891cb4b506baa47720f9883`

`REMOTE_MAIN_SHORT=a6815c8`

A baseline remota é a referência versionada atualmente utilizada pelo ciclo MVP-S0.2.

O fato de existir trabalho local mais recente em outros worktrees não altera automaticamente:

`REMOTE_BASELINE`

Somente integração deliberada e publicada pode alterar a baseline remota.

---

# 4. LOCAL_VALIDATED_UNPUBLISHED

Existe trabalho técnico local validado que não pertence à `origin/main`.

## U2-F3.2

`U2_F3_2=TECHNICALLY_FINALIZED_LOCAL_UNPUBLISHED`

`U2_F3_2_PUBLICATION_STATUS=UNPUBLISHED`

`U2_F3_2_REMOTE_MAIN_MEMBERSHIP=NAO`

Worktree de provenance:

`C:\Users\Alexandre-Janaina\Dropbox\xandeflix2.0-u2-f3-2-search-scope`

Branch de provenance:

`fix/u2-f3-search-scope-hydration`

Regra:

`LOCAL_PATCH_PROVENANCE=REQUIRED`

Esse estado não deve ser confundido com `REMOTE_BASELINE`.

O worktree de provenance deve permanecer preservado enquanto o patch local não tiver outro tratamento deliberado.

---

# 5. DRAFT_PR

Este namespace é reservado para mudanças existentes em Pull Request com:

`PR_STATE=OPEN`

e

`PR_DRAFT=TRUE`

quando aplicável.

No contexto canônico deste documento:

`DRAFT_PR_IS_NOT_REMOTE_BASELINE=SIM`

`DRAFT_PR_IS_NOT_CANONICAL_SPEC=SIM`

`DRAFT_PR_IS_NOT_AUTOMATIC_REQUIREMENT=SIM`

Um Draft PR pode conter evidência ou implementação candidata, mas não altera automaticamente o produto canônico.

Nenhuma PR nova é criada pelo ciclo MVP-S0.2.

`MVP_S0_2_PR_CREATED=NAO`

---

# 6. CANONICAL_SPEC

As decisões de produto, arquitetura, função, design e aceitação aprovadas para materialização pertencem ao namespace:

`CANONICAL_SPEC`

Estado atual:

`CANON_APPROVED=SIM`

`MASTER_DOCUMENT_GATE=PASS`

`CANON_CONTENT_APPROVED=SIM`

`MVP_S0_2=COMPLETE`

Documentos alvo:

1. `docs/product/XANDEFLIX_PRD.md`
2. `docs/FSD.md`
3. `docs/DESIGN.md`
4. `docs/architecture/XANDEFLIX_MVP_EXECUTION_CONTRACT.md`
5. `docs/MVP_ACCEPTANCE.md`
6. `docs/PLANO.md`
7. `docs/STATUS.md`
8. `docs/ERROS.md`

Durante a criação deste STATUS:

`CANON_FILE_TARGET_COUNT=8`

`CANON_FILES_COMMITTED=NAO`

`CANON_FILES_PUSHED=NAO`

`CANON_PR_CREATED=NAO`

`CANON_MERGED=NAO`

A aprovação conceitual do cânone não deve ser confundida com publicação Git.

---

# 7. Estado da materialização S0.2

Worktree:

`C:\Users\Alexandre-Janaina\Dropbox\xandeflix2.0-mvp-spec`

Branch:

`docs/mvp-spec-driven-canon`

Base:

`a6815c8a8c99ada61891cb4b506baa47720f9883`

Antes da criação deste STATUS, estavam materializados localmente e não versionados:

- `docs/product/XANDEFLIX_PRD.md`;
- `docs/FSD.md`;
- `docs/DESIGN.md`;
- `docs/architecture/XANDEFLIX_MVP_EXECUTION_CONTRACT.md`;
- `docs/MVP_ACCEPTANCE.md`;
- `docs/PLANO.md`.

Este próprio `STATUS.md` passa a ser o sétimo documento local após materialização bem-sucedida.

`MVP_S0_2_PUBLICATION_STATUS=LOCAL_UNPUBLISHED`

`MVP_S0_2_COMMIT_STATUS=NOT_COMMITTED`

`MVP_S0_2_PUSH_STATUS=NOT_PUSHED`

`MVP_S0_2_PR_STATUS=NOT_CREATED`

---

# 8. PHYSICAL_EVIDENCE

Evidência física é registro de validação, não especificação automática.

`PHYSICAL_EVIDENCE_IS_NOT_REQUIREMENT=SIM`

`LATEST_REGRESSION_WINS=SIM`

Existem evidências históricas de validações em:

- Android Phone;
- Android Tablet;
- Fire Stick / Android TV;
- touch;
- D-pad;
- BACK;
- Home;
- Live;
- Movies;
- Series;
- Player;
- Search.

Entretanto, essas evidências devem sempre ser interpretadas por:

- provenance;
- branch;
- HEAD;
- data;
- escopo;
- regressões posteriores.

Uma evidência histórica não prova automaticamente o estado da `origin/main`.

---

# 9. Evidência de performance

Consulta física registrada:

`SEARCH_QUERY=Silo`

`OBSERVED_TERMINAL_TIME≈55s`

`APPARENT_VISUAL_PAUSE≈20s`

Classificação:

`PERFORMANCE_EVIDENCE=SIM`

`PERFORMANCE_DEBT=SIM`

`ACCEPTED_AS_TARGET=NAO`

`AUTOMATIC_SLA=NAO`

NFRs ainda não decididos:

`COLD_START_SLA=NFR_UNDECIDED`

`SEARCH_SLA=NFR_UNDECIDED`

`SLOW_NETWORK_SLA=NFR_UNDECIDED`

---

# 10. U2F3 Aggregate Smoke

Estado operacional conhecido:

`U2F3_AGGREGATE_SMOKE_ENV_DEPENDENCY=CONFIRMED`

`ROOT_CAUSE_CONFIDENCE=HIGH`

`STATUS=OPEN_TEST_HARNESS_DEBT`

`MVP_BLOCKER=NAO_ENQUANTO_HOUVER_EVIDENCIA_AUTOMATIZADA_FOCAL_SUFICIENTE`

Essa classificação é memória operacional.

Ela não altera requisitos do PRD ou do FSD.

---

# 11. Dual Refresh Engine

Provenance conhecida:

`DUAL_REFRESH_ENGINE=CONFIRMED_ON_REMOTE_U2_F3_BRANCH_FEC15ED`

`CONFIRMED_ON_MAIN=NAO`

`ACTION_REQUIRED_NOW=NAO`

Regra:

não promover esta evidência a dívida confirmada da `main` sem evidência específica da `main`.

`EVIDENCE_IS_NOT_REQUIREMENT=SIM`

---

# 12. Arquitetura vigente

A baseline normativa permanece:

`XANDEFLIX_BACKEND=CONTROL_PLANE_ONLY`

`SOURCE_FETCH=DEVICE_DIRECT`

`CATALOG_PROCESSING=DEVICE_LOCAL`

`CATALOG_STORAGE=DEVICE_LOCAL_ONLY`

`CONTENT_SEARCH=DEVICE_LOCAL`

`PLAYER_CONNECTION=DEVICE_TO_SOURCE_DIRECT`

Não existe autorização neste STATUS para:

- central IPTV catalog;
- central playlist storage;
- central derived IPTV catalog;
- playlist proxy;
- stream proxy;
- restream;
- backend content search;
- IndexedDB sync to backend.

---

# 13. Estado do roadmap

`VS_01_STARTED=NAO`

`ACTIVE_VERTICAL_SLICE=NONE`

Estado inicial:

`VS-01=NOT_STARTED`

`VS-02=NOT_STARTED`

`VS-03=NOT_STARTED`

`VS-04=NOT_STARTED`

`VS-05=NOT_STARTED`

`VS-06=NOT_STARTED`

`VS-07=NOT_STARTED`

`VS-08=NOT_STARTED`

`VS-09=NOT_STARTED`

`VS-10=NOT_STARTED`

A materialização documental não inicia VS-01.

---

# 14. Operações Git no MVP-S0.2

Até este ponto:

`GIT_ADD_EXECUTED=NAO`

`COMMIT_EXECUTED=NAO`

`PUSH_EXECUTED=NAO`

`PR_CREATE_EXECUTED=NAO`

`READY_FOR_REVIEW_EXECUTED=NAO`

`MERGE_EXECUTED=NAO`

Autorizações:

`COMMIT_AUTHORIZED=SIM`

`PUSH_AUTHORIZED=SIM`

`PR_AUTHORIZED=SIM`

`MERGE_AUTHORIZED=NAO`

---

# 15. Worktree U2-F3.2

O worktree:

`C:\Users\Alexandre-Janaina\Dropbox\xandeflix2.0-u2-f3-2-search-scope`

é provenance de trabalho local sensível e não pertence ao escopo editorial do S0.2.

Regra operacional:

`U2_F3_2_WORKTREE_TOUCHED=NAO`

O ciclo S0.2 não deve:

- editar;
- restaurar;
- resetar;
- limpar;
- stashear;
- commitar;
- copiar arquivos;
- misturar mudanças

nesse worktree.

---

# 16. Estado documental atual

Os oito documentos autorizados pelo MVP-S0.2 foram materializados localmente.

`LOCAL_CANON_FILE_COUNT=8`

`CANON_MATERIALIZATION_COMPLETE=SIM`

`CANON_PUBLISHED=NAO`

`UNTRACKED_EXPECTED=SIM`

`STAGED_EXPECTED=NAO`

`TRACKED_MODIFIED_EXPECTED=NAO`

Os oito arquivos são:

1. `docs/product/XANDEFLIX_PRD.md`
2. `docs/FSD.md`
3. `docs/DESIGN.md`
4. `docs/architecture/XANDEFLIX_MVP_EXECUTION_CONTRACT.md`
5. `docs/MVP_ACCEPTANCE.md`
6. `docs/PLANO.md`
7. `docs/STATUS.md`
8. `docs/ERROS.md`

A materialização local completa não equivale a publicação Git.

`CANON_FILES_COMMITTED=NAO`

`CANON_FILES_PUSHED=NAO`

`CANON_PR_CREATED=NAO`

`CANON_MERGED=NAO`

## 16.1 Correções editoriais registradas durante auditoria

Durante o Cross-document Review do MVP-S0.2 foram identificadas duas inconsistências editoriais que não alteram produto nem arquitetura:

1. `docs/FSD.md` possuía todo o comportamento de Continuity State e seus componentes Core, mas não materializava explicitamente o token agregador `CONTINUITY_STATE=CORE`;
2. `docs/STATUS.md` ainda descrevia o instante operacional D7, anterior à criação de `docs/ERROS.md`.

Correções aplicadas:

`EDITORIAL_FSD_CONTINUITY_TOKEN_ADDED=SIM`

`EDITORIAL_STATUS_D7_TEMPORAL_DRIFT_REMOVED=SIM`

`EDITORIAL_FIX_PRODUCT_DECISION_CHANGED=NAO`

`EDITORIAL_FIX_ARCHITECTURE_CHANGED=NAO`

`MASTER_DECISION_REQUIRED_FOR_EDITORIAL_FIX=NAO`

As correções exigem revalidação pelo Cross-document Review antes do Gate Final.

---

# 17. Sequência de auditoria do ciclo

Após a materialização dos oito documentos, o ciclo utiliza a seguinte sequência de verificação:

1. Subciclo E — Git Scope Audit;
2. Subciclo F — Content Audit;
3. Subciclo G — Cross-document Review;
4. Subciclo H — Auditoria Final;
5. relatório ao Analista Mestre.

Esses gates não autorizam automaticamente:

- `git add`;
- commit;
- push;
- criação de PR;
- Ready for Review;
- merge.

`MVP_S0_2=COMPLETE`

`VS_01_STARTED=NAO`

`ACTIVE_VERTICAL_SLICE=NONE`

---
# 18. Regra final de status

Sempre distinguir:

`REMOTE_BASELINE != LOCAL_VALIDATED_UNPUBLISHED`

`LOCAL_VALIDATED_UNPUBLISHED != DRAFT_PR`

`DRAFT_PR != CANONICAL_SPEC`

`PHYSICAL_EVIDENCE != REQUIREMENT`

`CANON_APPROVED != GIT_PUBLISHED`

`LOCAL_MATERIALIZED != COMMITTED`

`COMMITTED != MERGED`