# RELATÓRIO FINAL — FASE 1.9
## Diagnóstico pré-merge + loading Live TV + splash inicial — Xandeflix 2.0

## 1. Contexto

Projeto: Xandeflix 2.0
Repositório: xandeflix4/xandeflix-2.0
Branch: feat/home-netflix-like-proportions
PR relacionada: #76 — feat: polish home tv proportions and dpad flow
Base da fase: pós-Fase 1.8, commit esperado 9909af6 — fix: add firestick loading placeholders

A Fase 1.9 foi executada após validação da Home no Fire Stick, com pendências visuais em Live TV, tela branca inicial/splash, erro WebView/AndroidX e validação parcial de rotas.

## 2. Objetivo

Diagnosticar mergeability, loading inicial da Live TV, splash/tela branca Android e erro WebView/AndroidX antes de qualquer merge.

A fase permitia apenas correção pontual mínima de feedback visual/loading/splash, sem criar funcionalidade nova.

## 3. Diagnóstico pré-merge

- Branch local confirmada: feat/home-netflix-like-proportions.
- HEAD local e remoto estavam sincronizados.
- Commit no topo confirmado: 9909af6.
- Comparação local x remoto: 0 0.
- Branch x main: divergente, com commits próprios da PR e main contendo alteração adicional.
- merge-tree não indicou conflito real nos trechos analisados.
- Nenhum merge foi executado.
- A PR #76 não foi fechada.

Observação: o working tree continha relatórios locais não rastreados em docs/audits e docs/audits/patches, já esperados pelo fluxo de auditoria.

## 4. Diagnóstico Live TV

### Problema observado

Ao entrar em Canais ao vivo, a tela parecia vazia/travada antes da grade aparecer.

### Causa provável

O componente LiveTvPage.tsx usava `isLoading = status === "loading"` para decidir se mostrava placeholders. Existia intervalo em que ainda não havia grupos/canais renderizados, mas o estado visual não exibia loading de forma suficiente.

### Correção aplicada

Foi criada uma condição visual mais abrangente:

- `shouldShowInitialLiveTvLoading`
- considera `isLoading`
- considera ausência simultânea de grupos e canais ativos
- não altera fluxo de player
- não altera seleção de canal
- não aplica preview inline
- não altera importação IPTV/Supabase/TMDB

Arquivo alterado:

- src/features/live/pages/LiveTvPage.tsx

Resumo do diff:

- 1 arquivo alterado
- 7 inserções
- 4 remoções
- mudança restrita ao feedback visual de loading/skeleton

## 5. Diagnóstico splash/tela branca

### Situação observada

A tela branca inicial continua aparecendo como tela de carregamento nativa do app antes do React/WebView completar o bootstrap.

### Diagnóstico técnico

- MainActivity usa `@style/AppTheme.NoActionBarLaunch`.
- `AppTheme.NoActionBarLaunch` usa `Theme.SplashScreen`.
- O background do splash aponta para `@drawable/splash`.
- O drawable atual é PNG e aparentemente claro/branco.
- Não foi alterado nesta fase para evitar edição cega de imagem/binário e risco Android desnecessário.

### Recomendação

Abrir fase própria para splash escuro nativo, preferencialmente substituindo/ajustando os recursos de splash de forma controlada e validando em Fire Stick.

## 6. Diagnóstico WebView/AndroidX

### Erro observado no logcat

O logcat segue registrando erro relacionado a:

- `androidx.window.extensions.core.util.function.Consumer`
- `WindowLayoutInfoListener`
- `AmazonWebView`
- `NoClassDefFoundError`
- `ClassNotFoundException`

### Avaliação

O app abriu, a Activity foi exibida e a navegação funcionou. Não houve crash imediato nem fechamento automático durante o teste manual.

Classificação nesta fase:

- Não fatal no cenário testado.
- Relacionado ao Amazon WebView / Fire OS / AndroidX Window.
- Não tratado nesta fase porque as regras proibiam troca de dependências AndroidX sem diagnóstico objetivo bloqueador.

### Recomendação

Criar fase própria para investigar AndroidX/WebView/Fire OS, sem misturar com PR #76.

## 7. Validações técnicas

- `git diff --check`: passou.
- `npx.cmd tsc -b`: passou.
- `npx.cmd vite build --emptyOutDir false`: passou.
- `npx.cmd cap sync android`: inicialmente falhou por EBUSY/lock do Windows/Dropbox, depois passou após liberar diretórios travados.
- `./gradlew.bat :app:assembleDebug`: passou.
- APK gerado: android/app/build/outputs/apk/debug/app-debug.apk.
- Instalação no Fire Stick G071EL1313720CJ0: passou.
- ADB install: sucesso.
- App launch: sucesso.

