# Xandeflix 2.0 — MVP Execution Contract

## 1. Controle do documento

STATUS=APPROVED

CANON_APPROVED=SIM

MATERIALIZED_BY_CYCLE=MVP-S0.2

CONTRACT_SCOPE=AI_AGENTS_AND_TECHNICAL_EXECUTORS

Este documento governa a execução técnica do MVP Xandeflix 2.0 por pessoas, agentes de IA e ferramentas de codificação.

Ele não substitui:

- `docs/product/XANDEFLIX_PRD.md`;
- `docs/FSD.md`;
- `docs/DESIGN.md`;
- `docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md`;
- `docs/MVP_ACCEPTANCE.md`.

Autoridade por domínio:

- Proprietário / Analista Mestre → decisões explícitas e exceções;
- PRD → produto, escopo, prioridades e jornadas;
- Architecture Contract → fronteiras normativas;
- FSD → comportamento funcional detalhado;
- DESIGN → apresentação e interação;
- MVP Acceptance → gates e release;
- este Execution Contract → método de execução;
- PLANO, STATUS e ERROS → memória operacional não canônica.

Regra absoluta:

`CANONICAL_DOCUMENT_CONFLICT → STOP → MASTER_DECISION_REQUIRED`

`ARCHITECTURE_CONTRACT_VETO=SIM`

---

# XC-01 — SPEC_BEFORE_CODE

Nenhuma alteração funcional deve começar sem especificação aplicável.

Antes de alterar código, o executor deve identificar:

- requisito do PRD;
- fluxo FSD;
- Vertical Slice;
- critérios de aceitação;
- Architecture Contract aplicável.

Código existente não substitui especificação.

`SPEC_BEFORE_CODE=REQUIRED`

---

# XC-02 — ONE_SOURCE_OF_TRUTH

Cada domínio possui uma autoridade canônica definida.

Não criar documento concorrente ou instrução paralela que altere silenciosamente:

- produto;
- arquitetura;
- comportamento;
- design;
- gates.

Quando duas fontes canônicas conflitarem:

`STOP`

`MASTER_DECISION_REQUIRED=SIM`

---

# XC-03 — FSD_SELF_CONTAINED

Cada fluxo do `docs/FSD.md` deve ser executável sem depender de outro documento para descobrir seu comportamento básico.

Cada fluxo precisa conter:

- TRIGGER;
- PRECONDITIONS;
- MAIN_FLOW;
- ALTERNATIVE_FLOW;
- ERROR_FLOW;
- TERMINAL_STATES;
- DATA_READ;
- DATA_WRITE;
- NETWORK;
- SECURITY;
- OBSERVABILITY;
- ACCEPTANCE_CRITERIA;
- TRACEABILITY.

`FSD_SELF_CONTAINED=SIM`

REQ-ID serve para rastreabilidade, não como substituto do comportamento.

---

# XC-04 — ARCHITECTURE_VETO

`docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md` possui poder de veto.

Toda execução deve preservar:

`XANDEFLIX_BACKEND=CONTROL_PLANE_ONLY`

`SOURCE_FETCH=DEVICE_DIRECT`

`CATALOG_PROCESSING=DEVICE_LOCAL`

`CATALOG_STORAGE=DEVICE_LOCAL_ONLY`

`CONTENT_SEARCH=DEVICE_LOCAL`

`PLAYER_CONNECTION=DEVICE_TO_SOURCE_DIRECT`

Se uma proposta exigir violação:

`ARCHITECTURE_STOP=SIM`

`MASTER_DECISION_REQUIRED=SIM`

Não implementar silenciosamente.

---

# XC-05 — VERTICAL_SLICE

O desenvolvimento do MVP deve ocorrer pelas Vertical Slices:

- VS-01 — Ativar e abrir;
- VS-02 — Descobrir conteúdo;
- VS-03 — Assistir Live + continuidade;
- VS-04 — Assistir Filme + continuidade;
- VS-05 — Assistir Episódio + continuidade;
- VS-06 — Buscar e reproduzir;
- VS-07 — Resiliência online;
- VS-08 — Multi-user / Stress Test;
- VS-09 — Control Plane pré-comercial;
- VS-10 — Release Multi-Device.

Não recriar os antigos U2-F3.1A-D como roadmap canônico.

---

# XC-06 — PATCH_MINIMO

Cada alteração deve tocar somente o necessário para satisfazer o Definition of Done da slice ativa.

Evitar:

- arquivos não relacionados;
- cleanup oportunista;
- renomeações não necessárias;
- formatação em massa;
- mudanças cosméticas fora do escopo;
- alterações de dependência sem necessidade comprovada.

`PATCH_MINIMO=REQUIRED`

