# Diagnostico Fire Stick / Capacitor / WebView - Fase 4.11-FireStick-0

## 1. Objetivo

Diagnosticar por que o app Android `com.xandeflix.app` nao abre corretamente no Fire Stick e validar o fluxo tecnico:

```bash
npm run build
npx.cmd cap sync android
cd android
./gradlew.bat :app:assembleDebug
```

Esta fase ficou restrita ao diagnostico Android/Capacitor/WebView e a uma correcao minima de dependencia nativa. Nao houve alteracao em Live TV, UI/UX, Supabase, Edge Functions, migrations, player/runtime JavaScript, regras de licenciamento ou self-service IPTV.

## 2. Logcat informado

O logcat informado indica que o processo do app inicia, o Capacitor entra em `BridgeActivity.onCreate`, a bridge tenta carregar o WebView e o Amazon WebView/Chromium falha com classe ausente:

```text
NoClassDefFoundError: androidx.window.extensions.core.util.function.Consumer
ClassNotFoundException: Didn't find class "androidx.window.extensions.core.util.function.Consumer"
```

Tambem apareceu aviso de frames pulados:

```text
Skipped 136 frames! The application may be doing too much work on its main thread.
```

Esse aviso pode indicar carga inicial pesada, mas o erro bloqueante com evidencia objetiva e a classe AndroidX Window ausente durante a inicializacao do WebView.

## 3. Hipotese principal

A hipotese principal e incompatibilidade/ausencia de dependencia AndroidX Window esperada pelo Amazon WebView/Chromium no Fire Stick.

Evidencias encontradas:

- O erro cita explicitamente `androidx.window.extensions.core.util.function.Consumer`.
- A busca por `androidx.window`, `window-java` e `window:` em `android`, `package.json` e `package-lock.json` nao encontrou dependencias AndroidX Window configuradas.
- O app usa Capacitor Android `8.3.1` e AndroidX WebKit `1.14.0`, mas nao havia dependencia explicita `androidx.window:window` nem `androidx.window:window-java`.
- O `applicationId` esta correto como `com.xandeflix.app` e nao foi alterado.

## 4. Arquivos Android/Capacitor inspecionados

Arquivos revisados:

- `capacitor.config.ts`
- `package.json`
- `android/variables.gradle`
- `android/build.gradle`
- `android/app/build.gradle`
- `android/app/src/main/java/com/xandeflix/app/MainActivity.java`

Configuracao Capacitor confirmada:

- `appId`: `com.xandeflix.app`
- `appName`: `Xandeflix`
- `webDir`: `dist`
- Android usa `scheme: https`
- `loggingBehavior: none`

## 5. Diagnostico Gradle

Estado relevante antes da correcao:

- `compileSdkVersion`: `36`
- `targetSdkVersion`: `36`
- `minSdkVersion`: `24`
- Android Gradle Plugin: `8.13.0`
- `androidxWebkitVersion`: `1.14.0`
- `media3Version`: `1.5.1`
- Nao havia `androidx.window`.

Ambiente local:

- Node: `v24.15.0`
- `npm.ps1` foi bloqueado pelo PowerShell, entao os comandos foram executados com `npm.cmd`.
- `java` nao estava no `PATH`.
- Foi usado Java do Android Studio JBR temporariamente:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
```

Versao Java usada no build Android:

```text
openjdk version "21.0.10"
OpenJDK Runtime Environment (build 21.0.10+-13289442-b895.109)
```

Observacoes de build:

- `npm.cmd install` passou.
- `npm.cmd run build` passou.
- `npx.cmd cap sync android` teve uma falha inicial por lock `EBUSY` em pasta Android gerada, e passou na tentativa seguinte.
- O Gradle falhou inicialmente sem `JAVA_HOME`.
- Com Android Studio JBR configurado, `./gradlew.bat clean` e `./gradlew.bat :app:assembleDebug` passaram.
- Apos a correcao, houve lock temporario do Dropbox/Windows em `android/app/build`, mas o `assembleDebug` passou na tentativa seguinte.

## 6. Diagnostico MainActivity

`MainActivity.java` foi revisado e nao foi alterado.

Pontos observados:

- A activity estende `BridgeActivity`.
- Registra `NativeAndroidPlayerPlugin`.
- Chama `super.onCreate(savedInstanceState)`.
- Executa `setupWebView` com atraso de 1000 ms.
- Usa `getBridge().getWebView()`.
- Configura foco do WebView para evitar interferencia visual.
- Intercepta eventos D-pad/Enter/Button A e injeta eventos JavaScript.

Nao houve evidencia no log informado de crash causado diretamente por `MainActivity`. Por isso, nao foram adicionados logs nativos nem alteracoes de foco/D-pad nesta fase.

## 7. Correcao aplicada, se houver

Foi aplicada correcao minima em Gradle para disponibilizar AndroidX Window ao APK:

Em `android/variables.gradle`:

```gradle
androidxWindowVersion = '1.3.0'
```

Em `android/app/build.gradle`:

```gradle
implementation "androidx.window:window:$androidxWindowVersion"
implementation "androidx.window:window-java:$androidxWindowVersion"
```

Justificativa:

- O logcat aponta classe ausente do ecossistema AndroidX Window.
- A dependencia nao existia no projeto.
- A correcao e restrita a dependencias Android nativas.
- Nao altera `compileSdk`, `targetSdk`, `minSdk`, `applicationId`, Capacitor, Media3, player JavaScript, UI, backend ou regras de licenciamento.

## 8. Builds executados

Comandos executados durante o diagnostico:

```bash
npm.cmd install
npm.cmd run build
npx.cmd cap sync android
cd android
./gradlew.bat clean
./gradlew.bat :app:assembleDebug
cd ..
```

Resultados relevantes:

- `npx.cmd tsc -b` passou com exit code `0`.
- Web build passou.
- `cap sync android` passou apos retry por lock temporario.
- `assembleDebug` passou com Java do Android Studio JBR.
- Apos a correcao AndroidX Window, o build Android debug passou novamente apos retry por lock temporario do Dropbox/Windows.
- Validacao final apos o relatorio:
  - `npx.cmd tsc -b`: exit code `0`.
  - `npm.cmd run build`: exit code `0`.
  - `npx.cmd cap sync android`: exit code `0`.
  - `./gradlew.bat :app:assembleDebug`: exit code `0`.

## 9. APK debug gerado

APK debug gerado em:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Ultima validacao local:

```text
app-debug.apk - 8.222.527 bytes
```

Esse APK deve ser usado no teste real do Fire Stick antes de qualquer nova alteracao funcional.

## 10. Como instalar e testar no Fire Stick

No Git Bash/Windows, com o Fire Stick conectado via ADB:

```bash
cd ~/Dropbox/xandeflix2.0/android

echo "=== INSTALAR APK DEBUG NO FIRE STICK ==="
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
echo "ADB_INSTALL_EXIT_CODE=$?"

echo ""
echo "=== ABRIR APP ==="
adb shell monkey -p com.xandeflix.app -c android.intent.category.LAUNCHER 1
echo "ADB_LAUNCH_EXIT_CODE=$?"
```

Se houver mais de um device conectado, usar `adb -s SERIAL_DO_FIRE_STICK ...`.

## 11. Como coletar novo logcat

Coleta filtrada direta:

```bash
echo "=== LOGCAT XANDEFLIX / CAPACITOR / WEBVIEW ==="
adb logcat -c
adb shell monkey -p com.xandeflix.app -c android.intent.category.LAUNCHER 1
adb logcat -d | grep -Ei "xandeflix|capacitor|Bridge|AndroidRuntime|FATAL EXCEPTION|NoClassDefFoundError|ClassNotFoundException|AmazonWebView|Chromium|cr_AWV|WebView|Skipped"
```

Se o volume do logcat dificultar o filtro direto:

```bash
adb logcat -d > firestick-xandeflix-boot.log
grep -Ei "xandeflix|capacitor|Bridge|AndroidRuntime|FATAL EXCEPTION|NoClassDefFoundError|ClassNotFoundException|AmazonWebView|Chromium|cr_AWV|WebView|Skipped" firestick-xandeflix-boot.log
```

Nao commitar `firestick-xandeflix-boot.log`.

## 12. Proximos passos conforme resultado do teste

Se o app abrir no Fire Stick:

- Confirmar que o erro `androidx.window.extensions.core.util.function.Consumer` desapareceu.
- Prosseguir com homologacao basica de boot, ativacao e navegacao inicial.

Se o app ainda nao abrir:

- Coletar novo logcat com os filtros acima.
- Verificar se ainda aparece `NoClassDefFoundError` ou se surgiu novo erro nativo.
- Se o erro migrar para travamento de main thread ou foco/WebView, abrir fase curta para instrumentar `MainActivity` com logs nativos e guards pontuais.

Se aparecer apenas lentidao/`Skipped frames`:

- Tratar separadamente como otimizacao de carga inicial do app, sem misturar com a correcao de dependencia AndroidX Window.

## 13. Conclusao

A causa mais provavel do boot quebrado no Fire Stick e ausencia de AndroidX Window no APK, exigida pelo Amazon WebView/Chromium do dispositivo.

Foi aplicada uma correcao minima adicionando `androidx.window:window` e `androidx.window:window-java` na camada Android. O escopo funcional do app foi preservado: sem alteracao em Live TV, UI/UX, Supabase, Edge Functions, migrations, player/runtime JavaScript, regras de licenciamento ou self-service IPTV.

O proximo passo obrigatorio e instalar o APK debug no Fire Stick e retornar com novo logcat caso o app ainda nao abra corretamente.
