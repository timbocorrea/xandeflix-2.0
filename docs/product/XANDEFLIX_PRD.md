# Xandeflix 2.0 — Product Requirements Document

## 1. Controle do documento

PRD_VERSION=1.0

STATUS=APPROVED

OWNER=PROPRIETARIO_XANDEFLIX

APPROVAL_AUTHORITY=PROPRIETARIO_ANALISTA_MESTRE

BASELINE_SOURCE=a6815c8a8c99ada61891cb4b506baa47720f9883

CANON_APPROVED=SIM

MATERIALIZED_BY_CYCLE=MVP-S0.2

PRODUCT_SCOPE=ENDPOINT_APPLICATION+MINIMUM_CONTROL_PLANE

Este documento é a autoridade canônica para produto, escopo, prioridades e jornadas do Xandeflix 2.0.

Fronteiras arquiteturais permanecem sob autoridade normativa de:

`docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md`

Conflito entre documentos canônicos não deve ser resolvido silenciosamente.

`CANONICAL_DOCUMENT_CONFLICT → STOP → MASTER_DECISION_REQUIRED`

---

## 2. Resumo executivo

O Xandeflix 2.0 é um aplicativo de organização, descoberta, busca e reprodução de mídia proveniente de fontes configuradas ou autorizadas para o cliente.

O produto comercial MVP é composto por:

`ENDPOINT_APPLICATION + MINIMUM_CONTROL_PLANE`

O Xandeflix licencia o software.

O Xandeflix não fornece, revende, hospeda, retransmite ou certifica direitos sobre o conteúdo disponibilizado pela fonte utilizada pelo cliente.

A arquitetura do produto mantém separação obrigatória entre:

- Control Plane no backend Xandeflix;
- Data Plane no endpoint do cliente.

---

## 3. Problema do produto

Usuários que possuem acesso autorizado a fontes de mídia precisam utilizar grandes catálogos em diferentes dispositivos mantendo:

- ativação confiável;
- carregamento confiável;
- catálogo navegável;
- descoberta;
- busca;
- reprodução;
- continuidade;
- recuperação de falhas;
- autorização por licença e dispositivo;
- experiência consistente em celular, tablet e TV;

sem depender de catálogo IPTV central mantido pelo Xandeflix.

---

## 4. Proposta de valor

Fornecer experiência multi-device consistente e local-first, orientada ao endpoint, preservando privacidade e reduzindo dependência operacional do backend.

A proposta pode ser resumida como:

`LICENCA_DO_SOFTWARE`

`+ DISPOSITIVO_AUTORIZADO`

`+ FONTE_AUTORIZADA`

`+ CATALOGO_LOCAL`

`+ BUSCA_LOCAL`

`+ UX_MULTIPLATAFORMA`

`+ PLAYER_DIRETO`

---

## 5. Decisões de produto P1–P5

### 5.1 P1 — Escopo comercial

`PRODUCT_SCOPE=ENDPOINT_APPLICATION+MINIMUM_CONTROL_PLANE`

O produto MVP compreende o aplicativo no endpoint e um Control Plane mínimo necessário para licenciamento, autorização, dispositivos, source binding, status, revogação e suporte operacional.

O backend não participa do transporte, processamento ou armazenamento central do catálogo do cliente.

### 5.2 P2 — Local-first

`LOCAL_FIRST=SIM`

`OFFLINE_FIRST=NAO`

A persistência local é uma capacidade Core de experiência, desempenho, resiliência e warm start.

São Core:

- catálogo local persistente;
- índice local de busca;
- warm start local-first;
- estado verdadeiro quando não há rede;
- `NO_FALSE_EMPTY`;
- `NO_INFINITE_LOADING`;
- retry quando aplicável.

Não existe promessa MVP de:

- funcionamento integral offline;
- playback offline;
- catálogo offline garantido como produto;
- lease offline como feature comercial.

`FULL_OFFLINE_OPERATION=OUT_OF_SCOPE`

