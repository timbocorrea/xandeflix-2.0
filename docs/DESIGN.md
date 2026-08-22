# Xandeflix 2.0 — Design e Interação

## 1. Controle do documento

STATUS=APPROVED

CANON_APPROVED=SIM

MATERIALIZED_BY_CYCLE=MVP-S0.2

Este documento é a autoridade canônica para apresentação, interação e estados visuais do Xandeflix 2.0.

Ele não autoriza redesign amplo nem substitui:

- `docs/product/XANDEFLIX_PRD.md` para produto e escopo;
- `docs/FSD.md` para comportamento funcional;
- `docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md` para fronteiras arquiteturais.

Regra de conflito:

`CANONICAL_DOCUMENT_CONFLICT → STOP → MASTER_DECISION_REQUIRED`

---

# 2. Classificação das decisões de design

Toda característica relevante pode ser classificada como:

## VALIDATED

Existe evidência física suficiente da característica naquela plataforma ou jornada.

## CANONICAL_PROPOSAL

É o comportamento visual/interativo definido como direção canônica, sem alegar que já foi fisicamente validado em todas as plataformas.

## REQUIRES_PHYSICAL_CONFIRMATION

A característica somente pode ser declarada validada após gate físico correspondente.

Uma mesma seção pode conter mais de uma classificação quando diferentes partes possuem níveis distintos de evidência.

---

# 3. Princípios gerais

O Xandeflix deve preservar:

- conteúdo como foco principal;
- navegação previsível;
- coerência entre touch e D-pad;
- estados explícitos de loading, content, empty e error;
- artwork opcional para funcionalidade;
- fallback visual ou textual legítimo;
- contexto de navegação após player;
- Continuity State sem depender de UI específica;
- foco de TV sempre identificável;
- ausência de false empty;
- ausência de infinite loading.

`NO_FALSE_EMPTY=SIM`

`CONTENT_FUNCTIONALITY_MUST_SURVIVE_ARTWORK_FAILURE=SIM`

Nenhuma superfície pode aparentar catálogo vazio enquanto o estado real ainda for loading, indexing ou erro.

---

# 4. Phone

CLASSIFICATION=CANONICAL_PROPOSAL

Phone é:

`ANDROID_PHONE=PRIMARY_CONTINUOUS_DEVELOPMENT_DEVICE`

A experiência deve ser:

- touch-first;
- compatível com orientação aplicável;
- compacta sem remover funções Core;
- capaz de navegar Home, Live, Filmes, Séries, Search e Player;
- capaz de executar BACK do Android;
- capaz de preservar contexto e Continuity State.

## 4.1 Shell

O shell de phone deve:

- priorizar conteúdo;
- fornecer navegação primária compatível com tela pequena;
- preservar acesso às principais superfícies;
- não bloquear conteúdo com elementos persistentes inadequados;
- responder corretamente a mudança de rota e orientação.

A existência de bottom navigation em superfícies apropriadas é compatível com o design atual, mas sua implementação específica não deve ser usada para inventar novas funções.

## 4.2 Hero

Em portrait, Hero deve se adaptar à largura e altura disponíveis sem exigir artwork remoto para liberar a superfície.

Poster ou artwork inadequado ao aspecto não deve ser forçado em uma região explicitamente horizontal.

## 4.3 Cards e carrosséis

Cards devem:

- permanecer identificáveis sem poster;
- aceitar touch;
- abrir o mesmo destino lógico definido pelo FSD;
- manter título ou fallback legível;
- não depender de artwork para funcionalidade.

Carrosséis devem:

- permitir exploração touch;
- preservar leitura do conteúdo;
- não gerar áreas impossíveis de alcançar.

---

# 5. Tablet

CLASSIFICATION=CANONICAL_PROPOSAL

`ANDROID_TABLET=PRIMARY_CONTINUOUS_DEVELOPMENT_DEVICE`

Tablet deve suportar:

- touch;
- portrait;
- landscape;
- recomposição de layout;
- Live preview;
- detalhes;
- episódios;
- Search;
- Player;
- BACK;
- Continuity State.

Algumas características exigem:

`REQUIRES_PHYSICAL_CONFIRMATION`

## 5.1 Portrait

O layout deve:

- utilizar espaço vertical sem esconder controles Core;
- preservar Hero, conteúdo e ações;
- preservar alvos touch claros;
- impedir corte indevido de preview;
- manter seleção e rota durante recomposição.

## 5.2 Landscape

O layout deve:

- utilizar largura adicional de forma funcional;
- preservar hierarquia;
- evitar poster vertical imposto a uma área de Hero horizontal;
- preservar aspect ratio de preview e player;
- manter navegação e contexto.

## 5.3 Rotação

