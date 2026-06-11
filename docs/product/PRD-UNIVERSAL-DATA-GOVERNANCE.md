# PRD — Universal Data Governance

## 1. Objetivo

Estabelecer uma regra universal, versionada e executável para impedir que o Xandeflix 2.0 volte a desviar do modelo de negócio local-first.

Esta governança existe para preservar a arquitetura correta do produto antes de qualquer refatoração, limpeza, migração ou remoção de legado.

## 2. Decisão irrevogável de produto

O Supabase autentica, autoriza e gerencia licenças, usuários, perfis e aparelhos.

O dispositivo do usuário cataloga, armazena, enriquece e cacheia dados IPTV/TMDB.

## 3. Regra-mãe de execução

1. Congelar.
2. Auditar.
3. Criar lei universal e guardrail.
4. Só depois limpar/refatorar em fases.

É proibido pular diretamente para limpeza pesada, remoção de legado ou refatoração funcional sem inventário aprovado.

## 4. Supabase — usos permitidos

O Supabase pode ser usado para:

- autenticação;
- autorização;
- licenças;
- usuários;
- dispositivos/aparelhos;
- perfis;
- permissões;
- preferências globais;
- controle parental;
- favoritos e progresso quando armazenados com identificador neutro, sem carregar catálogo sensível da fonte IPTV;
- metadados administrativos que não exponham catálogo real da fonte.

## 5. Supabase — usos proibidos

O Supabase não deve ser usado como catálogo IPTV/VOD centralizado.

São proibidos como expansão nova no Supabase ou em código que amplie catálogo centralizado:

- URLs reais de stream;
- URLs de playlist;
- grupos reais da fonte;
- nomes/títulos reais vindos da fonte IPTV;
- identificadores reais da fonte, como `tvg_id`;
- logos reais da fonte;
- poster/backdrop/cache TMDB vinculado diretamente ao item IPTV;
- enriquecimento TMDB centralizado para itens da fonte IPTV;
- novas funções, tabelas, migrations ou serviços que ampliem o catálogo IPTV/TMDB centralizado.

## 6. Dispositivo do usuário — responsabilidades obrigatórias

O dispositivo do usuário deve processar e armazenar localmente:

- fonte IPTV configurada pelo usuário/licença;
- catálogo Live TV/VOD;
- URLs de stream;
- grupos reais da fonte;
- títulos reais da fonte;
- cache local de TMDB;
- imagens e metadados de apresentação;
- índices locais de busca e navegação;
- cache de desempenho para Home, Filmes, Séries e Ao Vivo.

## 7. Legado não conforme

Código, tabela ou função existente que dependa do modelo antigo deve ser classificado como:

`LEGACY_ALLOWED_BUT_FROZEN`

Isso significa:

- pode continuar existindo temporariamente para não quebrar o app;
- não deve ser expandido;
- não deve receber novas dependências funcionais;
- deve ser inventariado antes de qualquer remoção;
- deve ser substituído por camada local-first antes de limpeza definitiva.

## 8. Exceções

Qualquer exceção às regras acima exige aprovação explícita do Analista Mestre.

A exceção deve conter:

- motivo técnico;
- risco de privacidade/segurança;
- impacto no modelo local-first;
- plano de reversão;
- prazo de expiração da exceção.

## 9. Critérios de aceite desta fase

A Fase 12.0 é aceita quando existir no repositório:

- PRD universal;
- ADR local-first;
- documento de guardrails;
- script executável de governança;
- workflow de CI para pull requests;
- template de PR com checklist de governança;
- script `governance:check` em `package.json`;
- nenhuma alteração funcional em `src/`, `supabase/functions`, Android, player ou D-pad.

## 10. Fora de escopo desta fase

Esta fase não executa:

- limpeza de código legado;
- deleção de arquivos;
- refatoração funcional;
- migration Supabase;
- purge de dados;
- warmup/enrichment TMDB;
- alteração em player;
- alteração em Android nativo;
- alteração em D-pad;
- alteração no importador Xtream.