---

# XC-07 — NO_UNPLANNED_REFACTOR

Refatoração não prevista pela slice é proibida.

Se uma refatoração maior for necessária para cumprir corretamente o comportamento:

1. registrar necessidade;
2. justificar impacto;
3. manter a slice aberta;
4. obter autorização quando o escopo ultrapassar o definido.

`NO_UNPLANNED_REFACTOR=SIM`

---

# XC-08 — AUTOMATED_FIRST

Gates automatizados devem ser executados antes dos gates físicos, salvo impossibilidade técnica documentada.

Ordem conceitual:

`IMPLEMENT`

→ `AUTOMATED_GATE`

→ `PHYSICAL_GATE_WHEN_REQUIRED`

→ `FINAL_HANDOFF`

Falha automatizada aplicável deve ser tratada antes de usar teste físico como substituto.

---

# XC-09 — PHYSICAL_BY_MATRIX

Gate físico é determinado pela matriz de aceitação da slice.

Não exigir Fire Stick por hábito quando:

- não houve mudança específica de TV;
- a matriz permite defer;
- Automated, Phone e Tablet aplicáveis passaram.

Entretanto:

`FIRE_STICK_FINAL_GATE_BEFORE_COMMERCIAL_RELEASE=REQUIRED`

`DPAD_FINAL_PHYSICAL_GATE=REQUIRED`

---

# XC-10 — NO_CHAT_AS_TRUTH

Chats, prompts, mensagens de execução e memória conversacional não são fonte canônica do produto.

Decisões aprovadas devem ser materializadas nos documentos adequados antes de orientarem implementação permanente.

`NO_CHAT_AS_TRUTH=SIM`

Relatórios operacionais podem registrar evidência, mas não substituir especificação.

---

# XC-11 — ERROR_MEMORY

Problemas relevantes para trabalho futuro devem ser registrados em:

`docs/ERROS.md`

O registro deve distinguir fato de hipótese.

Campos obrigatórios:

`ERROR_ID`

`PROBLEM`

`SYMPTOM`

`ROOT_CAUSE`

`ROOT_CAUSE_CONFIDENCE`

`CORRECTION`

`PREVENTION`

`STATUS`

`MVP_IMPACT`

`PROVENANCE`

Nunca inventar causa raiz.

---

# XC-12 — STATUS_MEMORY

Estado operacional deve ser registrado em:

`docs/STATUS.md`

Devem permanecer distintos:

`REMOTE_BASELINE`

`LOCAL_VALIDATED_UNPUBLISHED`

`DRAFT_PR`

`CANONICAL_SPEC`

`PHYSICAL_EVIDENCE`

Um patch local não publicado nunca pode ser tratado como parte da `main`.

---

# XC-13 — NO_SECRET_CONTEXT

Não registrar em:

- chats;
- documentação;
- logs;
- relatórios;
- testes;
- fixtures versionadas;

segredos reais como:

- credenciais de source;
- URL sensível;
- stream URL real;
- licença real;
- token;
- password;
- chave privada.

`NO_SECRET_CONTEXT=REQUIRED`

Logs e exemplos devem ser sanitizados.

---

# XC-14 — NO_AUTOMATIC_COMMIT

Nenhuma execução técnica autoriza automaticamente:

- `git add`;
- commit;
- push;
- criação de Pull Request;
- Ready for Review;
- merge.

Essas operações exigem autorização explícita aplicável ao ciclo.

`NO_AUTOMATIC_COMMIT=SIM`

Um agente não deve inferir autorização a partir de conclusão técnica.

---

# XC-15 — STOP_ON_CONFLICT

A execução deve parar quando existir:

- conflito canônico;
- conflito arquitetural;
- escopo Git inesperado;
- segredo exposto;
- baseline incorreta;
- worktree incorreto;
- decisão de produto necessária.

Resultado:

`STOP`

`MASTER_DECISION_REQUIRED=SIM`

Não resolver decisões de produto silenciosamente.

---

# XC-16 — DEFINITION_OF_DONE

Uma Vertical Slice somente pode ser concluída quando todos os gates obrigatórios daquela slice forem aprovados.

Definition of Done conceitual exige:

- comportamento especificado implementado;
- escopo correto;
- Architecture Gate aprovado;
- testes automatizados aplicáveis aprovados;
- gates físicos obrigatórios aprovados ou defer permitido pela matriz;
- regressões bloqueadoras resolvidas;
- STATUS atualizado;
- ERROS atualizado quando necessário;
- evidência final suficiente.

`DEFINITION_OF_DONE=PASS`

é condição para encerrar a slice.

---

# XC-17 — DATA_PLANE_LOCAL