Observação operacional:

Durante a fase, o ambiente local não tinha `JAVA_HOME` configurado. Foi usado temporariamente o JBR do Android Studio:

`/c/Program Files/Android/Android Studio/jbr`

## 8. Checklist Fire Stick

- Splash/tela branca inicial: continua aparecendo como tela branca de carregamento nativa.
- Home: abre com placeholder e depois carrega dados reais.
- Tempo observado Home: aproximadamente 10 segundos.
- D-pad Home: funcionando.
- Live TV loading: agora aparece corretamente.
- Live TV: não parece mais vazia/travada durante o carregamento.
- Tempo observado Live TV: aproximadamente 10 segundos até grupos/canais.
- Grupos/canais: aparecem após o loading.
- App fechou sozinho: não.
- Logcat: sem FATAL EXCEPTION identificado no trecho filtrado.
- Erro AndroidX/WebView: continua aparecendo, porém não fatal no teste.
- /launches: não validado manualmente.
- /category/:groupSlug: não validado manualmente.

## 9. Pendência nova identificada

O usuário validou que Home e Live TV carregam corretamente, mas considera o tempo de aproximadamente 10 segundos alto. Foi solicitado carregamento instantâneo.

Essa demanda não deve ser resolvida dentro da Fase 1.9 porque exigiria nova estratégia de preload/cache antes da Home ou antes da abertura da grade Live TV, possivelmente no fluxo pós-login/licença.

Recomendação de próxima fase:

- Criar Fase 2.0 ou Fase 1.10 específica para performance percebida e preload controlado.
- Avaliar cache local/autorizado de Home e Live TV.
- Considerar preload após login/licença, antes de abrir a Home.
- Considerar evitar tela branca com splash escuro.
- Medir tempo de bootstrap, tempo até Home real e tempo até grade Live TV.
- Não reativar warmup VOD pesado sem estratégia controlada.

## 10. Status final Git

Alteração rastreada:

- src/features/live/pages/LiveTvPage.tsx

Arquivos não rastreados já existentes/relatórios:

- docs/audits/fase-1-1-isolamento-live-tv-e-pr76.md
- docs/audits/fase-1-2-auditoria-pr76-por-blocos.md
- docs/audits/fase-1-4-auditoria-pos-correcao-pr76.md
- docs/audits/fase-1-5-validacao-android-firestick-pr76.md
- docs/audits/fase-1-6-validacao-manual-firestick-pr76.md
- docs/audits/fase-1-8-reteste-firestick-loading-pr76.md
- docs/audits/fase-1-diagnostico-pr-76-estado-real.md
- docs/audits/patches/

## 11. Decisão recomendada

- [x] PR #76 pode seguir para auditoria final de merge após consolidação/commit da correção pontual e relatórios.
- [ ] PR #76 precisa de nova correção pontual obrigatória dentro da Fase 1.9.
- [ ] PR #76 deve ser dividida neste momento.
- [ ] PR #76 deve ser fechada/reconstruída.
- [x] Necessário investigar AndroidX/WebView em fase própria.
- [x] Necessário criar fase própria para performance percebida/preload/cache.
- [x] Necessário criar fase própria para splash escuro nativo.

Justificativa:

A correção de loading da Live TV foi validada no Fire Stick e não alterou fluxo de player, dados, Supabase, TMDB, importação IPTV ou warmup. O app permaneceu aberto e navegável. As pendências restantes são de performance percebida, splash nativo e warning/erro AndroidX-WebView, que devem ser tratadas separadamente para evitar escopo Frankenstein na PR #76.

## 12. Confirmações finais

- [x] Nenhum merge foi feito.
- [x] PR não foi fechada.
- [x] Patch Live TV local foi preservado.
- [x] Warmup não foi ligado.
- [x] Player não foi alterado.
- [x] Supabase/TMDB/importação IPTV não foram alterados.
- [x] Tablet Samsung não foi usado para instalação.
- [x] Fire Stick usado: G071EL1313720CJ0.
- [x] Relatório foi criado.

## 13. Conclusão executiva

A Fase 1.9 corrigiu com sucesso o feedback visual de loading da Live TV no Fire Stick. A tela de Live TV agora exibe mensagem e skeletons enquanto carrega grupos/canais, evitando percepção de tela vazia ou travada.

A Home e a Live TV carregam corretamente, mas ainda demoram cerca de 10 segundos para exibir dados reais. Essa otimização deve ser tratada em fase própria de preload/cache e performance percebida.

A tela branca inicial continua associada ao splash/boot nativo do app e deve ser tratada em fase própria. O erro AndroidX/WebView continua no logcat, mas não se mostrou fatal no teste executado.