Mudança entre portrait e landscape não deve:

- destruir rota;
- perder seleção;
- reiniciar indevidamente jornada;
- destruir Continuity State;
- perder playback quando o fluxo permitir preservação.

---

# 6. TV / Fire Stick

CLASSIFICATION=CANONICAL_PROPOSAL+REQUIRES_PHYSICAL_CONFIRMATION

`FIRE_STICK_ANDROID_TV=TARGET_TV_PLATFORM`

A experiência TV deve ser orientada a:

- navegação espacial;
- foco visível;
- setas;
- OK;
- BACK;
- distância de visualização adequada;
- preview Live;
- Player;
- layout compatível com tela horizontal.

Compatibilidade comercial exige validação física.

`FIRE_STICK_FINAL_GATE_BEFORE_COMMERCIAL_RELEASE=REQUIRED`

`DPAD_FINAL_PHYSICAL_GATE=REQUIRED`

---

# 7. Shell

O shell define a estrutura global de interação da aplicação.

Deve contemplar:

- navegação global;
- conteúdo principal;
- superfícies transitórias;
- estado de device class;
- entrada touch ou D-pad;
- foco quando aplicável;
- BACK;
- orientação.

O shell não deve apresentar conteúdo de uma source anterior como verdade após alteração válida de identidade da source.

Loading do shell não deve mascarar erro indefinidamente.

---

# 8. Hero

CLASSIFICATION=CANONICAL_PROPOSAL

Hero deve:

- destacar conteúdo sem impedir o restante da superfície;
- usar artwork compatível com o aspecto disponível;
- aceitar fallback quando artwork apropriado estiver ausente;
- preservar texto e ação principal quando possível;
- não bloquear Home aguardando indefinidamente metadata ou artwork remoto.

Em região horizontal:

`VERTICAL_POSTER_FORCED_AS_HORIZONTAL_HERO=NAO`

Fallback aceitável pode incluir:

- gradiente;
- imagem apropriada disponível;
- conteúdo textual;
- combinação desses elementos.

O fallback não cria novo requisito de download permanente de artwork.

---

# 9. Cards

Cards representam uma entidade navegável ou reproduzível.

Devem:

- identificar o conteúdo;
- manter ação mesmo sem artwork;
- possuir área interativa coerente;
- usar o mesmo destino lógico por touch, clique ou OK;
- exibir foco visível em TV;
- evitar depender exclusivamente da imagem para identificação.

`ARTWORK_REQUIRED_FOR_CARD_FUNCTION=NAO`

---

# 10. Carrosséis

Carrosséis devem:

- organizar conjuntos de conteúdo;
- preservar ordem definida pelo read model aplicável;
- aceitar touch em dispositivos touch;
- aceitar navegação espacial quando aplicável;
- evitar focus trap;
- manter card ativo identificável.

Carrossel não deve declarar ausência de conteúdo enquanto indexação ou preparação ainda estiver em andamento.

---

# 11. Search

Search deve apresentar visualmente estados distintos:

`INDEXING`

`READY`

`RESULTS`

`ZERO_RESULTS`

`ERROR`

Zero results só pode aparecer após conclusão válida da consulta sobre índice disponível.

Durante indexação:

`ZERO_RESULTS_AS_INDEXING_PLACEHOLDER=PROIBIDO`

A interface deve permitir:

- entrada da consulta;
- feedback de processamento quando necessário;
- identificação dos resultados;
- abertura do resultado correto;
- estado zero-results verdadeiro;
- estado de erro.

A evidência:

`SEARCH_QUERY=Silo`

`OBSERVED_TERMINAL_TIME≈55s`

`APPARENT_VISUAL_PAUSE≈20s`

é evidência de performance e dívida, não referência visual desejada nem SLA.

---

# 12. Details

Detalhes de Filme e Série devem preservar:

- identidade do conteúdo;
- artwork quando disponível;
- fallback quando necessário;
- metadata disponível;
- ação principal;
- navegação de retorno;
- Continuity State quando aplicável.

Metadata opcional não pode bloquear conteúdo reproduzível válido.

## 12.1 Movie Detail

Deve permitir:

- identificação do filme;
- ação de reprodução;
- retorno;
- resume quando aplicável.

## 12.2 Series Detail

Deve permitir:

- identificação da série;
- temporadas;
- episódios;
- navegação entre episódios;
- retorno;
- continuidade de série.

---

# 13. Episodes

Lista de episódios deve:

- tornar cada episódio identificável;
- tratar o episódio como ação reproduzível;
- abrir o episódio selecionado;
- não reabrir indevidamente apenas a coleção;
- preservar progresso quando disponível;
- permitir BACK ao detalhe da série.

Touch e OK devem resolver o mesmo destino lógico.

