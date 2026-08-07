# Xandeflix 2.0 — Memória de Erros, Dívidas e Incidentes

## 1. Controle do documento

STATUS=OPERATIONAL_MEMORY

CANONICAL_SPEC=NAO

MATERIALIZED_BY_CYCLE=MVP-S0.2

Este documento registra problemas, dívidas e incidentes conhecidos sem transformar hipótese em fato.

Ele não substitui:

- `docs/product/XANDEFLIX_PRD.md`;
- `docs/FSD.md`;
- `docs/DESIGN.md`;
- `docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md`;
- `docs/architecture/XANDEFLIX_MVP_EXECUTION_CONTRACT.md`;
- `docs/MVP_ACCEPTANCE.md`.

Regra obrigatória:

`EVIDENCE_IS_NOT_REQUIREMENT=SIM`

`UNPROVEN_ROOT_CAUSE_MUST_NOT_BE_PROMOTED=SIM`

---

# 2. Formato obrigatório

Cada registro deve utilizar:

`ERROR_ID=`

`PROBLEM=`

`SYMPTOM=`

`ROOT_CAUSE=`

`ROOT_CAUSE_CONFIDENCE=`

`CORRECTION=`

`PREVENTION=`

`STATUS=`

`MVP_IMPACT=`

`PROVENANCE=`

Quando a causa não estiver comprovada:

`ROOT_CAUSE=NAO_DETERMINADA`

---

# 3. ERR-LINT-01 — NESTED_PROJECT_LINT_SCOPE

ERROR_ID=ERR-LINT-01

PROBLEM=`npm run lint` possui escopo global inadequado para a estrutura atual do repositório e alcança conteúdo do projeto aninhado `xandeflix/**`.

SYMPTOM=A execução baseada em `eslint .` inclui árvore que não deveria participar do lint do projeto raiz no mesmo escopo operacional.

ROOT_CAUSE=ESCOPO_RECURSIVO_DE_ESLINT_PONTO_INCLUI_PROJETO_ANINHADO

ROOT_CAUSE_CONFIDENCE=HIGH

CORRECTION=NAO_EXECUTADA_NESTE_CICLO_DOCUMENTAL; corrigir escopo de lint somente em slice técnica autorizada.

PREVENTION=Definir explicitamente os diretórios de lint e excluir projetos aninhados ou artefatos que não pertençam ao escopo do projeto raiz.

STATUS=CONFIRMED

MVP_IMPACT=TOOLING_DEBT_NAO_BLOQUEADOR_ENQUANTO_GATES_FOCAIS_APLICAVEIS_PASSAREM

PROVENANCE=MVP-S0.1_EVIDENCE

MVP_BLOCKER=NAO

---

# 4. ERR-LINT-02 — ROOT_PROJECT_PREEXISTING_LINT_DEBT

ERROR_ID=ERR-LINT-02

PROBLEM=O projeto raiz possui dívida de lint preexistente independente do patch local avaliado.

SYMPTOM=Execução registrada apresentou 80 problemas, sendo 68 errors e 12 warnings.

ROOT_CAUSE=NAO_DETERMINADA

ROOT_CAUSE_CONFIDENCE=UNKNOWN

CORRECTION=NAO_EXECUTADA_NESTE_CICLO_DOCUMENTAL; sanear somente em escopo técnico próprio ou quando a slice exigir.

PREVENTION=Impedir introdução de novos erros pelas slices e reduzir dívida preexistente de forma controlada sem refatoração oportunista.

STATUS=CONFIRMED

MVP_IMPACT=NAO_BLOQUEADOR_ENQUANTO_GATES_FOCAIS_DA_SLICE_PASSAREM

PROVENANCE=MVP-S0.1_EVIDENCE

PATCH_CAUSED=NAO

MVP_BLOCKER=NAO_ENQUANTO_GATES_FOCAIS_DA_SLICE_PASSAREM

EVIDENCE_TOTAL_PROBLEMS=80

EVIDENCE_ERRORS=68

EVIDENCE_WARNINGS=12

---

# 5. NESTED_XANDEFLIX_PROJECT

