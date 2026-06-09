# Fase 3B - Live TV Tablet UI e Fechamento do Live Reload

Data/hora local: 2026-06-08 18:40:25 -03:00

Branch: `fix/live-tv-tablet-portrait-pos-fase3`

## Objetivo da fase

Auditar o estado atual das alterações visuais de Live TV/tablet, registrar os arquivos modificados, remover o Live Reload temporário e devolver o projeto ao modo normal de APK instalável, validando TypeScript, diff, build web, sincronização Capacitor/Android e APK debug.

## Contexto do Live Reload

Durante a validação visual em tablet, o projeto estava com Live Reload temporário ativo em `capacitor.config.ts` e propagado para `android/app/src/main/assets/capacitor.config.json`, apontando para `http://localhost:5173` com `cleartext: true`. Também havia `.tmp/vite.live.config.ts` para servir o Vite em `0.0.0.0:5173`.

Esse Live Reload era temporário, usado apenas para validação visual rápida no dispositivo, e não deve permanecer em um APK instalável normal.

## Confirmações iniciais

- Diretório de trabalho: `C:\Users\Alexandre-Janaina\Dropbox\xandeflix2.0`
- Git toplevel: `C:/Users/Alexandre-Janaina/Dropbox/xandeflix2.0`
- Branch atual: `fix/live-tv-tablet-portrait-pos-fase3`
- Status inicial:

```text
## fix/live-tv-tablet-portrait-pos-fase3
 M capacitor.config.ts
 M src/components/layout/AppShell.tsx
 M src/components/layout/TvSidebar.tsx
 M src/features/live/pages/LiveTvPage.tsx
 M src/styles/globals.css
?? .tmp/
?? tablet-after-back.png
?? tablet-after-reverse.png
?? tablet-filmes-check.png
?? tablet-filmes-highlight-final.png
?? tablet-filmes-highlight.png
?? tablet-sidebar-check.png
```

## Arquivos alterados

`git diff --name-status`:

```text
M	capacitor.config.ts
M	src/components/layout/AppShell.tsx
M	src/components/layout/TvSidebar.tsx
M	src/features/live/pages/LiveTvPage.tsx
M	src/styles/globals.css
```

`git diff --stat` inicial:

```text
 capacitor.config.ts                    |   4 +
 src/components/layout/AppShell.tsx     |  35 +++++-
 src/components/layout/TvSidebar.tsx    |  24 +++-
 src/features/live/pages/LiveTvPage.tsx | 197 ++++++++++++++++++++++++++-------
 src/styles/globals.css                 | 141 +++++++++++++++++++++--
 5 files changed, 348 insertions(+), 53 deletions(-)
```

Arquivos untracked relevantes:

- `.tmp/vite.live.config.ts`
- `.tmp/live-tv-device-screen-*.png`
- `.tmp/live-tv-screen-check.png`
- Screenshots de validação na raiz: `tablet-*.png`

## Resumo técnico por arquivo

### `capacitor.config.ts`

Continha bloco temporário de Live Reload:

```ts
server: {
  url: 'http://localhost:5173',
  cleartext: true,
},
```

Plano: remover o bloco `server` para que o APK use os assets locais em `dist`/`android/app/src/main/assets/public`.

### `android/app/src/main/assets/capacitor.config.json`

Arquivo gerado pelo Capacitor que também continha `server.url` apontando para `http://localhost:5173` e `cleartext: true`.

Plano: remover a chave `server` quando apontar para `localhost:5173`, e depois rodar `cap sync android` para regenerar assets locais corretamente.

### `src/components/layout/AppShell.tsx`

Inclui detecção mais robusta de tablet/touch/orientação usando `visualViewport`, `screen.orientation`, `matchMedia('(orientation: portrait)')` e `navigator.maxTouchPoints`. Também expõe atributos `data-*` para CSS condicional:

- `data-device-touch-capable`
- `data-device-orientation`
- `data-device-tablet-portrait-touch`
- `data-visual-viewport-width`
- `data-visual-viewport-height`

### `src/features/live/pages/LiveTvPage.tsx`

Inclui ajustes de layout e preview para tablet/touch:

- leitura de altura da status bar via `@capacitor/status-bar`;
- cálculo de layout do preview nativo com compensação de status bar;
- modo tablet portrait touch usando dados de viewport em runtime;
- labels de grupos com prefixo `Canais |` removido na UI;
- ajuste do título de coluna para o grupo ativo;
- remoção visual de borda do preview quando não está carregando/reproduzindo;
- refinamento visual do título do preview.

### `src/styles/globals.css`

Inclui estilos visuais para Live TV em tablet/touch:

- seletor baseado em `data-device-tablet-portrait-touch`;
- correções de sticky/top inset;
- espaçamento de chips;
- preview mobile/tablet;
- selects mobile;
- ajustes de landscape touch;
- destaque de foco em grupos/canais;
- aumento e cor do título do preview.

