# Xandeflix 2.0 — Functional Specification Document

## 1. Controle do documento

STATUS=APPROVED

CANON_APPROVED=SIM

MATERIALIZED_BY_CYCLE=MVP-S0.2

FSD_SELF_CONTAINED=SIM

FLOW_COUNT=21

Este documento é a autoridade canônica para o comportamento funcional detalhado do Xandeflix 2.0.

O executor deve ser capaz de compreender e implementar cada fluxo lendo a respectiva seção deste FSD sem depender de um REQ-ID para descobrir seu comportamento.

`REQ_ID=TRACEABILITY_ONLY`

Fronteiras arquiteturais continuam submetidas a:

`docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md`

Conflito entre este FSD, o PRD ou o Architecture Contract exige:

`CANONICAL_DOCUMENT_CONFLICT → STOP → MASTER_DECISION_REQUIRED`

---

# FSD-01 — Activation

**TRIGGER:** primeira execução ou endpoint sem autorização válida.

**PRECONDITIONS:** aplicativo instalado e possibilidade de comunicação com o Control Plane.

**MAIN_FLOW:**
1. identificar instalação e dispositivo;
2. validar ou iniciar vínculo;
3. obter autorização;
4. estabelecer contexto de licença, device e source;
5. permitir entrada no produto quando a autorização for válida.

**ALTERNATIVE_FLOW:** endpoint previamente vinculado reutiliza identidade válida quando permitido pela política de autorização.

**ERROR_FLOW:** licença inválida, expirada, revogada ou vínculo negado produz estado explícito de acesso indisponível. Falha recuperável de comunicação produz retry, não autorização falsa.

**TERMINAL_STATES:** `AUTHORIZED`, `ACTION_REQUIRED`, `DENIED`, `RETRYABLE_ERROR`.

**DATA_READ:** identidade local do endpoint e registros mínimos do Control Plane.

**DATA_WRITE:** identidade e autorização mínimas necessárias; nenhum dado de catálogo IPTV.

**NETWORK:** endpoint ↔ Control Plane.

**SECURITY:** credencial, source secret, token ou URL sensível não podem aparecer em log.

**OBSERVABILITY:** resultado sanitizado e código de estágio.

**ACCEPTANCE_CRITERIA:**
- endpoint válido entra no produto;
- endpoint inválido não acessa catálogo nem player;
- nenhuma lista IPTV é transportada pelo backend;
- revogação válida impede continuidade de acesso protegido.

**TRACEABILITY:** REQ-001, REQ-013, VS-01.

---

# FSD-02 — Source Resolution

**TRIGGER:** activation concluída ou necessidade de resolver a fonte ativa.

**PRECONDITIONS:** licença e dispositivo autorizados.

**MAIN_FLOW:**
1. solicitar ao Control Plane somente configuração mínima autorizada;
2. receber a configuração;
3. associar localmente o contexto à source autorizada;
4. disponibilizar a source para acesso direto pelo endpoint.

**ALTERNATIVE_FLOW:** fonte válida previamente resolvida pode reutilizar configuração segura local quando a política vigente permitir.

**ERROR_FLOW:** source ausente, inválida ou negada produz estado explícito de configuração ou erro recuperável.

**TERMINAL_STATES:** `SOURCE_READY`, `SOURCE_ACTION_REQUIRED`, `SOURCE_ERROR`.

**DATA_READ:** autorização e configuração mínima.

**DATA_WRITE:** binding local seguro.

**NETWORK:** Control Plane somente para autorização/configuração; acesso ao provider permanece direto pelo endpoint.

**SECURITY:** segredo minimizado e logs sanitizados.

**OBSERVABILITY:** source identificada somente por identificador seguro ou opaco quando possível.

**ACCEPTANCE_CRITERIA:**
- backend não baixa playlist;
- backend não processa catálogo;
- endpoint recebe somente o necessário para acessar diretamente a fonte.

**TRACEABILITY:** REQ-002, REQ-003, VS-01.

---

# FSD-03 — Cold Start

**TRIGGER:** abertura sem catálogo local utilizável para a source atual.