ERROR_ID=NESTED_XANDEFLIX_PROJECT

PROBLEM=Existe projeto/árvore `xandeflix/**` aninhado dentro de contexto alcançado por ferramentas recursivas do projeto raiz.

SYMPTOM=Ferramentas configuradas com escopo amplo podem atravessar a fronteira entre projeto raiz e projeto aninhado, produzindo resultados agregados inadequados.

ROOT_CAUSE=A_ESTRUTURA_ANINHADA_COMBINADA_COM_ESCOPO_RECURSIVO_PERMITE_CROSS_PROJECT_SCAN

ROOT_CAUSE_CONFIDENCE=HIGH

CORRECTION=NAO_EXECUTADA_NESTE_CICLO_DOCUMENTAL.

PREVENTION=Ferramentas do projeto raiz devem possuir limites explícitos de escopo; não assumir que todo descendente do diretório pertence ao mesmo projeto.

STATUS=CONFIRMED

MVP_IMPACT=TOOLING_AND_TEST_SCOPE_DEBT

PROVENANCE=MVP-S0.1_EVIDENCE_AND_ERR-LINT-01

---

# 6. SEARCH_SILO_LATENCY

ERROR_ID=SEARCH_SILO_LATENCY

PROBLEM=A busca local apresentou latência elevada em evidência física registrada para a consulta `Silo`.

SYMPTOM=`OBSERVED_TERMINAL_TIME≈55s` e `APPARENT_VISUAL_PAUSE≈20s`.

ROOT_CAUSE=NAO_DETERMINADA

ROOT_CAUSE_CONFIDENCE=UNKNOWN

CORRECTION=NAO_DETERMINADA_NESTE_CICLO_DOCUMENTAL; deve ser investigada na Vertical Slice de Search/performance aplicável.

PREVENTION=Medir separadamente readiness do índice, query execution, rendering e operações concorrentes antes de otimizar.

STATUS=OPEN_PERFORMANCE_DEBT

MVP_IMPACT=PERFORMANCE_DEBT; NAO_DEFINE_FALHA_DE_SLA_ENQUANTO_NFR_NUMERICO_ESTIVER_NAO_DECIDIDO

PROVENANCE=PHYSICAL_EVIDENCE_SEARCH_QUERY_SILO

SEARCH_QUERY=Silo

OBSERVED_TERMINAL_TIME≈55s

APPARENT_VISUAL_PAUSE≈20s

PERFORMANCE_EVIDENCE=SIM

PERFORMANCE_DEBT=SIM

ACCEPTED_AS_TARGET=NAO

AUTOMATIC_SLA=NAO

SEARCH_SLA=NFR_UNDECIDED

---

# 7. U2F3_AGGREGATE_SMOKE_ENV_DEPENDENCY

ERROR_ID=U2F3_AGGREGATE_SMOKE_ENV_DEPENDENCY

PROBLEM=O smoke agregado U2F3 possui dependência de ambiente no test harness e pode falhar sem representar regressão funcional da slice avaliada.

SYMPTOM=O smoke agregado pode não completar corretamente quando a condição externa/de ambiente esperada pelo harness não está disponível.

ROOT_CAUSE=DEPENDENCIA_DE_AMBIENTE_DO_TEST_HARNESS_AGREGADO_U2F3

ROOT_CAUSE_CONFIDENCE=HIGH

CORRECTION=AINDA_NAO_EXECUTADA; dívida de harness permanece aberta.

PREVENTION=Eliminar ou tornar explícitas e reproduzíveis as dependências de ambiente do smoke agregado.

STATUS=OPEN_TEST_HARNESS_DEBT

MVP_IMPACT=NAO_BLOQUEADOR_ENQUANTO_HOUVER_EVIDENCIA_AUTOMATIZADA_FOCAL_SUFICIENTE

PROVENANCE=MVP-S0.1_CONFIRMED_EVIDENCE

U2F3_AGGREGATE_SMOKE_ENV_DEPENDENCY=CONFIRMED

MVP_BLOCKER=NAO_ENQUANTO_HOUVER_EVIDENCIA_AUTOMATIZADA_FOCAL_SUFICIENTE