`OFFLINE_PLAYBACK=OUT_OF_SCOPE`

`OFFLINE_LEASE_AS_PRODUCT_FEATURE=OUT_OF_SCOPE`

### 5.3 P3 — Matriz contínua de dispositivos

`ANDROID_PHONE=PRIMARY_CONTINUOUS_DEVELOPMENT_DEVICE`

`ANDROID_TABLET=PRIMARY_CONTINUOUS_DEVELOPMENT_DEVICE`

`FIRE_STICK_ANDROID_TV=TARGET_TV_PLATFORM`

A ausência temporária do Fire Stick não bloqueia desenvolvimento não relacionado especificamente a TV quando os gates aplicáveis da slice foram aprovados.

Entretanto:

`FIRE_STICK_FINAL_GATE_BEFORE_COMMERCIAL_RELEASE=REQUIRED`

`DPAD_FINAL_PHYSICAL_GATE=REQUIRED`

### 5.4 P4 — Continuity State

`CONTINUITY_STATE=CORE`

Abrange obrigatoriamente:

`MOVIE_RESUME=CORE`

`EPISODE_RESUME=CORE`

`SERIES_CONTINUITY=CORE`

`LIVE_LAST_CHANNEL=CORE`

`LIVE_PREVIEW_RESUMES_LAST_CHANNEL=CORE`

O MVP não exige sincronização central de progresso.

`CENTRAL_PROGRESS_SYNC=NOT_REQUIRED_FOR_MVP`

### 5.5 P5 — Control Plane em dois estágios

Durante desenvolvimento, o Control Plane deve possuir operações mínimas suficientes para testes reais.

`CONTROL_PLANE_MINIMUM_TEST_OPERATIONS=CORE_SUPPORT`

Antes da comercialização são obrigatórios:

`MULTI_USER_STRESS_TEST=REQUIRED_BEFORE_COMMERCIAL_RELEASE`

`FULL_CONTROL_PLANE_OPERATIONAL_GATE=REQUIRED_BEFORE_COMMERCIAL_RELEASE`

---

## 6. Objetivos do MVP

O MVP deve entregar:

1. ativação confiável;
2. reconhecimento e autorização de dispositivo;
3. resolução segura da fonte;
4. catálogo processado localmente;
5. persistência local;
6. Home utilizável;
7. discovery;
8. Live TV;
9. Filmes;
10. Séries e episódios;
11. busca local;
12. playback direto;
13. Continuity State;
14. resiliência online;
15. revogação;
16. experiência em phone;
17. experiência em tablet;
18. compatibilidade Fire Stick/Android TV;
19. Control Plane mínimo;
20. readiness para operação comercial após todos os gates finais.

---

## 7. Não objetivos

Não fazem parte do MVP:

- catálogo IPTV central;
- armazenamento central da playlist do cliente;
- catálogo IPTV derivado central;
- playlist proxy;
- stream proxy;
- restream;
- backend content search;
- sincronização do IndexedDB ou catálogo local ao backend;
- offline playback;
- experiência offline integral;
- download permanente obrigatório de artwork;
- cloud progress sync obrigatório;
- billing;
- analytics comercial avançado;
- painel administrativo sofisticado;
- automações administrativas avançadas.

---

## 8. Atores

### 8.1 Usuário final

Pessoa que utiliza o aplicativo para:

- navegar;
- descobrir;
- buscar;
- assistir Live;
- assistir filmes;
- assistir séries e episódios;
- retomar conteúdo;
- utilizar phone, tablet ou TV.

### 8.2 Cliente/licenciado

Pessoa ou organização que possui licença do software e configura ou recebe autorização para uma fonte.

### 8.3 Dispositivo autorizado

Endpoint vinculado a licença e fonte autorizadas.

Responsabilidades do endpoint:

- validar contexto de acesso;
- receber configuração mínima autorizada;
- acessar diretamente a fonte;
- processar catálogo localmente;
- persistir catálogo e índices localmente;
- executar busca local;
- reproduzir diretamente da fonte.

### 8.4 Operador administrativo

Responsável por operações mínimas de:

- clientes;
- usuários de teste;
- licenças;
- dispositivos;
- fontes autorizadas;
- activation/binding;
- status;
- revogação;
- instalações;
- auditoria sanitizada.

### 8.5 Control Plane

Gerencia exclusivamente responsabilidades administrativas e de autorização do software.

### 8.6 Fonte/provedor

Origem externa acessada diretamente pelo endpoint autorizado.

---

## 9. Jornadas principais

### Jornada 1 — Primeira utilização

Instalar → identificar dispositivo → ativar → resolver fonte → importar localmente → construir estado utilizável → abrir Home.

### Jornada 2 — Warm start

Abrir aplicativo → reutilizar catálogo local válido → apresentar primeira UI útil → avaliar freshness → atualizar quando necessário.

### Jornada 3 — Descobrir conteúdo

Abrir Home → visualizar Hero/carrosséis/categorias → navegar → abrir conteúdo.

### Jornada 4 — Live TV

Abrir Live → listar grupos/canais → restaurar último canal válido quando aplicável → preview → player.

### Jornada 5 — Filme

Abrir Filmes → categoria → detalhe → playback → sair → retomar posição válida.

### Jornada 6 — Série e episódio

Abrir Séries → coleção → temporadas/episódios → episódio → playback → sair → retomar e retornar ao contexto correto.

### Jornada 7 — Busca

Abrir Search → informar consulta → consultar índice local → distinguir resultados/zero results/indexing/error → abrir resultado → reproduzir quando aplicável.

### Jornada 8 — Continuidade

Sair do player ou Live → persistir estado mínimo local → retornar → restaurar estado compatível.

### Jornada 9 — Falha de rede

Detectar indisponibilidade → preservar estado local válido → apresentar estado verdadeiro → retry quando aplicável.

### Jornada 10 — Revogação

Detectar autorização inválida/revogada → invalidar acesso → impedir operações protegidas → apresentar estado apropriado.

---

## 10. Escopo do produto

### 10.1 MVP CORE

- Activation;
- Source Resolution;
- local catalog;
- local search index;
- warm start local-first;
- Home;
- discovery;
- Live TV;
- Movies;
- Series;
- Episodes;
- Player;
- Continuity State;
- movie resume;
- episode resume;
- series continuity;
- Live last channel;
- Live preview resume;
- loading correto;
- empty confirmado;
- error;
- retry;
- no false empty;
- no infinite loading;
- revocation;
- touch;
- D-pad quando aplicável;
- BACK;
- orientation;
- phone;
- tablet;
- Fire Stick release gate.

### 10.2 MVP SUPPORT

- test users;
- test clients;
- test licenses;
- devices;
- authorized sources;
- activation/binding;
- status;
- revocation;
- installations;
- sanitized audit;
- operações mínimas reais de Control Plane.

### 10.3 POST-MVP

- cloud progress sync;
- billing;
- sophisticated analytics;
- advanced commercial reporting;
- administrative automations;
- advanced recommendation systems;
- extensive administrative visual polish.

### 10.4 OUT OF SCOPE

- full offline operation;
- offline playback;
- central IPTV catalog;
- central playlist storage;
- central derived IPTV catalog;
- playlist proxy;
- stream proxy;
- restream;
- central content search;
- IndexedDB sync to backend.

---

## 11. Requisitos funcionais

### REQ-001 — Activation

O usuário autorizado deve conseguir ativar um endpoint válido.

### REQ-002 — Source Resolution

O endpoint autorizado deve receber somente a configuração mínima necessária para localizar sua fonte.

### REQ-003 — Local Catalog

A fonte deve ser acessada diretamente pelo dispositivo e processada localmente.

### REQ-004 — Warm Start