**PRECONDITIONS:** activation e source resolution válidas.

**MAIN_FLOW:**
1. verificar catálogo local;
2. confirmar ausência de geração local utilizável;
3. iniciar import direto da source;
4. processar e persistir localmente;
5. publicar somente geração válida;
6. construir estado necessário para Home;
7. liberar Home utilizável.

**ALTERNATIVE_FLOW:** processamento adicional pode continuar em background após existir dataset mínimo realmente utilizável, desde que não produza false empty nem exponha geração parcial como estado autoritativo.

**ERROR_FLOW:** falha de rede ou source mantém estado de erro/retry e não grava vazio transitório como catálogo autoritativo.

**TERMINAL_STATES:** `HOME_READY`, `RETRYABLE`, `SOURCE_EMPTY_CONFIRMED`, `ACCESS_DENIED`.

**DATA_READ:** metadata local de catálogo e source binding.

**DATA_WRITE:** catálogo, índices, snapshots e metadata de importação somente no endpoint.

**NETWORK:** endpoint → provider diretamente.

**SECURITY:** conteúdo da source não é enviado ao Control Plane.

**OBSERVABILITY:** tempos e resultado sanitizados sem payload, credencial ou URL sensível.

**ACCEPTANCE_CRITERIA:**
- nova instalação não termina em Home falsamente vazia por corrida de bootstrap;
- geração parcial não se torna autoritativa;
- falha recuperável oferece retry;
- Control Plane permanece fora do Data Plane.

**TRACEABILITY:** REQ-003, REQ-005, REQ-012, VS-01.

---

# FSD-04 — Warm Start

**TRIGGER:** abertura com catálogo local válido.

**PRECONDITIONS:** identidade de source, licença e dispositivo compatíveis com o estado local persistido.

**MAIN_FLOW:**
1. ler catálogo e read models locais;
2. disponibilizar primeira UI útil a partir do estado local;
3. avaliar freshness;
4. disparar refresh quando necessário;
5. promover nova geração somente após validação.

**ALTERNATIVE_FLOW:** estado stale conhecido pode continuar visível enquanto refresh seguro ocorre.

**ERROR_FLOW:** falha de refresh preserva a geração válida existente e disponibiliza retry quando aplicável.

**TERMINAL_STATES:** `LOCAL_READY`, `LOCAL_READY_REFRESHING`, `RETRYABLE`.

**DATA_READ:** catálogo, índice, snapshot e metadata local.

**DATA_WRITE:** somente geração nova validada e estados locais necessários.

**NETWORK:** opcional após a primeira leitura local; quando houver refresh, endpoint acessa diretamente a fonte.

**SECURITY:** source scope obrigatório e nenhum catálogo sincronizado ao backend.

**OBSERVABILITY:** warm-start timing e status de refresh sanitizados.

**ACCEPTANCE_CRITERIA:**
- UI útil pode surgir a partir do estado local válido;
- falha transitória não apaga catálogo válido;
- warm start não produz false empty;
- ausência de rede não transforma o produto em offline-first.

**TRACEABILITY:** REQ-004, REQ-012, VS-07.

---

# FSD-05 — Network Failure

**TRIGGER:** indisponibilidade, timeout ou conectividade insuficiente durante operação dependente de rede.

**PRECONDITIONS:** qualquer fluxo online ativo.

**MAIN_FLOW:**
1. identificar falha;
2. preservar estado local válido;
3. apresentar estado verdadeiro de degradação;
4. manter navegável o que já possui dados locais válidos;
5. oferecer retry quando recuperável.

**ALTERNATIVE_FLOW:** superfícies com dados locais continuam utilizáveis dentro das capacidades que não dependem da rede naquele momento.

**ERROR_FLOW:** operações realmente dependentes de rede não fingem sucesso.

**TERMINAL_STATES:** `DEGRADED`, `RETRY_AVAILABLE`, `NETWORK_REQUIRED`.

**DATA_READ:** último estado local válido.

**DATA_WRITE:** não destruir nem substituir estado válido por vazio transitório.

**NETWORK:** indisponível ou intermitente.