A exceção acima é específica desta provenance e não autoriza desconsiderar falhas de outros testes.

---

# 8. DUAL_REFRESH_ENGINE

ERROR_ID=DUAL_REFRESH_ENGINE

PROBLEM=Foram confirmados dois caminhos/mecanismos de refresh na provenance U2-F3 remota associada ao HEAD `fec15ed`.

SYMPTOM=Mais de um mecanismo de refresh participa da árvore técnica daquela provenance, criando possível sobreposição de responsabilidade.

ROOT_CAUSE=NAO_DETERMINADA

ROOT_CAUSE_CONFIDENCE=UNKNOWN

CORRECTION=NENHUMA_ACAO_REQUERIDA_NESTE_CICLO; não alterar arquitetura ou código apenas com base nessa evidência.

PREVENTION=Preservar provenance e confirmar o estado na baseline específica antes de classificar como dívida da `main`.

STATUS=PROVENANCE_CONFIRMED_MAIN_NOT_CONFIRMED

MVP_IMPACT=NAO_BLOQUEADOR_NESTE_MOMENTO

PROVENANCE=REMOTE_U2_F3_BRANCH_HEAD_FEC15ED

DUAL_REFRESH_ENGINE=CONFIRMED_ON_REMOTE_U2_F3_BRANCH_FEC15ED

CONFIRMED_ON_MAIN=NAO

ACTION_REQUIRED_NOW=NAO

Não promover este registro para:

`CONFIRMED_MAIN_DEBT`

sem evidência específica da `origin/main`.

---

# 9. Regras de uso desta memória

## 9.1 Causa raiz

Nunca converter:

- suspeita;
- correlação;
- nome de função;
- timing;
- log parcial;
- branch histórica;

em causa raiz comprovada.

Quando necessário:

`ROOT_CAUSE=NAO_DETERMINADA`

`ROOT_CAUSE_CONFIDENCE=UNKNOWN`

## 9.2 Baseline e provenance

Um problema confirmado em:

- patch local;
- branch remota;
- Draft PR;
- versão histórica;

não pode ser declarado problema atual da `main` sem verificação específica.

`LATEST_RELEVANT_PROVENANCE_REQUIRED=SIM`

## 9.3 Evidência física

Evidência física pode confirmar sintoma.

Não cria automaticamente:

- requirement;
- SLA;
- causa raiz;
- arquitetura;
- redesign.

`PHYSICAL_EVIDENCE_IS_NOT_REQUIREMENT=SIM`

## 9.4 Dívida e blocker

Dívida aberta não é automaticamente blocker.

O impacto deve ser avaliado por:

- requisito da slice;
- Definition of Done;
- Architecture Gate;
- Security Gate;
- testes focais;
- matriz física;
- release gate.

---

# 10. Relação com NFRs

Continuam não decididos:

`COLD_START_SLA=NFR_UNDECIDED`

`SEARCH_SLA=NFR_UNDECIDED`

`SLOW_NETWORK_SLA=NFR_UNDECIDED`

Evidência numérica histórica não decide esses valores automaticamente.

`PERFORMANCE_EVIDENCE_IS_NOT_SLA=SIM`

---

# 11. Relação com arquitetura

Nenhum registro deste arquivo autoriza:

- central IPTV catalog;
- central playlist storage;
- central derived IPTV catalog;
- playlist proxy;
- stream proxy;
- restream;
- backend content search;
- IndexedDB sync to backend.

O Architecture Contract continua tendo poder de veto.

`ARCHITECTURE_CONTRACT_VETO=SIM`

---

# 12. Estado desta memória no MVP-S0.2

`ERROR_RECORD_COUNT=6`

`UNPROVEN_ROOT_CAUSE_PROMOTED=NAO`

`MVP_S0_2_RUNTIME_FIX_EXECUTED=NAO`

`MVP_S0_2_TEST_HARNESS_FIX_EXECUTED=NAO`

`MVP_S0_2_PERFORMANCE_FIX_EXECUTED=NAO`

Este ciclo apenas materializa a memória operacional aprovada.