Nenhum bloco com comentário `TEMP HMR TEST - REMOVE AFTER VALIDATION` foi encontrado nesta auditoria inicial.

### `src/components/layout/TvSidebar.tsx`

Alteração visual aprovada hoje para destacar o item ativo do sidebar no tablet:

- usa `useLocation`;
- define rotas ativas por item;
- destaca Filmes em `/category/filmes`, subcategorias `/category/filmes...` e `/category/movie-detail`;
- aplica fundo vermelho, ícone branco e sombra no item ativo;
- adiciona `aria-current="page"`.

## Ajustes visuais realizados

- Live TV: refinamentos para tablet/touch, orientação portrait/landscape, status bar e preview inline.
- Sidebar tablet: ícone da página ativa em destaque com cor diferente; validado visualmente no tablet para a página Filmes.

## Validações executadas antes da limpeza

- `pwd`: OK.
- `git rev-parse --show-toplevel`: OK.
- `git branch --show-current`: OK, branch esperada.
- `git status -sb`: OK, com alterações listadas acima.
- `git diff --stat`: OK.
- `git diff --name-status`: OK.
- Diffs individuais auditados para:
  - `src/components/layout/AppShell.tsx`
  - `src/features/live/pages/LiveTvPage.tsx`
  - `src/styles/globals.css`
  - `src/components/layout/TvSidebar.tsx`
  - `capacitor.config.ts`
  - `android/app/src/main/assets/capacitor.config.json`

## Riscos encontrados

- Live Reload ativo em configuração Capacitor impede um APK normal de funcionar sem Vite/localhost/ADB reverse.
- `.tmp/` contém arquivo de Vite live e screenshots temporários de validação.
- Screenshots `tablet-*.png` na raiz são artefatos de teste e não fazem parte do produto.
- Há avisos de conversão LF/CRLF em arquivos modificados reportados pelo Git.

## Confirmação sobre Live Reload temporário

Confirmado: o Live Reload era temporário e estava limitado às configurações Capacitor e `.tmp/vite.live.config.ts`. Ele deve ser removido antes do fechamento.

## Plano de limpeza aplicado

Status: bloqueado durante a remoção de `.tmp/`.

Ações aplicadas antes do bloqueio:

- Removido `server.url` e `cleartext` de `capacitor.config.ts`.
- Removida a chave `server` de `android/app/src/main/assets/capacitor.config.json` quando apontava para `http://localhost:5173`.
- Nenhum ajuste visual real foi removido.

Ação bloqueada:

- Remoção de `.tmp/`.

Erro exato:

```text
Remove-Item : Não é possível remover o item C:\Users\Alexandre-Janaina\Dropbox\xandeflix2.0\.tmp: O processo não pode
acessar o arquivo 'C:\Users\Alexandre-Janaina\Dropbox\xandeflix2.0\.tmp' porque ele está sendo usado por outro
processo.
No linha:2 caractere:177
+ ... h($repo)) { Remove-Item -LiteralPath $tmpPath.Path -Recurse -Force }  ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : WriteError: (C:\Users\Alexan...ndeflix2.0\.tmp:DirectoryInfo) [Remove-Item], IOException
    + FullyQualifiedErrorId : RemoveFileSystemItemIOError,Microsoft.PowerShell.Commands.RemoveItemCommand
```

Por regra operacional, a execução foi interrompida sem tentar soluções amplas, sem `taskkill`, sem `Stop-Process`, sem commit, sem push e sem stash.

## Confirmação final se o sistema voltou para APK instalável

Status: bloqueado antes das validações finais.

Observação: os blocos de Live Reload foram removidos dos dois arquivos de configuração editados antes do bloqueio, mas a etapa completa não foi concluída porque `.tmp/` permaneceu bloqueada por outro processo.

## Pendências para próxima sessão

- Remover `.tmp/` quando o processo que segura a pasta liberar o handle.
- Reexecutar a busca por `localhost:5173`, `server.url` e `cleartext` em configs ativas.
- Rodar `npx.cmd --no-install tsc -b`.
- Rodar `git diff --check`.
- Rodar `npx.cmd --no-install vite build`.
- Rodar `npx.cmd --no-install cap sync android`.
- Confirmar assets Android locais.
- Gerar APK debug com JDK 21.

## Arquivos que NÃO devem ser commitados com Live Reload

- `capacitor.config.ts` contendo `server.url = 'http://localhost:5173'`.
- `android/app/src/main/assets/capacitor.config.json` contendo `server.url` ou `localhost:5173`.
- `.tmp/vite.live.config.ts`.
- Artefatos temporários `.tmp/live-tv-*.png`.
- Screenshots temporários `tablet-*.png`.

## Checklist final para o Analista Mestre