**SECURITY:** falha de rede nunca autoriza fallback para backend como Data Plane.

**OBSERVABILITY:** estágio e tipo de falha sanitizados.

**ACCEPTANCE_CRITERIA:**
- sem infinite loading;
- sem false empty;
- sem perda indevida de catálogo válido;
- retry disponível quando aplicável;
- full offline operation não é criada como feature.

**TRACEABILITY:** REQ-012, VS-07.

---

# FSD-06 — Catalog Import

**TRIGGER:** cold data, nova source ou import explicitamente necessário.

**PRECONDITIONS:** source autorizada e resolvida.

**MAIN_FLOW:**
1. endpoint acessa provider diretamente;
2. recebe dados da source;
3. realiza parse local;
4. normaliza;
5. classifica;
6. cria índices e read models aplicáveis;
7. publica geração local válida.

**ALTERNATIVE_FLOW:** processamento incremental ou bounded é permitido quando preserva consistência e segurança da geração ativa.

**ERROR_FLOW:** geração incompleta ou falha não substitui geração válida existente.

**TERMINAL_STATES:** `IMPORT_COMPLETE`, `IMPORT_RETRYABLE`, `EMPTY_CONFIRMED`.

**DATA_READ:** source direta.

**DATA_WRITE:** catálogo, índices e metadata somente no endpoint.

**NETWORK:** endpoint → provider direto.

**SECURITY:** nenhuma sincronização de catálogo para backend.

**OBSERVABILITY:** contagens agregadas, estágios e tempos sanitizados.

**ACCEPTANCE_CRITERIA:**
- Control Plane não processa catálogo;
- catálogo não é persistido centralmente;
- geração incompleta não é promovida;
- empty somente após ausência verdadeira confirmada.

**TRACEABILITY:** REQ-003, REQ-012, VS-01, VS-07.

---

# FSD-07 — Catalog Refresh

**TRIGGER:** policy de freshness, ação do usuário ou mudança de source.

**PRECONDITIONS:** contexto autorizado e source resolvida.

**MAIN_FLOW:**
1. manter geração ativa disponível;
2. buscar atualização diretamente da source;
3. processar atualização em geração separada;
4. validar;
5. promover atomicamente quando válida.

**ALTERNATIVE_FLOW:** quando não houver mudança relevante, manter geração atual.

**ERROR_FLOW:** refresh falho não invalida automaticamente geração anterior válida.

**TERMINAL_STATES:** `UNCHANGED`, `REFRESHED`, `REFRESH_FAILED_PRESERVED`.

**DATA_READ:** geração local ativa e source direta.

**DATA_WRITE:** nova geração local somente após condição válida de promoção.

**NETWORK:** endpoint → provider direto.

**SECURITY:** scoping por source, licença e dispositivo.

**OBSERVABILITY:** geração, resultado e duração sanitizados.

**ACCEPTANCE_CRITERIA:**
- UI nunca trata geração parcial como catálogo definitivo;
- refresh falho preserva geração válida;
- backend não participa do refresh de catálogo.

**TRACEABILITY:** REQ-003, REQ-012, VS-07.

---

# FSD-08 — Home

**TRIGGER:** entrada na Home.

**PRECONDITIONS:** catálogo local utilizável ou estado de carregamento verdadeiro.

**MAIN_FLOW:**
1. consultar read models locais;
2. construir Hero;
3. construir carrosséis e categorias;
4. apresentar conteúdo de discovery;
5. manter interação disponível conforme device class.

**ALTERNATIVE_FLOW:** artwork ausente utiliza fallback visual ou textual apropriado sem invalidar o item.

**ERROR_FLOW:** loading, empty confirmado e error são estados distintos.

**TERMINAL_STATES:** `HOME_CONTENT`, `HOME_EMPTY_CONFIRMED`, `HOME_ERROR`.

**DATA_READ:** catálogo, snapshots, metadata e read models locais.

**DATA_WRITE:** somente estado efêmero ou continuity quando aplicável.

**NETWORK:** metadata ou artwork remoto pode ocorrer sem transformar backend em catálogo nem bloquear indevidamente a Home.