O catálogo persistido localmente deve permitir warm start local-first sem transformar offline em promessa de produto.

### REQ-005 — Home e Discovery

A Home deve apresentar discovery utilizável e não pode exibir `false empty`.

### REQ-006 — Live

Live deve permitir grupos, canais, preview, reprodução e continuidade do último canal quando válido.

### REQ-007 — Movies

Filmes devem permitir navegação, detalhe, playback e retomada.

### REQ-008 — Series e Episodes

Séries devem permitir detalhe, temporadas, episódios, playback, continuidade e retorno ao contexto adequado.

### REQ-009 — Search

Busca deve operar exclusivamente sobre índice ou catálogo local e suportar:

- exact;
- partial;
- internal token;
- zero results;
- abertura do resultado correto.

### REQ-010 — Player

O Player deve conectar o endpoint diretamente à fonte.

### REQ-011 — Continuity State

Continuity State deve restaurar, quando válidos:

- filme;
- episódio;
- contexto de série;
- último canal Live;
- preview do último canal.

### REQ-012 — Online Resilience

Falhas transitórias de rede não devem apagar estado local válido nem produzir loading infinito ou false empty.

### REQ-013 — Revocation

Revogação deve impedir acesso de endpoint ou licença inválidos.

### REQ-014 — Inputs e Navigation

Touch, D-pad, BACK e orientação devem respeitar a plataforma.

### REQ-015 — Minimum Control Plane

O Control Plane mínimo deve permitir testes reais durante desenvolvimento.

### REQ-016 — Multi-user Stress

Stress multiusuário, isolamento e concorrência devem ser aprovados antes da comercialização.

### REQ-017 — Multi-device Release

Phone, tablet e Fire Stick/Android TV devem passar pela matriz de release aplicável.

---

## 12. Arquitetura normativa

As seguintes invariantes são requisitos não funcionais do produto:

`XANDEFLIX_BACKEND=CONTROL_PLANE_ONLY`

`SOURCE_FETCH=DEVICE_DIRECT`

`CATALOG_PROCESSING=DEVICE_LOCAL`

`CATALOG_STORAGE=DEVICE_LOCAL_ONLY`

`CONTENT_SEARCH=DEVICE_LOCAL`

`PLAYER_CONNECTION=DEVICE_TO_SOURCE_DIRECT`

São proibidos como arquitetura final:

`CENTRAL_IPTV_CATALOG`

`CENTRAL_PLAYLIST_STORAGE`

`CENTRAL_DERIVED_IPTV_CATALOG`

`PLAYLIST_PROXY`

`STREAM_PROXY`

`RESTREAM`

`BACKEND_CONTENT_SEARCH`

`INDEXEDDB_SYNC_TO_BACKEND`

O Architecture Contract possui poder de veto sobre implementação incompatível.

---

## 13. Dados

### 13.1 Control Plane Data

Podem existir no backend:

- usuário/cliente;
- licença do software;
- dispositivo;
- plano;
- status;
- validade;
- vínculo/autorização de fonte;
- configuração mínima necessária;
- identificadores opacos;
- auditoria sanitizada.

### 13.2 Local Endpoint Data

Permanecem no endpoint:

- catálogo derivado da fonte;
- índices locais;
- snapshots;
- metadata de importação;
- read models locais;
- Continuity State;
- estado de navegação necessário.

### 13.3 Transient Data

Podem existir somente durante runtime quando aplicável:

- referências de playback;
- candidatos de stream;
- dados transitórios de rede;
- estado efêmero de busca;
- estado de player.

### 13.4 Prohibited Central Data

Não devem formar catálogo central Xandeflix:

- playlist bruta;
- URLs individuais de stream;
- nomes derivados da lista;
- canais;
- VOD;
- séries;
- grupos;
- logos;
- EPG derivado;
- índice de busca derivado do catálogo local.

---

## 14. Segurança e privacidade

São obrigatórios:

