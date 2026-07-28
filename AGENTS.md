AGENTS.md — Contrato Arquitetural Obrigatório do Xandeflix 2.0

STATUS: NORMATIVO / OBRIGATÓRIO

Este arquivo se aplica a todo o repositório. Antes de propor, editar, gerar, refatorar, testar ou revisar código, leia integralmente:

docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md

1. Regra principal

O Xandeflix é uma plataforma de software de propósito geral para licenciamento do aplicativo, organização local de mídia e reprodução no endpoint do cliente.

O backend Xandeflix é CONTROL PLANE. Ele não deve se tornar DATA PLANE de IPTV.

Fluxo obrigatório:

BACKEND XANDEFLIX
usuário/licença/dispositivo/autorização
                │
                ▼
APP NO ENDPOINT DO CLIENTE
                │
                ├── busca a fonte diretamente no provedor
                ├── processa/classifica localmente
                ├── mantém somente cache/índice privado local quando necessário
                └── reproduz diretamente da fonte no player

Nunca introduzir ou reintroduzir:

FONTE IPTV → BACKEND XANDEFLIX → APP/PLAYER

2. Invariantes obrigatórios

Toda alteração deve preservar simultaneamente:

Licença Xandeflix autoriza o uso do software, não certifica direitos sobre o conteúdo.

O Xandeflix não fornece, revende, hospeda, retransmite nem cura conteúdo de terceiros.

A lista M3U, o catálogo derivado e os streams devem ser consumidos pelo endpoint do cliente diretamente da fonte.

O backend não deve persistir catálogo IPTV derivado do cliente.

O backend não deve persistir stream_url/URLs de itens, nomes de canais/VOD/séries, logos, grupos, tvg-id, EPG ou metadados derivados da lista como catálogo central.

O backend não deve fazer proxy de playlist nem proxy de stream como arquitetura de produção.

O player deve abrir o stream diretamente da fonte no endpoint.

IndexedDB/cache local é permitido apenas no endpoint, privado ao usuário/dispositivo, sem sincronização do catálogo ao backend.

Dados locais derivados da fonte devem ser purgeáveis e nunca usados para construir um catálogo central Xandeflix.

Não criar fallback “temporário” que volte a transportar ou armazenar o conteúdo IPTV no backend.

3. O que o backend pode armazenar

Permitido no Control Plane:

usuários/clientes;

licença do software;

dispositivos autorizados;

plano, status e validade;

vínculo/autorização de uso de uma fonte;

identificadores opacos e metadados mínimos de configuração necessários para liberar a fonte ao dispositivo;

logs de segurança e auditoria sanitizados, sem conteúdo IPTV, URLs de itens ou credenciais.

Qualquer credencial/configuração de fonte eventualmente necessária ao Control Plane deve ser tratada como segredo, minimizada e disponibilizada somente ao dispositivo autorizado. O backend não pode usar essa configuração para baixar/processar a lista.

4. Padrões proibidos para código novo

Não criar, ampliar ou tornar dependência do runtime final:

tabelas/cache centrais equivalentes a license_channels_cache;

endpoints equivalentes a get-client-license-channels para entregar catálogo IPTV;

importadores server-side de canais/VOD/séries da fonte do cliente;

playlist-proxy;

proxy/retransmissão de stream;

upload de IndexedDB/catálogo local para Supabase/backend;

índices de busca centrais derivados da lista do cliente;

warmup server-side que baixe a M3U do cliente;

enriquecimento que exija persistir centralmente itens da lista.

Código legado que ainda implemente esses padrões é dívida de migração. Não o expandir. Ao tocar nele, a direção permitida é reduzir/remover dependência.

5. Regra de alteração arquitetural

Antes de qualquer mudança que possa atravessar a fronteira Control Plane/Data Plane:

PARE. NÃO IMPLEMENTE.

Produza primeiro um relatório contendo:

ARCHITECTURE_IMPACT=REVIEW_REQUIRED
CONTROL_PLANE_CHANGE=SIM/NAO
DATA_PLANE_CHANGE=SIM/NAO
CENTRAL_CONTENT_PERSISTENCE=SIM/NAO
CENTRAL_PLAYLIST_PROXY=SIM/NAO
CENTRAL_STREAM_PROXY=SIM/NAO
DEVICE_DIRECT_FETCH_PRESERVED=SIM/NAO
DEVICE_DIRECT_PLAYBACK_PRESERVED=SIM/NAO

Se qualquer campo proibido resultar em SIM, a implementação deve ser bloqueada até decisão explícita do Analista Mestre.

Nenhuma conveniência técnica, CORS, cache, desempenho, TMDB, compatibilidade web ou fallback autoriza violar este contrato.

6. Checklist obrigatório antes de editar

Antes de escrever código:

Confirmar worktree, branch, HEAD e estado Git em modo read-only.

Ler este AGENTS.md.

Ler docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md.

Identificar se o arquivo tocado participa de licensing, source resolution, import, catalog, proxy, player, Supabase ou Edge Functions.

Mapear o fluxo de dados antes e depois.

Confirmar que o backend continuará fora do Data Plane.

Preservar logs sanitizados e não expor URLs/credenciais.

7. Checklist obrigatório depois de editar

A conclusão deve declarar explicitamente:

ARCHITECTURE_CONTRACT_READ=SIM
CONTROL_PLANE_ONLY_PRESERVED=SIM/NAO
CENTRAL_IPTV_CATALOG_INTRODUCED=NAO
CENTRAL_PLAYLIST_PROXY_INTRODUCED=NAO
CENTRAL_STREAM_PROXY_INTRODUCED=NAO
DEVICE_DIRECT_SOURCE_FETCH_PRESERVED=SIM
DEVICE_DIRECT_PLAYBACK_PRESERVED=SIM
LOCAL_CATALOG_SYNCED_TO_BACKEND=NAO

Se qualquer resposta não puder ser comprovada, o Gate é INCONCLUSIVO e não deve haver merge.

8. Exceções

Mudança deste contrato exige decisão explícita do proprietário/Analista Mestre e atualização versionada deste documento antes da implementação.

Não inferir exceção a partir de pedidos vagos como “faça funcionar”, “use fallback”, “corrija CORS”, “otimize” ou “torne compatível”.

9. Documento canônico

A fundamentação completa está em:

docs/architecture/XANDEFLIX_ARCHITECTURE_CONTRACT.md

Este arquivo é a porta de entrada operacional para agentes de IA e desenvolvedores.