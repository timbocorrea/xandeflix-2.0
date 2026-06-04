# ANALISTA MESTRE — XANDEFLIX 2.0

## Guia de evolução segura após restauração da main estável

## 1. Base protegida

A `main` foi restaurada para o checkpoint funcional:

```text
9261c2a — docs: add firestick validation for mobile tmdb checkpoint
```

Essa é a nova base protegida do projeto.

Backup remoto da main anterior:

```text
backup/main-before-restore-20260604-092750
```

Branch de recuperação publicada:

```text
recovery/stable-9261c2a-plus-license-auth
```

## 2. Motivo da restauração

O projeto Xandeflix 2.0 sofreu regressões durante a tentativa de desmontar/mergear a PR #88 em múltiplos splits. A estratégia de auditoria por PRs pequenas acabou quebrando a versão estável porque partes sensíveis foram separadas fora da ordem funcional correta.

A partir deste ponto, a PR #88 antiga não deve mais ser tratada como fonte direta para merge. Ela pode ser usada apenas como referência pontual de commits ou trechos, sempre com auditoria e teste em dispositivo.

## 3. Regra absoluta

Toda evolução deve partir da main restaurada em `9261c2a`.

Não repetir a estratégia anterior de quebrar PR grande em vários splits sem preservar a ordem funcional.

Não fazer merge amplo sem validação em dispositivo.

Não alterar Catalog/Home/Séries, Player, Live TV, Admin, Supabase, Licensing, Capacitor ou rotas sem fase própria.

Auditoria deve gerar relatório, não patch automático.

## 4. Dispositivos de validação

Fire Stick:

```text
Serial ADB: G071CQ070344374G
Identificação: Amazon AFTSS / sheldon
```

Samsung:

```text
Serial ADB: RXGYB03FL4W
Modelo: Samsung SM-S926B
```

## 5. Fluxo obrigatório de trabalho

Trabalhar por ciclos pequenos:

1. Enviar apenas o bloco de comandos do ciclo atual.
2. Aguardar retorno do terminal.
3. Analisar o retorno.
4. Só então avançar.
5. Não antecipar múltiplas fases.
6. Não usar Python no terminal.
7. Usar Git Bash no Windows.
8. Usar `npx.cmd`, não `npx` puro, quando aplicável.

## 6. Validação inicial obrigatória

Antes de qualquer fase:

```bash
cd ~/Dropbox/xandeflix2.0

git fetch origin --prune
git switch main
git pull --ff-only origin main

git status -sb
git rev-parse --short HEAD
git rev-parse --short origin/main
```

A HEAD esperada deve ser:

```text
9261c2a
```

Se não estiver em `9261c2a`, parar e investigar.

## 7. Validações padrão

Para frontend/runtime:

```bash
npx.cmd --no-install tsc -b
npx.cmd --no-install vite build
```

Para Android:

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_SDK_ROOT="/c/Users/$USERNAME/AppData/Local/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"

npx.cmd cap sync android

cd android
./gradlew.bat assembleDebug
cd ..
```

APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Instalar no Fire Stick:

```bash
adb -s G071CQ070344374G install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Instalar no Samsung:

```bash
adb -s RXGYB03FL4W install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Abrir app:

```bash
adb -s SERIAL shell am force-stop com.xandeflix.app
adb -s SERIAL shell monkey -p com.xandeflix.app -c android.intent.category.LAUNCHER 1
```

## 8. Checklist funcional mínimo

Fire Stick:

- App abre.
- Home carrega.
- Hero carrega imagem e metadados sem demora excessiva.
- D-pad funciona.
- Sidebar funciona.
- Filmes abre.
- Séries abre.
- Ao Vivo abre.
- Player abre conteúdo.
- App não fecha.

Samsung/mobile:

- App abre.
- Home carrega.
- Filmes/Lançamentos mostra capas.
- Séries mostra hero e linhas com capas.
- Ao Vivo carrega.
- Player abre filmes.
- Layout mobile não quebra.
- Licença ativa sem HTTP 401.

## 9. Áreas sensíveis

Não alterar sem fase própria:

- Catalog/Home/Séries.
- Player.
- Live TV.
- Licensing/Supabase.
- Admin.
- Capacitor config.
- Rotas e navegação visível.

Regra de ouro: não adicionar botão ou rota visível para tela que ainda não carrega completamente.

## 10. Tipos de mudança

Tipo A — Correção pontual segura:

- 1 a 2 arquivos.
- Baixo risco.
- Sem fluxo crítico.

Tipo B — Fase funcional:

- 2 a 8 arquivos.
- Mesmo domínio.
- Exige teste em dispositivo.

Tipo C — Macrofase sensível:

- Catalog/Home/Séries.
- Player.
- Live TV.
- Licensing/Supabase.
- Admin.
- Exige plano, branch dedicada, APK e teste real.

Tipo D — Bloqueado:

- Mistura de domínios.
- Dependência de PR antiga não auditada.
- Merge amplo da PR #88 antiga.

## 11. Regras de Git

Permitido:

- Branch nova.
- Commit pequeno.
- Push de branch.
- Backup branch.
- Diff.
- Cherry-pick com `--no-commit`, se autorizado.

Proibido sem autorização explícita:

- Force push.
- Reset hard na main.
- Rebase.
- Squash amplo.
- Merge da PR #88 antiga.
- `git clean`.
- Apagar branches remotas.

## 12. Prioridade técnica após restauração

1. Confirmar licenciamento e corrigir HTTP 401, se ainda existir.
2. Corrigir player de filmes, sem mexer em séries ou Live TV junto.
3. Consolidar Séries.
4. Otimizar Hero/TMDB.
5. Só depois continuar Live TV/EPG/player universal.

## 13. Finalidade

Este documento existe para impedir que a base estável seja quebrada novamente.

A main restaurada em `9261c2a` é a nova base protegida.

Toda evolução deve partir dela, com validação em Fire Stick e Samsung quando afetar UI/runtime.