- tratar configuração/credencial da fonte como segredo;
- minimizar exposição de configuração;
- não registrar credenciais;
- não registrar URLs sensíveis;
- logs e auditoria sanitizados;
- isolamento por licença, dispositivo e fonte;
- catálogo privado ao endpoint;
- dados locais purgeáveis;
- Continuity State sem necessidade de persistir URL bruta de stream;
- revogação efetiva.

O Xandeflix não deve utilizar relatórios, logs ou documentação como armazenamento de credenciais.

---

## 15. Resiliência

O comportamento Core deve preservar:

`NO_FALSE_EMPTY=CORE`

`NO_INFINITE_LOADING=CORE`

`RETRY_WHEN_APPLICABLE=CORE`

`LOCAL_CATALOG_PERSISTENCE=CORE`

`LOCAL_SEARCH_INDEX=CORE`

`WARM_START_LOCAL_FIRST=CORE`

`NO_NETWORK_GRACEFUL_STATE=CORE`

Falha transitória não deve destruir geração local válida.

Geração parcial não deve substituir geração válida.

Empty somente pode ser declarado quando a ausência real foi confirmada.

---

## 16. Performance e NFRs

Os seguintes valores permanecem deliberadamente não decididos:

`COLD_START_SLA=NFR_UNDECIDED`

`SEARCH_SLA=NFR_UNDECIDED`

`SLOW_NETWORK_SLA=NFR_UNDECIDED`

Regra:

`NFR_NUMERIC_TARGETS_MAY_REMAIN_UNDECIDED_DURING_SLICES=SIM`

Entretanto:

`COMMERCIAL_RELEASE_WITH_UNDECIDED_PERFORMANCE_NFRS=NAO`

Os valores numéricos devem ser decididos antes do release comercial.

### 16.1 Evidência atual de busca

Consulta observada:

`SEARCH_QUERY=Silo`

Evidência física registrada:

`OBSERVED_TERMINAL_TIME≈55s`

`APPARENT_VISUAL_PAUSE≈20s`

Classificação:

`PERFORMANCE_EVIDENCE=SIM`

`PERFORMANCE_DEBT=SIM`

`ACCEPTED_AS_TARGET=NAO`

`AUTOMATIC_SLA=NAO`

Essa evidência não cria SLA automaticamente.

---

## 17. Compatibilidade e dispositivos

Matriz alvo:

- Android Phone;
- Android Tablet Portrait;
- Android Tablet Landscape;
- Fire Stick / Android TV.

Phone e Tablet são dispositivos de desenvolvimento e validação contínuos.

Fire Stick é plataforma TV alvo e possui gate físico obrigatório antes da comercialização.

D-pad físico é obrigatório no gate final de TV.

A indisponibilidade do Fire Stick durante uma slice não relacionada especificamente a TV pode permitir avanço quando:

`AUTOMATED_PASS=SIM`

`PHONE_PASS=SIM`

`TABLET_PASS=SIM`

`NO_TV_SPECIFIC_CHANGE=SIM`

Essa exceção nunca autoriza release comercial sem TV.

---

## 18. Métricas

Devem ser coletadas sem inventar thresholds e sem enviar catálogo ou credenciais:

- sucesso de activation;
- sucesso de source resolution;
- duração de cold start;
- duração de warm start;
- conclusão de import;
- duração de refresh;
- search latency;
- playback start success;
- continuity restore success;
- revocation enforcement;
- ocorrências de false empty;
- erros e retries;
- resultados dos gates físicos por plataforma.

Métrica observada não é automaticamente SLA.

---

## 19. Roadmap canônico

A implementação do MVP será organizada exclusivamente pelas seguintes Vertical Slices:

`VS-01 — Ativar e abrir`

`VS-02 — Descobrir conteúdo`

`VS-03 — Assistir Live + continuidade`

`VS-04 — Assistir Filme + continuidade`

`VS-05 — Assistir Episódio + continuidade`