**SECURITY:** catálogo não é enviado ao backend.

**OBSERVABILITY:** readiness, fallback e estados sanitizados sem títulos ou URLs sensíveis em log quando não necessários.

**ACCEPTANCE_CRITERIA:**
- Home não exibe false empty;
- artwork ausente não remove funcionalidade;
- Hero e carrosséis derivam de estado local válido;
- loading, empty e error permanecem distinguíveis.

**TRACEABILITY:** REQ-005, REQ-012, VS-01, VS-02.

---

# FSD-09 — Live

**TRIGGER:** entrada em Ao Vivo.

**PRECONDITIONS:** itens Live válidos no catálogo local.

**MAIN_FLOW:**
1. mostrar grupos;
2. mostrar canais;
3. consultar Continuity State;
4. tentar restaurar último canal válido;
5. iniciar preview;
6. permitir entrada no player;
7. atualizar último canal quando aplicável.

**ALTERNATIVE_FLOW:** se o último canal não existir ou não for válido, selecionar o primeiro canal reproduzível conforme ordenação local vigente.

**ERROR_FLOW:** se nenhum canal válido existir, exibir empty ou error verdadeiro sem quebrar a página.

**TERMINAL_STATES:** `LIVE_PREVIEW`, `LIVE_PLAYER`, `LIVE_EMPTY`, `LIVE_ERROR`.

**DATA_READ:** catálogo Live e Continuity State local.

**DATA_WRITE:** identidade segura do último canal selecionado ou reproduzido.

**NETWORK:** player → provider diretamente.

**SECURITY:** continuity não precisa persistir URL bruta de stream.

**OBSERVABILITY:** seleção, transições e playback sanitizados.

**ACCEPTANCE_CRITERIA:**
- retorno ao Live tenta restaurar último canal válido;
- preview retoma último canal válido;
- fallback funciona quando item anterior desaparece;
- playback permanece direto da fonte.

**TRACEABILITY:** REQ-006, REQ-011, VS-03.

---

# FSD-10 — Movies

**TRIGGER:** entrada em Filmes, categoria ou detalhe.

**PRECONDITIONS:** catálogo local utilizável.

**MAIN_FLOW:**
1. navegar por categorias ou listas;
2. selecionar filme;
3. abrir detalhe;
4. iniciar playback;
5. registrar progresso local quando aplicável.

**ALTERNATIVE_FLOW:** metadata ou artwork incompletos utilizam fallback sem bloquear item reproduzível.

**ERROR_FLOW:** item inválido ou desaparecido gera estado seguro e recuperável.

**TERMINAL_STATES:** `MOVIE_LIST`, `MOVIE_DETAIL`, `PLAYING`, `ERROR`.

**DATA_READ:** catálogo, metadata e Continuity State locais.

**DATA_WRITE:** progresso e resume local.

**NETWORK:** playback direto da source.

**SECURITY:** progress utiliza identidade local segura e não depende de URL bruta persistida.

**OBSERVABILITY:** erro e playback sanitizados.

**ACCEPTANCE_CRITERIA:**
- filme abre detalhe;
- playback inicia diretamente da fonte;
- posição válida pode ser restaurada;
- BACK preserva contexto aplicável.

**TRACEABILITY:** REQ-007, REQ-011, VS-04.

---

# FSD-11 — Series

**TRIGGER:** entrada em Séries ou detalhe de série.

**PRECONDITIONS:** série identificável no catálogo local.

**MAIN_FLOW:**
1. navegar em Séries;
2. selecionar coleção;
3. resolver identidade da série;
4. construir temporadas;
5. listar episódios;
6. permitir seleção do episódio.

**ALTERNATIVE_FLOW:** metadata parcial não impede estrutura local válida de série e episódios.

**ERROR_FLOW:** série ausente ou incompatível gera estado seguro.

**TERMINAL_STATES:** `SERIES_LIST`, `SERIES_DETAIL`, `ERROR`.

**DATA_READ:** catálogo e índices locais.

**DATA_WRITE:** Continuity State local quando aplicável.

**NETWORK:** metadata opcional; catálogo continua local.

