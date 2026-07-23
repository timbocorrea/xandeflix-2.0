Xandeflix 2.0 — Contrato Arquitetural e de Negócio

- **Status:** NORMATIVO
- **Versão:** 1.0
- **Data:** 22/07/2026
- **Escopo:** todo o Xandeflix 2.0
- **Regra:** qualquer alteração de código deve respeitar este documento.

1. Motivo deste contrato

O Xandeflix passou por ciclos em que correções técnicas voltaram a introduzir uma arquitetura centralizada para listas IPTV, catálogo derivado e URLs de reprodução.

Isso contraria o plano de negócio e aumenta:

risco jurídico e operacional;

acoplamento com conteúdo de terceiros;

custo de backend;

complexidade de LGPD/segurança;

tempo de implementação;

risco de regressão arquitetural.

Este documento existe para impedir que futuras alterações — humanas ou geradas por IA — desviem novamente o produto dessa rota.

2. Identidade do produto

O Xandeflix é um software de propósito geral.

Exemplos legítimos de uso incluem:

hotel com conteúdo devidamente licenciado;

empresa com treinamentos internos;

instituição de ensino com aulas próprias;

igreja/produtora com transmissões próprias;

cliente com mídia ou fonte que esteja autorizado a utilizar.

O Xandeflix fornece:

licença de uso do software;

interface;

navegação;

organização local;

busca local;

player;

gerenciamento de dispositivos;

controles de segurança.

O Xandeflix não fornece a licença de direitos autorais do conteúdo e não deve ser projetado como fornecedor de conteúdo.

3. Separação obrigatória: Control Plane x Data Plane

3.1 Control Plane — Xandeflix Backend

Pode controlar:

Cliente
  ↓
Usuário
  ↓
Licença do software
  ↓
Dispositivo autorizado
  ↓
Autorização/vínculo de fonte

Pode armazenar:

identidade do usuário/cliente;

licença;

dispositivo;

plano/status/validade;

vínculo da fonte;

configuração mínima necessária para entregar a autorização ao endpoint;

identificadores opacos;

auditoria e segurança sanitizadas.

3.2 Data Plane — Endpoint do cliente

Deve executar:

Fonte configurada
       │
       ▼
App Xandeflix no dispositivo
       │
       ├── download direto
       ├── parse local
       ├── classificação local
       ├── índice/cache privado local
       └── player
             │
             ▼
          Fonte original

O backend Xandeflix não participa do transporte da lista nem do stream.

4. Fluxo de dados obrigatório

Permitido

1. App → Xandeflix Backend
   validar licença/dispositivo

2. Xandeflix Backend → App
   retornar autorização/configuração mínima da fonte

3. App → Fonte do cliente/provedor
   baixar M3U/dados diretamente

4. App
   parsear, classificar e indexar localmente

5. App/Player → Fonte original
   reproduzir diretamente

Proibido como arquitetura final

Fonte → Supabase/Edge Function → App

Fonte → Xandeflix Backend → catálogo central → App

Player → proxy Xandeflix → stream

5. Dados de conteúdo que não devem ser centralizados

O backend não deve armazenar como catálogo do cliente:

M3U bruto;

linhas EXTINF;

URLs individuais de stream;

nomes de canais;

nomes de filmes/séries derivados da lista;

grupos/categorias da lista;

logos da lista;

tvg-id, tvg-name;

EPG derivado da fonte;

poster/backdrop derivados da lista;

catálogo indexado;

documentos/tokens de busca derivados do catálogo;

histórico integral da lista.

A simples necessidade de melhorar Home, busca, TMDB, performance ou fallback não autoriza mover esses dados para o backend.

6. Configuração da fonte

O Control Plane pode manter o mínimo necessário para permitir que um dispositivo autorizado descubra/configure sua fonte.

Regras:

configuração/credenciais da fonte são segredo;

acesso somente por dispositivo/licença autorizados;

logs nunca devem expor credenciais ou URL sensível;

o backend não deve usar a URL da fonte para importar o catálogo;

o backend não deve transformar a configuração da fonte em um catálogo próprio.

A configuração de uma fonte no painel não significa certificação de direitos sobre o conteúdo.

7. Persistência local no endpoint

A persistência local é permitida como recurso técnico de desempenho e experiência:

IndexedDB;

cache local;

índices locais;

snapshots locais;

metadados de importação local.

Condições obrigatórias:

LOCAL_ONLY=SIM
SYNC_TO_BACKEND=NAO
PRIVATE_TO_ENDPOINT=SIM
PURGEABLE=SIM
CENTRAL_CATALOG=NAO

O objetivo é evitar baixar/processar listas grandes desnecessariamente em cada abertura sem transformar o Xandeflix Backend em repositório de conteúdo.

A política local pode ser endurecida futuramente por decisão jurídica/produto, mas nunca flexibilizada para persistência central sem revisão deste contrato.

8. Reprodução

O player deve receber a URL do item no próprio endpoint e conectar-se diretamente à fonte.

Invariante:

PLAYER → FONTE ORIGINAL

Não introduzir:

PLAYER → XANDEFLIX → FONTE

nem proxy, relay, restream, cache de mídia ou CDN Xandeflix para conteúdo do cliente sem uma decisão arquitetural e jurídica completamente nova.

9. Legado em processo de remoção

Elementos existentes ou históricos como:

license_channels_cache;

get-client-license-channels;

