# U1 — contrato do catálogo universal

## Objetivo e limite

A U1 define a versão 1 do contrato canônico, seu inventário legado e métricas agregadas. Ela não conecta o contrato ao runtime, não importa conteúdo e não altera banco, Edge Functions, player ou telas. O rollback é a remoção exclusiva dos arquivos da U1.

## Estado atual e fluxos

### M3U

O parser local lê `EXTINF`, atributos de nome, logo, grupo e identificadores de guia, seguido por uma URL reproduzível. Linhas reproduzíveis sem `EXTINF` recebem nome sintético local. No importador remoto, a classificação é repetida e o cache persiste o item por licença e fonte. O caminho remoto pode rejeitar fontes M3U sem metadados suficientes, embora o parser local consiga representar suas URLs.

### Xtream

O importador remoto consulta categorias e streams de Live e VOD, forma a URL de reprodução e grava o mesmo cache remoto. Séries e episódios Xtream não possuem fluxo completo. A fonte e suas credenciais pertencem à fronteira de licenciamento e não ao item canônico.

### Persistência remota

O cache remoto contém identificadores internos, nome, URL de reprodução, logo, grupo, identificador de guia, ordenação, atividade, classificação e colunas TMDB. A URL de origem e credenciais vivem fora do item de catálogo. O cliente lê o cache paginado por Edge Function.

### IndexedDB

Existe o banco local `xandeflix-local-catalog`, versão 1, com stores de itens brutos, metadados gerais e metadados TMDB. Há índices por fonte, tipo, grupo, URL e título normalizado. A infraestrutura oferece leitura e escrita, mas nenhum fluxo auditado a alimenta automaticamente.

## Consumo atual

- Home: usa o serviço VOD remoto, prioriza itens com match e pôster TMDB e depois aplica fallback sem pôster.
- Filmes e Séries: usam grupos/categorias predefinidos, filtros por tipo e ordenação que favorece artwork; grupos fora das listas têm descoberta limitada.
- Live TV: usa `IptvChannel`, preserva a URL original para o player e considera `unknown` aceitável no predicado de canal ao vivo.
- Cards: já possuem fallback visual quando não há capa.

## Pontos de descarte e duplicações

Tipos de conteúdo aparecem em playlist, classificador, cache remoto, importador e catálogo local. Os classificadores local e remoto repetem heurísticas. `unknown` é preservado por alguns tipos, incluído no Live local, mas não é aceito por todos os filtros de VOD e não tem descoberta universal. Filtros opcionais de match/pôster e listas estáticas também reduzem a superfície descoberta. Campos de nome, grupo, logo, artwork e TMDB existem em variantes camelCase, snake_case e aliases redundantes.

## Contrato escolhido

`UniversalCatalogItem` representa o registro bruto e reproduzível. `UniversalCatalogEnrichedMetadata` é independente e opcional. A versão inicial é `1`; todos os nomes novos são camelCase. Os tipos são `live`, `movie`, `series`, `series_episode`, `radio` e `unknown`. `unknown` é informação válida, nunca instrução automática de descarte.

O item preserva os valores brutos necessários à reclassificação, valores normalizados para busca, identidade interna, origem, classificação, atividade e reprodução. Campos não garantidos são opcionais ou anuláveis. Metadados externos carregam provedor, resultado, confiança e controle de tentativas sem tornar o item bruto inválido.

## Segurança

`streamUrl` é necessária para reprodução, mas é dado operacional: não pode ser dimensão de métrica, diagnóstico, telemetria ou log de objeto completo. URLs de fonte, códigos de licença, usuários, senhas, tokens e cabeçalhos de autorização ficam fora do contrato. `licenseId` e `sourceId` são somente identificadores internos. Consultas da U1 retornam contagens, nunca valores operacionais.

## Decisões adiadas

U2 deve implementar importação M3U local-first, lotes, categorias dinâmicas e fallback legado. U3 pode tratar Xtream Series/Episodes, reconciliação remota, políticas de retry, evolução de classificação e observabilidade sanitizada. Migração de dados, cardinalidade definitiva, esquema remoto canônico e política de expiração também permanecem adiados.