Todo Data Plane de conteúdo permanece no endpoint.

Obrigatório:

`SOURCE_FETCH=DEVICE_DIRECT`

`CATALOG_PROCESSING=DEVICE_LOCAL`

`CATALOG_STORAGE=DEVICE_LOCAL_ONLY`

`CONTENT_SEARCH=DEVICE_LOCAL`

`PLAYER_CONNECTION=DEVICE_TO_SOURCE_DIRECT`

Não criar:

- catálogo IPTV central;
- proxy de playlist;
- proxy de stream;
- restream;
- central content search;
- sincronização do catálogo local ao backend.

---

# XC-18 — EVIDENCE_IS_NOT_REQUIREMENT

São evidências, não requisitos automáticos:

- código existente;
- comportamento atual;
- PR;
- issue;
- branch;
- teste;
- smoke;
- gate físico;
- nome de branch;
- relatório histórico;
- implementação legada.

`EVIDENCE_IS_NOT_REQUIREMENT=SIM`

Uma evidência pode justificar investigação ou demonstrar regressão, mas não altera o produto automaticamente.

---

# XC-19 — LOCAL_PATCH_PROVENANCE

Patch local validado e não publicado deve permanecer explicitamente identificado.

Registrar:

- worktree;
- branch;
- HEAD/base;
- status de publicação;
- evidências;
- relação com a baseline remota.

Nunca misturar patch local unpublished com:

`REMOTE_BASELINE`

até integração deliberada.

`LOCAL_PATCH_PROVENANCE=REQUIRED`

---

# XC-20 — LATEST_REGRESSION_WINS

A evidência física mais recente de regressão invalida aprovação física anterior da mesma capacidade até revalidação.

Exemplo conceitual:

`OLDER_PHYSICAL_PASS`

+

`NEWER_REPRODUCED_REGRESSION`

→

`CURRENT_PHYSICAL_STATUS=NOT_PASS`

Isso não altera requisitos; altera o estado de validação.

`LATEST_REGRESSION_WINS=SIM`

---

# XC-21 — PERFORMANCE_EVIDENCE_IS_NOT_SLA

Números observados não criam NFR automaticamente.

Isso inclui:

- tempo medido;
- nome de branch;
- meta histórica;
- comentário;
- benchmark isolado.

Atualmente:

`COLD_START_SLA=NFR_UNDECIDED`

`SEARCH_SLA=NFR_UNDECIDED`

`SLOW_NETWORK_SLA=NFR_UNDECIDED`

Evidência:

`SEARCH_QUERY=Silo`

`OBSERVED_TERMINAL_TIME≈55s`

`APPARENT_VISUAL_PAUSE≈20s`

Classificação:

`PERFORMANCE_EVIDENCE=SIM`

`PERFORMANCE_DEBT=SIM`

`ACCEPTED_AS_TARGET=NAO`

`AUTOMATIC_SLA=NAO`

Regra adicional:

`NFR_NUMERIC_TARGETS_MAY_REMAIN_UNDECIDED_DURING_SLICES=SIM`

`COMMERCIAL_RELEASE_WITH_UNDECIDED_PERFORMANCE_NFRS=NAO`

---

# XC-22 — LEGACY_IS_FROZEN_DEBT

Legado arquitetural ainda existente pode permanecer durante migração somente como dívida congelada.

Não:

- ampliar;
- criar novas dependências;
- utilizar como arquitetura final;
- transformar em novo fallback;
- declarar como requisito por existir no código.

Elementos relacionados a catálogo central, importação server-side ou proxies permanecem subordinados ao Architecture Contract.

`LEGACY_ALLOWED_BUT_FROZEN=SIM`

---

# XC-23 — NO_FALSE_EMPTY

Nenhuma superfície pode declarar conteúdo vazio enquanto a causa real puder ser:

- loading;
- indexing;
- import em andamento;
- geração parcial;
- timeout;
- erro;
- source ainda não processada.

`NO_FALSE_EMPTY=SIM`

Empty exige ausência verdadeira confirmada.

Essa regra aplica-se a:

- Home;
- Search;
- categorias;
- Live;
- Filmes;
- Séries;
- outras superfícies derivadas do catálogo.

---

# XC-24 — ACTIVE_GENERATION_SAFETY

Geração de catálogo em construção não pode substituir estado autoritativo antes de atingir condição válida de promoção.

Obrigatório:

1. manter geração válida ativa;
2. construir nova geração separadamente quando necessário;
3. validar;
4. promover somente geração utilizável;
5. preservar geração anterior em falha recuperável.

`ACTIVE_GENERATION_SAFETY=SIM`

Geração parcial nunca deve produzir false empty autoritativo.