importação server-side da lista;

playlist-proxy;

caches centrais de canais/VOD/séries;

são classificados, para o runtime final, como LEGACY / MIGRATION DEBT.

Regras:

não ampliar;

não criar novas dependências;

não usá-los como solução para CORS ou performance;

não transformá-los em fallback permanente;

quando tocados, preferir redução/remoção;

qualquer manutenção temporária deve ser explicitamente identificada como legado e ter rota de saída.

10. TMDB e enriquecimento

TMDB não pode ser justificativa para reconstruir o catálogo IPTV no backend.

Qualquer enriquecimento deve preservar:

PLAYLIST_CATALOG_CENTRAL_STORAGE=NAO
STREAM_URL_CENTRAL_STORAGE=NAO

Se uma integração necessitar de serviço intermediário para proteger chave/rate-limit, ela deverá ser avaliada separadamente e ser:

mínima;

sem persistência do catálogo IPTV;

sem transformar o backend em índice de conteúdo do cliente;

documentada antes da implementação.

11. Licença do software x direitos do conteúdo

São relações diferentes.

Licença Xandeflix

Autoriza:

usar o software;

usar funcionalidades contratadas;

operar dispositivos autorizados.

Direitos sobre conteúdo

Pertencem à relação entre:

CLIENTE ↔ PROPRIETÁRIO/FORNECEDOR DA FONTE

O produto deve evitar linguagem que sugira que o Xandeflix certifica a licitude da programação.

Preferir textos como:

“Fonte configurada pelo cliente”;

“Fonte vinculada ao dispositivo”;

“Use somente conteúdo para o qual possua as autorizações necessárias”.

12. Regra para IA e automação

Antes de qualquer alteração, a IA deve responder internamente às perguntas:

Este código faz o backend baixar a lista?

Este código envia itens da lista ao backend?

Este código armazena catálogo derivado centralmente?

Este código faz proxy da playlist?

Este código faz proxy/retransmissão do stream?

Este código deixa o player de conectar diretamente à fonte?

Este código sincroniza cache/IndexedDB local ao backend?

Este código expande dependência de legado central?

Se qualquer resposta for SIM, não implementar automaticamente.

Emitir:

ARCHITECTURE_STOP=SIM
MOTIVO=<descrição sanitizada>
DECISAO_DO_ANALISTA_MESTRE=NECESSARIA

13. Gate arquitetural obrigatório

Toda PR que toque:

licensing;

IPTV source;

playlist;

import;

local catalog;

Supabase;

Edge Functions;

player;

TMDB;

cache;

busca;

deve registrar:

ARCHITECTURE_CONTRACT_READ=SIM

BACKEND_CONTROL_PLANE_ONLY=SIM
BACKEND_FETCHES_CLIENT_PLAYLIST=NAO
CENTRAL_IPTV_CATALOG=NAO
CENTRAL_ITEM_STREAM_URL_STORAGE=NAO
CENTRAL_PLAYLIST_PROXY=NAO
CENTRAL_STREAM_PROXY=NAO

DEVICE_DIRECT_SOURCE_FETCH=SIM
DEVICE_LOCAL_PROCESSING=SIM
DEVICE_DIRECT_PLAYBACK=SIM

LOCAL_CATALOG_SYNC_TO_BACKEND=NAO

LEGACY_CENTRAL_DEPENDENCY_ADDED=NAO
LEGACY_CENTRAL_DEPENDENCY_REDUCED=SIM/NAO/NAO_APLICAVEL

Qualquer NAO em um invariante positivo ou SIM em um padrão proibido bloqueia Ready for Review/merge.

14. Regra para compatibilidade e fallback

Fallback não pode violar arquitetura.

Exemplos proibidos:

“CORS falhou, então enviar a M3U pelo Supabase”;

“IndexedDB falhou, então consultar catálogo central” como solução final;

“rede lenta, então armazenar a lista inteira no backend”;

“TMDB precisa dos títulos, então importar tudo para uma tabela central”.

Falha deve degradar funcionalidade sem atravessar a fronteira arquitetural.

15. Mudança deste contrato

Este documento não é uma sugestão técnica. É uma restrição de produto e negócio.

Mudá-lo requer:

decisão explícita do proprietário/Analista Mestre;

justificativa de negócio;

análise técnica;

análise de segurança/LGPD quando aplicável;

atualização versionada deste contrato;

somente depois, alteração de código.

Uma IA não pode inferir que uma solicitação genérica autoriza exceção.

16. Critério de conclusão da refatoração atual

A refatoração local-first estará arquiteturalmente concluída quando o runtime normal não depender do backend para transportar ou reconstruir catálogo IPTV.

Objetivo final:

XANDEFLIX_BACKEND=CONTROL_PLANE_ONLY

SOURCE_FETCH=DEVICE_DIRECT
CATALOG_PROCESSING=DEVICE_LOCAL
CATALOG_STORAGE=DEVICE_LOCAL_ONLY
PLAYER_CONNECTION=DEVICE_TO_SOURCE_DIRECT

CENTRAL_PLAYLIST_STORAGE=NONE
CENTRAL_DERIVED_IPTV_CATALOG=NONE
CENTRAL_PLAYLIST_PROXY=NONE
CENTRAL_STREAM_PROXY=NONE

Legado poderá existir durante migração apenas enquanto estiver explicitamente isolado, não ampliado e com plano de remoção.
