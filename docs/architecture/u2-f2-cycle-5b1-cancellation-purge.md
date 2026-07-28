# U2-F2 — Ciclo 5B1 — Cancelamento persistente e purge automático

## Escopo

Este ciclo adiciona:

- referência persistente à sessão sidecar ativa no runtime;
- cancelamento ao trocar de fonte, limpar o runtime ou desmontar o provider;
- propagação de falha quando o cancelamento persistente não pode ser salvo;
- purge automático dos dados parciais de snapshots cancelados;
- recuperação de staging abandonado antes de iniciar uma nova sessão;
- preservação do registro sanitizado do snapshot cancelado para auditoria;
- preservação de snapshots ativos e ready.

## Dados removidos no purge

- itens do snapshot;
- categorias do snapshot;
- documentos de pesquisa;
- tokens de pesquisa;
- checkpoint;
- métricas.

O registro em `importSnapshots` permanece com status `canceled`.

## Fora de escopo

- transporte web/Capacitor;
- remoção de playlist-proxy;
- catálogo paginado no React;
- alterações de player;
- deploy;
- promoção automática;
- ativação das flags.