`VS-06 — Buscar e reproduzir`

`VS-07 — Resiliência online`

`VS-08 — Multi-user / Stress Test`

`VS-09 — Control Plane pré-comercial`

`VS-10 — Release Multi-Device`

Os antigos ciclos U2-F3.1A-D não devem ser recriados como roadmap do MVP.

---

## 20. Critérios de lançamento comercial

O release comercial somente pode ser declarado quando:

- VS-01 → VS-10 estiverem concluídas;
- Architecture Gate = PASS;
- gates automatizados obrigatórios = PASS;
- Phone final gate = PASS;
- Tablet final gate = PASS;
- Fire Stick/Android TV final gate = PASS;
- D-pad physical gate = PASS;
- Multi-user Stress Gate = PASS;
- Full Control Plane Operational Gate = PASS;
- NFRs numéricos de performance estiverem decididos;
- não existir CRITICAL aberto bloqueando release.

`COMMERCIAL_RELEASE_WITHOUT_TV_GATE=PROIBIDO`

`COMMERCIAL_RELEASE_WITH_UNDECIDED_PERFORMANCE_NFRS=NAO`

---

## 21. Rastreabilidade Core

| Requisito | Capacidade | FSD principal | Slice |
|---|---|---|---|
| REQ-001 | Activation | FSD-01 | VS-01 |
| REQ-002 | Source Resolution | FSD-02 | VS-01 |
| REQ-003 | Local Catalog | FSD-03 / FSD-06 / FSD-07 | VS-01 / VS-07 |
| REQ-004 | Warm Start | FSD-04 | VS-07 |
| REQ-005 | Home / Discovery | FSD-08 | VS-01 / VS-02 |
| REQ-006 | Live | FSD-09 | VS-03 |
| REQ-007 | Movies | FSD-10 | VS-04 |
| REQ-008 | Series / Episodes | FSD-11 / FSD-12 | VS-05 |
| REQ-009 | Search | FSD-13 | VS-06 |
| REQ-010 | Direct Player | FSD-14 | VS-03 / VS-04 / VS-05 / VS-06 |
| REQ-011 | Continuity State | FSD-09 / FSD-10 / FSD-12 / FSD-15 | VS-03 / VS-04 / VS-05 |
| REQ-012 | Resilience | FSD-04 / FSD-05 / FSD-07 / FSD-17 | VS-07 |
| REQ-013 | Revocation | FSD-01 / FSD-16 | VS-01 / VS-07 / VS-08 |
| REQ-014 | Inputs / Navigation | FSD-18 / FSD-19 / FSD-20 / FSD-21 | VS-02–VS-07 / VS-10 |
| REQ-015 | Minimum Control Plane | Control Plane flows | VS-01 / VS-09 |
| REQ-016 | Multi-user Stress | Acceptance Stress Gate | VS-08 |
| REQ-017 | Multi-device Release | Acceptance Matrix | VS-10 |

---

## 22. Autoridade e resolução de conflitos

Autoridade por domínio:

- Proprietário / Analista Mestre → decisões explícitas e exceções;
- `XANDEFLIX_PRD.md` → produto, escopo, prioridades e jornadas;
- `XANDEFLIX_ARCHITECTURE_CONTRACT.md` → fronteiras arquiteturais;
- `FSD.md` → comportamento funcional detalhado;
- `DESIGN.md` → apresentação e interação;
- `MVP_ACCEPTANCE.md` → gates e release;
- `XANDEFLIX_MVP_EXECUTION_CONTRACT.md` → execução por IA/agentes;
- `PLANO.md`, `STATUS.md` e `ERROS.md` → memória operacional não canônica.

Regra final:

`CANONICAL_DOCUMENT_CONFLICT → STOP → MASTER_DECISION_REQUIRED`

`ARCHITECTURE_CONTRACT_VETO=SIM`

Nenhuma evidência de código, PR, issue, branch, teste ou execução física altera automaticamente este PRD.