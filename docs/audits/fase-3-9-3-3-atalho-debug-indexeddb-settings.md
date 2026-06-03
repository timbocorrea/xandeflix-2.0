# Fase 3.9.3.3 - Atalho debug IndexedDB no Settings

Data: 2026-05-28
Branch: `fix/vod-episode-native-player-direct`
Ponto seguro de partida: `bb74832 test: add local catalog smoke debug route`

## Objetivo

Criar um atalho interno temporario e protegido por flag para acessar a rota React `/debug/local-catalog-smoke` pelo proprio app.

## Por que o atalho foi necessario

A rota `/debug/local-catalog-smoke` ja existia no React Router, mas a tentativa de abrir por intent externo com `http://localhost/debug/local-catalog-smoke` falhou porque o app nao possui intent-filter/deep link para essa URL. A tentativa via extras tambem nao navegou para a rota interna. Portanto, o caminho seguro nesta fase e navegar por dentro do React.

## Por que deep link externo nao foi usado

Deep link exigiria alterar `AndroidManifest`/intent filters ou fluxo nativo. Isso foi evitado porque a fase deve ser temporaria, debug-only e sem mexer em Android nativo.

## Flag usada

- `VITE_LOCAL_CATALOG_SMOKE_TEST=true`

Quando a flag esta falsa ou ausente, o atalho nao e renderizado.

## Arquivo alterado

- `src/features/settings/pages/SettingsPage.tsx`

## Rota de destino

- `/debug/local-catalog-smoke`

## Comportamento

Quando `VITE_LOCAL_CATALOG_SMOKE_TEST=true`, a tela Settings mostra o bloco:

- Titulo: `Diagnostico IndexedDB local`
- Descricao: `Executar smoke test local sem Supabase.`
- Acao: `navigate('/debug/local-catalog-smoke')`

O botao usa `FocusableButton`, mantendo compatibilidade com mouse, toque e D-pad.

## Garantias de isolamento

- Nao troca Home para IndexedDB.
- Nao troca Live TV para IndexedDB.
- Nao troca VOD para IndexedDB.
- Nao baixa playlist real.
- Nao chama Supabase.
- Nao altera Edge Functions.
- Nao altera `AndroidManifest` ou deep links.
- Nao mexe no Player, `UniversalPlayerPage` ou `NativePlayerActivity`.
- `direct=1` permanece fora do escopo.

## Temporario/debug-only

Este atalho existe apenas para validar o IndexedDB local no Android/WebView. Ele deve permanecer protegido por flag e pode ser removido apos a validacao da Fase 3.9.3.

## Rollback

```sh
git restore \
  src/features/settings/pages/SettingsPage.tsx \
  docs/audits/fase-3-9-3-3-atalho-debug-indexeddb-settings.md

git status -sb
```