---

# 14. Live

A superfície Live deve incluir, conforme device class:

- grupos;
- canais;
- seleção;
- preview;
- player;
- estado do último canal;
- error;
- empty verdadeiro.

A estrutura visual deve permitir identificar:

- grupo ativo;
- canal selecionado;
- preview atual;
- transição ao player.

`LIVE_LAST_CHANNEL=CORE`

`LIVE_PREVIEW_RESUMES_LAST_CHANNEL=CORE`

Quando o último canal não for mais válido, a UI deve representar o fallback definido pelo FSD sem aparentar falha silenciosa.

---

# 15. Preview

Preview é uma superfície de reprodução inline.

Deve:

- respeitar aspect ratio;
- não aplicar crop destrutivo como padrão visual;
- permanecer associado ao item selecionado;
- permitir transição ao player;
- possuir estado de erro seguro;
- preservar contexto da superfície de origem.

CLASSIFICATION=CANONICAL_PROPOSAL+REQUIRES_PHYSICAL_CONFIRMATION

---

# 16. Player

Player deve:

- priorizar vídeo;
- preservar aspect ratio;
- adequar controles à plataforma;
- responder a BACK;
- preservar Continuity State;
- exibir erro funcional e sanitizado;
- permitir retry quando aplicável;
- não expor URL ou credencial.

Em TV:

- D-pad e BACK devem permanecer utilizáveis;
- foco de controles, quando presente, deve ser visível.

Em touch:

- controles necessários devem possuir alvos adequados.

`PLAYER_CONNECTION=DEVICE_TO_SOURCE_DIRECT`

Nenhuma escolha visual autoriza stream proxy, relay ou restream.

---

# 17. Loading

Loading representa estado realmente pendente.

Para superfícies de catálogo, os estados documentais são:

`PREPARING`: ainda não existe conteúdo local estruturalmente renderizável;

`PARTIAL_CONTENT`: existe conteúdo local real e utilizável, mas o catálogo ainda está em construção;

`CONTENT_READY`: o catálogo alcançou o estado de lifecycle previsto.

Esses termos descrevem semântica de estado e não exigem badge, label ou novo texto visível.

Pode ser usado durante:

- bootstrap;
- import;
- indexação;
- consulta;
- carregamento de metadata;
- preparação de player;

somente enquanto o resultado ainda for desconhecido.

No cold bootstrap sem active válido, Home, Filmes, Séries e Live devem sair do bloqueio global quando houver staging bounded renderizável, ainda que import esteja em progresso e EOF ou promotion não tenham ocorrido. O conteúdo parcial pode ganhar grupos ou itens por atualizações bounded, sem representar catálogo completo pronto.

Em warm refresh com active válido, active permanece a visão principal e autoritativa; staging em construção não a substitui antes de promotion válida.

`INFINITE_LOADING=PROIBIDO`

Loading não pode substituir permanentemente um error.

---

# 18. Empty

Empty significa ausência verdadeira confirmada.

`FALSE_EMPTY=PROIBIDO`

Não usar Empty para representar:

- loading;
- indexing;
- timeout;
- source ainda não processada;
- geração parcial;
- cold bootstrap ainda em `PREPARING`;
- staging renderizável ainda em `PARTIAL_CONTENT`;
- erro de rede;
- erro interno.

Empty deve permitir ao usuário entender que não existe conteúdo correspondente naquele estado validamente concluído.

---

# 19. Error

Error deve:

- ser funcional;
- ser compreensível;
- evitar linguagem técnica desnecessária;
- não revelar credenciais;
- não revelar URL sensível;
- indicar retry quando aplicável;
- indicar ação necessária quando aplicável.

Error não pode ser escondido por loading infinito.

---

# 20. Artwork fallback

Artwork é melhoria visual, não requisito para funcionamento do conteúdo.

Quando artwork falhar ou não existir:

- card continua funcional;
- detalhe continua funcional;
- Hero usa fallback adequado;
- título permanece identificável quando possível;
- player continua acessível quando a entidade for reproduzível.

`CONTENT_FUNCTIONALITY_MUST_SURVIVE=SIM`

`PERMANENT_ARTWORK_DOWNLOAD_REQUIRED=NAO`

---

# 21. Focus

Aplicável especialmente a TV.

Focus deve:

- existir inicialmente em uma região utilizável;
- ser visualmente identificável;
- mover-se de forma previsível;
- manter relação espacial compreensível;
- permitir ativação por OK;
- evitar trap permanente;
- permanecer recuperável após mudança de região.

Foco visual não deve depender apenas de mudanças quase imperceptíveis.

---

# 22. D-pad

CLASSIFICATION=CANONICAL_PROPOSAL+REQUIRES_PHYSICAL_CONFIRMATION