**SECURITY:** identidade funcional não depende de URL persistida.

**OBSERVABILITY:** identificadores sanitizados.

**ACCEPTANCE_CRITERIA:**
- série abre detalhe;
- temporadas e episódios são resolvidos localmente;
- detalhe não depende de full scan remoto ou backend content search;
- metadata parcial não bloqueia estrutura reproduzível válida.

**TRACEABILITY:** REQ-008, REQ-011, VS-05.

---

# FSD-12 — Episodes

**TRIGGER:** seleção de episódio.

**PRECONDITIONS:** episódio reproduzível identificado localmente.

**MAIN_FLOW:**
1. selecionar episódio;
2. resolver referência local;
3. iniciar player;
4. registrar progresso;
5. salvar resume quando aplicável;
6. BACK retorna ao contexto da série.

**ALTERNATIVE_FLOW:** episódio sem metadata rica permanece funcional quando identidade e playback forem válidos.

**ERROR_FLOW:** item inválido produz erro recuperável e preserva navegação.

**TERMINAL_STATES:** `EPISODE_PLAYING`, `SERIES_DETAIL`, `ERROR`.

**DATA_READ:** episódio e Continuity State local.

**DATA_WRITE:** resume local e contexto necessário de série.

**NETWORK:** playback direto da source.

**SECURITY:** stream URL permanece runtime-only quando possível.

**OBSERVABILITY:** sem payload, credencial ou URL sensível.

**ACCEPTANCE_CRITERIA:**
- episódio abre o player;
- posição válida pode ser retomada;
- BACK retorna ao detalhe/contexto correto;
- episódio selecionado não deve reabrir indevidamente apenas a coleção.

**TRACEABILITY:** REQ-008, REQ-011, VS-05.

---

# FSD-13 — Search

**TRIGGER:** usuário informa consulta.

**PRECONDITIONS:** índice local disponível ou estado de indexação explicitamente conhecido.

**MAIN_FLOW:**
1. normalizar consulta;
2. pesquisar índice local;
3. considerar exact match;
4. considerar partial match;
5. considerar internal token;
6. ordenar resultados;
7. permitir abertura do item correto.

**ALTERNATIVE_FLOW:** consultas sem correspondência terminam em zero results verdadeiro.

**ERROR_FLOW:** zero results deve permanecer diferente de indexação ainda não pronta e de erro de busca.

**TERMINAL_STATES:** `RESULTS`, `ZERO_RESULTS`, `INDEXING`, `ERROR`.

**DATA_READ:** índice local.

**DATA_WRITE:** apenas estado de busca efêmero ou local necessário; nenhum catálogo central.

**NETWORK:** busca de conteúdo não depende do backend.

**SECURITY:** consulta não deve alimentar catálogo ou índice central derivado da source.

**OBSERVABILITY:** latência, readiness e contagens sanitizadas.

**ACCEPTANCE_CRITERIA:**
- exact funciona;
- partial funciona;
- internal token funciona;
- zero result é verdadeiro;
- indexing é distinguível;
- resultado abre o item correto;
- performance é registrada sem converter evidência em SLA.

**TRACEABILITY:** REQ-009, VS-06.

---

# FSD-14 — Player

**TRIGGER:** seleção de conteúdo reproduzível.

**PRECONDITIONS:** item válido e autorização vigente.

**MAIN_FLOW:**
1. resolver referência runtime no endpoint;
2. preparar candidato de playback;
3. conectar player diretamente à source;
4. iniciar reprodução;
5. manter controles e estados adequados à plataforma.

**ALTERNATIVE_FLOW:** estratégias ou candidatos compatíveis de reprodução podem ser tentados no próprio endpoint.

**ERROR_FLOW:** erro de mídia ou source resulta em player error, retry quando aplicável ou BACK.

**TERMINAL_STATES:** `PLAYING`, `ENDED`, `ERROR`, `BACK`.

**DATA_READ:** referência de playback presente no endpoint.

**DATA_WRITE:** Continuity State e dados mínimos de player locais.

**NETWORK:** `DEVICE_TO_SOURCE_DIRECT`.