- [ ] Confirmar que não existe `localhost:5173` em config ativa.
- [ ] Confirmar que `capacitor.config.ts` não tem bloco `server`.
- [ ] Confirmar que `android/app/src/main/assets/capacitor.config.json` não tem `server.url` nem `cleartext`.
- [ ] Confirmar TypeScript com `npx.cmd --no-install tsc -b`.
- [ ] Confirmar whitespace com `git diff --check`.
- [ ] Confirmar build web com `npx.cmd --no-install vite build`.
- [ ] Confirmar `npx.cmd --no-install cap sync android`.
- [ ] Confirmar existência de `android/app/src/main/assets/public/index.html`.
- [ ] Confirmar existência de `android/app/src/main/assets/public/assets`.
- [ ] Confirmar APK debug em `android/app/build/outputs/apk/debug/app-debug.apk`.
- [ ] Confirmar `git status -sb` final.
- [ ] Confirmar `git diff --stat` final.

## Resultado final

Status final: `FECHAMENTO_BLOQUEADO_COM_ERRO`.

Validações OK/FALHA:

- Confirmação de pasta/branch/status: OK.
- Auditoria de diff: OK.
- Relatório inicial: OK.
- Remoção de `server` em `capacitor.config.ts`: OK.
- Remoção de `server` em `android/app/src/main/assets/capacitor.config.json`: OK.
- Remoção de `.tmp/`: FALHA, pasta em uso por outro processo.
- TypeScript: não executado por bloqueio.
- `git diff --check`: não executado por bloqueio.
- Build web: não executado por bloqueio.
- `cap sync android`: não executado por bloqueio.
- APK debug: não executado por bloqueio.

APK gerado: não nesta etapa de fechamento; a execução foi interrompida antes do build Android final.

Sistema livre de Live Reload: parcial. Configs editadas foram limpas, mas a validação final não foi executada e `.tmp/` não foi removida por bloqueio de arquivo.

Lista final de arquivos modificados no momento do bloqueio:

- `capacitor.config.ts`
- `android/app/src/main/assets/capacitor.config.json`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/TvSidebar.tsx`
- `src/features/live/pages/LiveTvPage.tsx`
- `src/styles/globals.css`
- `docs/audits/fase-3b-live-tv-tablet-ui-live-reload-fechamento.md`

## Complemento de fechamento final

Data/hora do complemento: 2026-06-08 18:59:30 -0300

- Remo??o de .tmp: OK_REMOVIDA_OU_INEXISTENTE
- Live Reload em configs ativos: OK_LIMPO
- TypeScript: 0
- Diff check: 0
- Vite build: 0
- Cap sync android: 0
- Android build: 0
- APK debug: android/app/build/outputs/apk/debug/app-debug.apk

### Status Git ap?s complemento

```text
## fix/live-tv-tablet-portrait-pos-fase3
 M capacitor.config.ts
 M src/components/layout/AppShell.tsx
 M src/components/layout/TvSidebar.tsx
 M src/features/live/pages/LiveTvPage.tsx
 M src/styles/globals.css
?? docs/audits/fase-3b-live-tv-tablet-ui-live-reload-fechamento.md
?? tablet-after-back.png
?? tablet-after-reverse.png
?? tablet-filmes-check.png
?? tablet-filmes-highlight-final.png
?? tablet-filmes-highlight.png
?? tablet-sidebar-check.png
```

### Diff stat ap?s complemento

```text
 src/components/layout/AppShell.tsx     |  35 +++++-
 src/components/layout/TvSidebar.tsx    |  24 +++-
 src/features/live/pages/LiveTvPage.tsx | 197 ++++++++++++++++++++++++++-------
 src/styles/globals.css                 | 141 +++++++++++++++++++++--
 4 files changed, 344 insertions(+), 53 deletions(-)
```

Resultado do complemento: FECHAMENTO_CONCLUIDO_SEM_COMMIT

## Complemento de limpeza final pós-auditoria

Data/hora: 2026-06-09 07:48:31 -0300

Após a auditoria final, foram aplicadas limpezas residuais sem alterar os ajustes visuais reais:

- `capacitor.config.ts` foi restaurado porque não possuía diff real, apenas marcação residual de linha/CRLF.
- Screenshots temporários `tablet-*.png` foram removidos da raiz.
- Live Reload permaneceu ausente dos configs ativos.
- Arquivos finais previstos para commit: AppShell, TvSidebar, LiveTvPage, globals.css e este relatório.

### Status Git após limpeza final

```text
## fix/live-tv-tablet-portrait-pos-fase3
 M src/components/layout/AppShell.tsx
 M src/components/layout/TvSidebar.tsx
 M src/features/live/pages/LiveTvPage.tsx
 M src/styles/globals.css
?? docs/audits/fase-3b-live-tv-tablet-ui-live-reload-fechamento.md
```

### Diff stat após limpeza final

```text
 src/components/layout/AppShell.tsx     |  35 +++++-
 src/components/layout/TvSidebar.tsx    |  24 +++-
 src/features/live/pages/LiveTvPage.tsx | 197 ++++++++++++++++++++++++++-------
 src/styles/globals.css                 | 141 +++++++++++++++++++++--
 4 files changed, 344 insertions(+), 53 deletions(-)
```