---

# 25. Regra de execução de uma Vertical Slice

Fluxo operacional padrão:

`PREFLIGHT`

→ `SPEC_CONFIRMATION`

→ `ARCHITECTURE_CHECK`

→ `IMPLEMENT`

→ `AUTOMATED_GATE`

→ `PHYSICAL_GATE_WHEN_REQUIRED`

→ `CROSS_CHECK`

→ `FINAL_HANDOFF`

Durante correções internas:

`SLICE_STATUS=IN_PROGRESS`

Bugs descobertos dentro da mesma slice permanecem na mesma slice.

Não criar automaticamente:

`VS-05A`

`VS-05B`

`VS-05C`

para cada correção.

---

# 26. Preflight mínimo

Antes de editar:

1. confirmar repositório;
2. confirmar worktree;
3. confirmar branch;
4. confirmar HEAD;
5. confirmar status Git;
6. confirmar baseline;
7. ler `AGENTS.md`;
8. ler Architecture Contract;
9. identificar PRD/FSD/slice;
10. confirmar escopo permitido;
11. confirmar operações Git autorizadas;
12. verificar provenance de patches locais.

Se qualquer identidade estiver ambígua:

`STOP`

---

# 27. Gate arquitetural mínimo

Toda alteração relevante deve ser capaz de declarar:

`ARCHITECTURE_CONTRACT_READ=SIM`

`BACKEND_CONTROL_PLANE_ONLY=SIM`

`CENTRAL_IPTV_CATALOG=NAO`

`CENTRAL_PLAYLIST_PROXY=NAO`

`CENTRAL_STREAM_PROXY=NAO`

`DEVICE_DIRECT_SOURCE_FETCH=SIM`

`DEVICE_LOCAL_PROCESSING=SIM`

`DEVICE_LOCAL_SEARCH=SIM`

`DEVICE_DIRECT_PLAYBACK=SIM`

`LOCAL_CATALOG_SYNC_TO_BACKEND=NAO`

`LEGACY_CENTRAL_DEPENDENCY_ADDED=NAO`

Qualquer violação bloqueia execução até decisão do Analista Mestre.

---

# 28. Segurança operacional

Executores não devem:

- copiar segredo para documentação;
- inserir credencial em comando versionável;
- registrar stream URL real;
- usar licença real em exemplo persistente;
- publicar log bruto contendo segredo.

Quando dados sensíveis aparecerem incidentalmente:

1. interromper propagação;
2. sanitizar evidência;
3. avaliar exposição;
4. registrar incidente conforme necessidade.

---

# 29. Regras Git

Sem autorização explícita, assumir:

`GIT_ADD_AUTHORIZED=NAO`

`COMMIT_AUTHORIZED=NAO`

`PUSH_AUTHORIZED=NAO`

`PR_AUTHORIZED=NAO`

`READY_FOR_REVIEW_AUTHORIZED=NAO`

`MERGE_AUTHORIZED=NAO`

Operação local de leitura e edição autorizada pela slice não implica autorização de publicação.

---

# 30. Memória operacional

`PLANO.md`

deve responder:

- qual slice está prevista;
- dependências;
- ordem;
- Definition of Done conceitual.

`STATUS.md`

deve responder:

- o que está na remote baseline;
- o que existe apenas localmente;
- o que está em Draft PR;
- qual spec está canônica;
- quais evidências físicas existem.

`ERROS.md`

deve responder:

- quais problemas são conhecidos;
- qual evidência existe;
- qual confidence da causa;
- qual impacto no MVP.

Esses três documentos são:

`NON_CANONICAL_OPERATIONAL_MEMORY`

Não podem sobrescrever PRD, FSD, DESIGN ou Architecture Contract.

---

# 31. Definition of Done do executor

O executor somente pode declarar trabalho tecnicamente finalizado quando:

- identidade Git foi comprovada;
- escopo autorizado foi preservado;
- requisito/FSD foram satisfeitos;
- Architecture Gate passou;
- testes aplicáveis passaram;
- gates físicos exigidos passaram ou defer foi permitido;
- não existe conflito canônico;
- nenhum segredo foi introduzido;
- STATUS e ERROS foram considerados;
- nenhuma operação Git proibida foi executada;
- relatório final distingue fatos, evidências e pendências.

Conclusão técnica não equivale automaticamente a autorização de publicação.

---

# 32. Regra final

Os 24 controles deste documento são obrigatórios:

`XC_01_TO_XC_24_PRESENT=SIM`

Nenhuma conveniência técnica autoriza enfraquecê-los.

Em dúvida material:

`STOP_ON_CONFLICT=SIM`

`MASTER_DECISION_REQUIRED=SIM`