**SECURITY:** sem stream proxy, relay ou restream Xandeflix; logs nunca exibem URL completa ou credencial.

**OBSERVABILITY:** erro sanitizado, tipo de mídia e estágio quando necessários.

**ACCEPTANCE_CRITERIA:**
- nenhuma conexão de mídia passa pelo backend Xandeflix;
- erro permite saída segura;
- player preserva contexto para BACK;
- continuity pode ser atualizada localmente.

**TRACEABILITY:** REQ-010, VS-03, VS-04, VS-05, VS-06.

---

# FSD-15 — Continuity State

**TRIGGER:** progresso de reprodução, saída de player, mudança de episódio, mudança de canal ou retorno a uma superfície compatível.

**PRECONDITIONS:** item com identidade local estável.

**MAIN_FLOW:**
1. persistir estado mínimo necessário no endpoint;
2. associar estado ao contexto local correto;
3. consultar estado quando a jornada for retomada;
4. validar compatibilidade;
5. restaurar quando válido.

**ALTERNATIVE_FLOW:** estado não mais compatível é descartado e fallback apropriado é aplicado.

**ERROR_FLOW:** continuity corrompida ou incompatível nunca impede acesso ao catálogo.

**TERMINAL_STATES:** `RESTORED`, `NO_STATE`, `STALE_DISCARDED`.

**DATA_READ:** Continuity State local.

**DATA_WRITE:** Continuity State somente no endpoint.

**NETWORK:** não exigida para persistir ou consultar continuity local.

**SECURITY:** escopo conceitual por license/source/device e identidade local; URL bruta não é requisito de persistência.

**OBSERVABILITY:** tipo de restore e resultado sem conteúdo sensível.

**ACCEPTANCE_CRITERIA:**
- `MOVIE_RESUME=CORE`;
- `EPISODE_RESUME=CORE`;
- `SERIES_CONTINUITY=CORE`;
- `LIVE_LAST_CHANNEL=CORE`;
- `LIVE_PREVIEW_RESUMES_LAST_CHANNEL=CORE`;
- estado stale não bloqueia conteúdo;
- cloud progress sync não é requisito MVP.

**TRACEABILITY:** REQ-011, VS-03, VS-04, VS-05.

---

# FSD-16 — Revocation

**TRIGGER:** autorização previamente válida deixa de ser válida ou nova verificação confirma revogação.

**PRECONDITIONS:** sessão ou runtime anteriormente autorizado.

**MAIN_FLOW:**
1. detectar revogação confirmada;
2. invalidar acesso protegido;
3. limpar material de autenticação que não pode continuar válido;
4. impedir novas operações protegidas;
5. encaminhar usuário a estado apropriado.

**ALTERNATIVE_FLOW:** falha transitória de verificação não é automaticamente classificada como revogação.

**ERROR_FLOW:** falha de verificação aplica política segura sem criar false authorization.

**TERMINAL_STATES:** `REVOKED`, `AUTHORIZED`, `VERIFY_RETRY`.

**DATA_READ:** estado de autorização do Control Plane e identidade local relevante.

**DATA_WRITE:** estado local de acesso e limpeza aplicável.

**NETWORK:** endpoint ↔ Control Plane.

**SECURITY:** usuário efetivamente revogado não pode continuar operando como autorizado.

**OBSERVABILITY:** evento sanitizado.

**ACCEPTANCE_CRITERIA:**
- revogação confirmada bloqueia acesso protegido;
- erro transitório não é promovido falsamente a revogação;
- credenciais e URLs não aparecem em log.

**TRACEABILITY:** REQ-013, VS-01, VS-07, VS-08.

---

# FSD-17 — Loading / Empty / Error / Retry

**TRIGGER:** qualquer superfície ou operação assíncrona.

**PRECONDITIONS:** operação iniciada, em progresso ou concluída.

**MAIN_FLOW:**
1. usar loading somente enquanto resultado ainda é desconhecido;
2. converter para content quando houver resultado utilizável;
3. converter para empty somente após ausência verdadeira confirmada;
4. converter para error quando a operação falhar;
5. oferecer retry quando recuperável.

