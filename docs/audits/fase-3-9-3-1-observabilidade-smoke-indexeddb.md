# Xandeflix 2.0 - Auditoria de Observabilidade do Smoke Test IndexedDB (Fase 3.9.3.1)

## 1. Problema Encontrado no Logcat

Durante a execução e testes do APK contendo a implementação do smoke test do IndexedDB local (Fase 3.9.3), observou-se que a mensagem de resultado `XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT` não aparecia nos logs capturados via `adb logcat`.

### Causa Raiz
1. **Poluição de Mensagens do WebView:** O logcat ficou sobrecarregado com logs frequentes e repetidos do WebView referentes a `setRequestedFrameRate`.
2. **Severidade do Log:** As mensagens enviadas originalmente via `console.info` possuem nível de prioridade informativa baixo no motor Chromium integrado à WebView do Android. Sob condições de alto tráfego de logs ou filtros padrão do logcat, essas mensagens acabavam sendo suprimidas, descartadas ou difíceis de filtrar.
3. **Falta de Persistência:** Não havia persistência de fallback local. Uma vez que a inicialização do app ocorria e o logcat não capturava a linha de saída, a validação do teste tornava-se inconclusiva (sem confirmação positiva ou negativa).

---

## 2. Solução Aplicada

Para mitigar o problema e garantir observabilidade absoluta do teste de fumaça sem depender exclusivamente da estabilidade do console de tempo de execução no logcat, foram aplicadas duas estratégias complementares:

### A. Persistência Local (Fallback de Estado)
O resultado serializado do smoke test agora é persistido em `window.localStorage` sob uma chave de armazenamento dedicada e persistente.
- Caso o logcat falhe ou a tela passe rápido demais, o desenvolvedor pode depurar o dispositivo via Chrome DevTools (`chrome://inspect`) e consultar o resultado histórico diretamente no armazenamento do WebView.
- Falhas de gravação no `localStorage` (ex: cota excedida ou segurança) são tratadas para não interromper a inicialização do app, gravando apenas um sinalizador `storageWriteError` no resultado final do teste.

### B. Escalação da Severidade de Logs no WebView
Os marcadores de diagnóstico foram promovidos do nível `info` para níveis de severidade mais visíveis no WebView:
- **`console.warn`** é usado para o marcador de início do teste (`XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_START`) e para resultados bem-sucedidos (`XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT`).
- **`console.error`** é usado para qualquer falha identificada ou erro de importação.
- Isso assegura que o Capacitor/Android capture os logs com tags de aviso ou erro no `logcat`, destacando-os em relação ao ruído de fundo do WebView.

---

## 3. Chave LocalStorage Usada

A constante exportada para controle da gravação local é:

```typescript
export const LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY =
  'xandeflix:local-catalog-smoke:last-result';
```

### Estrutura do Objeto Gravado (JSON)
```json
{
  "ok": true,
  "insertedCount": 3,
  "liveCount": 1,
  "movieCount": 1,
  "seriesCount": 1,
  "stats": {
    "totalCount": 0,
    "liveCount": 0,
    "movieCount": 0,
    "seriesCount": 0
  },
  "createdAt": "2026-05-28T05:24:47.123Z",
  "sourceId": "smoke-test-source",
  "storageWriteError": undefined
}
```

---

## 4. Mudança de Severidade de Logs (console.info para console.warn/error)

### Início do Smoke Test
* **Antes:** Sem log de início específico.
* **Agora:** `console.warn('XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_START')`

### Sucesso do Smoke Test
* **Antes:** `console.info('XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT', result)`
* **Agora:** `console.warn('XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT', JSON.stringify(result))`

### Erro do Smoke Test
* **Antes:** `console.info('XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT', { ok: false, errorMessage })`
* **Agora:** `console.error('XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT', JSON.stringify(result))`

---

## 5. Arquivos Alterados

1. **`src/features/localCatalog/services/localCatalogSmokeTest.service.ts`**
   - Declaração e exportação de `LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY`.
   - Inclusão dos campos opcionais `createdAt`, `sourceId` e `storageWriteError` no tipo `LocalCatalogSmokeTestResult`.
   - Lógica de persistência em `window.localStorage` encapsulada em bloco `try-catch` resiliente.

2. **`src/features/catalog/pages/PreparingHomePage.tsx`**
   - Remoção de constante legada de prefixo de log.
   - Atualização de `runLocalCatalogSmokeTestInBackground` para emitir `XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_START`.
   - Serialização de resultado em string de JSON e encaminhamento para `console.warn` (se ok) ou `console.error` (se falhar).

---

## 6. Validações

Executar os seguintes testes de integridade para confirmar a estabilidade técnica:

```powershell
# 1. Verificar integridade do git e formatações de linhas
git status -sb
git diff --check

# 2. Compilar TypeScript
npx.cmd --no-install tsc -b

# 3. Compilar empacotamento Vite
npx.cmd --no-install vite build
```

### Guardrails de Isolamento
Confirmar que nenhuma chamada indevida foi introduzida ao Supabase ou áreas críticas de catálogo ativo:
```powershell
# Verificar que CatalogPage preserva "direct=1" intacto
grep -RInF "params.set('direct', '1')" src/features/catalog/pages/CatalogPage.tsx

# Confirmar presença dos novos marcadores e chaves nos fontes e documentações
grep -RIn "LOCAL_CATALOG_SMOKE_TEST_RESULT_STORAGE_KEY\|XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_RESULT\|XANDEFLIX_LOCAL_CATALOG_SMOKE_TEST_START" src docs

# Confirmar que a pasta localCatalog não faz nenhuma chamada ou importação ao Supabase/License cache
grep -RIn "get-client-license-channels\|license_channels_cache\|supabaseClient" src/features/localCatalog
```

---

## 7. Rollback

Para reverter completamente esta fase e retornar ao commit seguro `7137757` (adicionado na fase anterior de fumaça do IndexedDB):

```bash
# Descartar alterações nos arquivos de serviço e páginas de boot
git checkout -- src/features/localCatalog/services/localCatalogSmokeTest.service.ts
git checkout -- src/features/catalog/pages/PreparingHomePage.tsx

# Apagar este arquivo de auditoria
rm docs/audits/fase-3-9-3-1-observabilidade-smoke-indexeddb.md
```