TV deve suportar:

- UP;
- DOWN;
- LEFT;
- RIGHT;
- OK;
- BACK.

Comportamento esperado:

1. foco inicial válido;
2. deslocamento previsível;
3. foco sempre identificável;
4. OK ativa o elemento focado;
5. saída de uma região não cria focus trap.

`DPAD_FINAL_PHYSICAL_GATE=REQUIRED`

---

# 23. BACK

BACK deve respeitar profundidade de navegação.

Regra geral:

`TRANSIENT_LAYER → PARENT_CONTEXT → CONTROLLED_EXIT`

Exemplos:

- player → detalhe/lista de origem;
- detalhe → categoria;
- modal → superfície subjacente;
- preview/fullscreen → superfície anterior apropriada.

BACK não pode:

- criar loop;
- abrir rota inválida;
- reabrir superfície protegida após revogação;
- descartar continuity necessária sem oportunidade de persistência.

---

# 24. Orientation

Phone e Tablet devem preservar durante rotação:

- rota;
- seleção;
- estado de detalhe;
- Continuity State;
- playback state quando aplicável;
- contexto de navegação.

O design canônico não fixa novos breakpoints numéricos neste ciclo.

`NEW_NUMERIC_BREAKPOINTS_CANONIZED=NAO`

A validação final de portrait/landscape depende da matriz da Vertical Slice correspondente.

---

# 25. Estados visuais obrigatoriamente distintos

As superfícies assíncronas devem conseguir distinguir:

`PREPARING`

`LOADING`

`PARTIAL_CONTENT`

`CONTENT`

`CONTENT_READY`

`EMPTY`

`ERROR`

Search acrescenta:

`INDEXING`

`ZERO_RESULTS`

Live pode acrescentar:

`PREVIEW`

`PLAYER`

Nenhum estado deve ser reutilizado para esconder semanticamente outro.

Em Home, Filmes, Séries e Live, `PARTIAL_CONTENT` representa conteúdo verdadeiro local e pode expandir de forma bounded enquanto o import continua. Ele não significa empty, catálogo completo, active autoritativa ou promotion. Sem conteúdo renderizável, a superfície permanece em `PREPARING`/`LOADING`; empty exige ausência real confirmada.

`LOADING_EMPTY_ERROR_DISTINCT=SIM`

---

# 26. Continuidade visual e funcional

A interface deve refletir o `CONTINUITY_STATE=CORE`.

Isso inclui:

- movie resume;
- episode resume;
- series continuity;
- Live last channel;
- Live preview do último canal.

A forma visual pode variar por device class, mas a capacidade funcional não pode desaparecer por adaptação de layout.

---

# 27. Segurança visual e privacidade

A interface não deve exibir:

- credenciais de source;
- tokens;
- URLs completas de stream;
- dados internos desnecessários;
- mensagens técnicas contendo segredo.

Diagnóstico apresentado ao usuário deve ser sanitizado.

---

# 28. Relação com evidência física

Comportamento observado em dispositivo é evidência importante, mas não cria automaticamente nova decisão de design.

`PHYSICAL_EVIDENCE_IS_NOT_AUTOMATIC_CANON=SIM`

Evidência física mais recente de regressão invalida validação física anterior da mesma capacidade até revalidação.

`LATEST_REGRESSION_WINS=SIM`

---

# 29. Matriz conceitual

| Capacidade | Phone | Tablet | TV / Fire Stick |
|---|---|---|---|
| Shell | Touch | Touch adaptativo | Spatial / D-pad |
| Hero | Adaptativo | Portrait/Landscape | Horizontal |
| Cards | Touch | Touch | Foco + OK |
| Carrosséis | Touch | Touch | D-pad |
| Search | Touch/keyboard | Touch/keyboard | Input aplicável + D-pad |
| Details | Scroll/Touch | Adaptativo | D-pad |
| Episodes | Touch | Touch | D-pad |
| Live | Touch | Touch + Preview | D-pad + Preview |
| Player | Touch | Touch | D-pad/Remote |
| BACK | Android | Android | Remote BACK |
| Orientation | Aplicável | Portrait/Landscape | Landscape/TV |
| Focus | Não primário | Quando aplicável | Obrigatório |

---

# 30. Restrições finais

Este documento não autoriza:

- redesign integral;
- criação de nova identidade visual;
- troca arbitrária de navegação;
- novas funcionalidades;
- novos breakpoints numéricos sem decisão;
- centralização de conteúdo;
- offline playback;
- novo comportamento divergente do PRD/FSD.

Para qualquer conflito:

`CANONICAL_DOCUMENT_CONFLICT → STOP → MASTER_DECISION_REQUIRED`