**ALTERNATIVE_FLOW:** estado local válido pode ser mantido enquanto operação de atualização ocorre.

**ERROR_FLOW:** falha não pode permanecer indefinidamente como loading.

**TERMINAL_STATES:** `LOADING`, `CONTENT`, `EMPTY`, `ERROR`.

**DATA_READ:** estado atual da operação e geração local aplicável.

**DATA_WRITE:** nunca persistir vazio transitório como estado autoritativo.

**NETWORK:** depende do fluxo de origem.

**SECURITY:** mensagens e logs sanitizados.

**OBSERVABILITY:** transições entre estados e duração quando aplicável.

**ACCEPTANCE_CRITERIA:**
- `NO_FALSE_EMPTY=SIM`;
- `NO_INFINITE_LOADING=SIM`;
- empty somente após ausência confirmada;
- erro recuperável apresenta retry;
- geração parcial nunca substitui geração válida.

**TRACEABILITY:** REQ-012, VS-01, VS-02, VS-07.

---

# FSD-18 — Touch

**TRIGGER:** interação touch.

**PRECONDITIONS:** dispositivo com touch.

**MAIN_FLOW:** elemento interativo responde à ação primária esperada e executa o mesmo destino lógico correspondente à ação do produto.

**ALTERNATIVE_FLOW:** gesto não essencial não pode ser a única forma de realizar operação crítica.

**ERROR_FLOW:** toque não dispara rota ou item incorreto.

**TERMINAL_STATES:** ação executada ou nenhum efeito seguro.

**DATA_READ:** estado do componente e navegação aplicável.

**DATA_WRITE:** somente estado exigido pela ação.

**NETWORK:** conforme a ação funcional executada.

**SECURITY:** nenhuma exceção aos controles de autorização.

**OBSERVABILITY:** falhas de navegação apenas de forma sanitizada.

**ACCEPTANCE_CRITERIA:**
- phone executa jornadas principais por touch;
- tablet executa jornadas principais por touch;
- toque em episódio abre o episódio correto;
- ação touch e ação lógica correspondente permanecem consistentes.

**TRACEABILITY:** REQ-014, VS-02, VS-03, VS-04, VS-05, VS-06, VS-07, VS-10.

---

# FSD-19 — D-pad

**TRIGGER:** teclas direcionais ou OK em TV.

**PRECONDITIONS:** plataforma TV com foco espacial habilitado.

**MAIN_FLOW:**
1. estabelecer foco inicial utilizável;
2. exibir foco visível;
3. mover foco espacialmente de forma previsível;
4. preservar região de navegação válida;
5. OK ativa o item focado.

**ALTERNATIVE_FLOW:** mudança de região mantém foco utilizável e recuperável.

**ERROR_FLOW:** nenhum trap de foco permanente é permitido.

**TERMINAL_STATES:** foco válido, ação ativada ou navegação encerrada.

**DATA_READ:** estado de foco e estrutura navegável.

**DATA_WRITE:** estado de foco local quando necessário.

**NETWORK:** nenhuma exigência específica.

**SECURITY:** autorização funcional continua aplicável à ação ativada.

**OBSERVABILITY:** falhas podem ser registradas somente de forma sanitizada.

**ACCEPTANCE_CRITERIA:**
- foco inicial existe;
- foco é visualmente identificável;
- setas funcionam;
- OK ativa o item correto;
- não existe trap permanente;
- Fire Stick físico deve passar antes do release comercial.

**TRACEABILITY:** REQ-014, REQ-017, VS-03, VS-10.

---

# FSD-20 — BACK

**TRIGGER:** Android BACK ou remote BACK.

**PRECONDITIONS:** rota, modal, preview ou player ativo.

**MAIN_FLOW:**
1. fechar o nível transitório mais interno;
2. retornar ao contexto anterior;
3. preservar seleção ou continuity quando aplicável;
4. sair do aplicativo somente quando apropriado.

**ALTERNATIVE_FLOW:** player retorna à superfície de origem em vez de destruir a jornada.

**ERROR_FLOW:** BACK não cria loop, rota inválida ou retorno a superfície protegida após revogação.

**TERMINAL_STATES:** contexto anterior ou saída controlada.

**DATA_READ:** navigation state e Continuity State aplicável.

**DATA_WRITE:** continuity necessária antes da saída.

**NETWORK:** nenhuma dependência obrigatória.

**SECURITY:** BACK não reabre superfície protegida após perda válida de autorização.

**OBSERVABILITY:** falhas de navegação sanitizadas.

**ACCEPTANCE_CRITERIA:**
- player retorna ao contexto correto;
- detalhe retorna à superfície correta;
- Live preserva contexto aplicável;
- não existe loop de BACK.

**TRACEABILITY:** REQ-014, VS-02, VS-03, VS-04, VS-05, VS-06, VS-07, VS-10.

---

# FSD-21 — Orientation

**TRIGGER:** rotação ou inicialização em orientação específica.

**PRECONDITIONS:** dispositivo suporta orientação relevante.

**MAIN_FLOW:**
1. detectar orientação;
2. recompor layout apropriado;
3. preservar rota;
4. preservar seleção;
5. preservar continuity;
6. preservar playback state aplicável.

**ALTERNATIVE_FLOW:** player pode aplicar orientação adequada à plataforma sem perder contexto.

**ERROR_FLOW:** rotação não destrói sessão, rota, seleção ou continuity válida.

**TERMINAL_STATES:** mesma jornada em layout válido.

**DATA_READ:** UI state, route state e player state aplicável.

**DATA_WRITE:** somente estado de layout necessário.

**NETWORK:** nenhuma exigência adicional.

**SECURITY:** nenhuma exceção às regras de autorização e privacidade.

**OBSERVABILITY:** regressões podem ser registradas sem payload sensível.

**ACCEPTANCE_CRITERIA:**
- phone preserva jornada nas orientações aplicáveis;
- tablet portrait e landscape preservam jornada;
- reprodução aplicável não é perdida por rotação;
- nenhum breakpoint numérico novo é inferido por este FSD.

**TRACEABILITY:** REQ-014, REQ-017, VS-02, VS-03, VS-04, VS-05, VS-06, VS-07, VS-10.

---

# 22. Invariantes transversais

Todos os fluxos deste FSD obedecem simultaneamente:

`XANDEFLIX_BACKEND=CONTROL_PLANE_ONLY`

`SOURCE_FETCH=DEVICE_DIRECT`

`CATALOG_PROCESSING=DEVICE_LOCAL`

`CATALOG_STORAGE=DEVICE_LOCAL_ONLY`

`CONTENT_SEARCH=DEVICE_LOCAL`

`PLAYER_CONNECTION=DEVICE_TO_SOURCE_DIRECT`

`LOCAL_FIRST=SIM`

`OFFLINE_FIRST=NAO`

`CONTINUITY_STATE=CORE`

`NO_FALSE_EMPTY=SIM`

`NO_INFINITE_LOADING=SIM`

`ACTIVE_GENERATION_SAFETY=SIM`

`INDEXEDDB_SYNC_TO_BACKEND=NAO`

`CENTRAL_IPTV_CATALOG=PROIBIDO`

`PLAYLIST_PROXY=PROIBIDO`

`STREAM_PROXY=PROIBIDO`

`BACKEND_CONTENT_SEARCH=PROIBIDO`

---

# 23. Performance

Os fluxos não canonizam thresholds numéricos ainda não decididos.

`COLD_START_SLA=NFR_UNDECIDED`

`SEARCH_SLA=NFR_UNDECIDED`

`SLOW_NETWORK_SLA=NFR_UNDECIDED`

A observação física de busca:

`SEARCH_QUERY=Silo`

`OBSERVED_TERMINAL_TIME≈55s`

`APPARENT_VISUAL_PAUSE≈20s`

é classificada como:

`PERFORMANCE_EVIDENCE=SIM`

`PERFORMANCE_DEBT=SIM`

`ACCEPTED_AS_TARGET=NAO`

`AUTOMATIC_SLA=NAO`

---

# 24. Critério de autossuficiência

Este documento está completo somente se cada fluxo possuir explicitamente:

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