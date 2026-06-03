# Xandeflix 2.0 - Rota Protegida de Diagnóstico do Smoke Test IndexedDB (Fase 3.9.3.2)

## 1. Motivo da Rota

Embora o smoke test tenha sido implementado com sucesso na Fase 3.9.3 e aprimorado com maior severidade de logs e persistência local na Fase 3.9.3.1, a validação no APK físico permaneceu inconclusiva em alguns cenários. O logcat do WebView pode ser filtrado ou truncado pelo sistema operacional, e o acesso direto ao `localStorage` em aparelhos de TV (como Fire TV Stick) exige ponte de depuração USB/ADB ativa.

A criação de uma **página/rota de diagnóstico protegida** resolve essa lacuna de observabilidade, permitindo que qualquer desenvolvedor com controle físico do app execute e veja o resultado das queries do IndexedDB (abertura, inserção, listagem, cálculo de estatísticas e limpeza) formatado na própria tela, de forma visual e segura.

---

## 2. Hipótese do Smoke Test Não Disparar no Boot

Identificou-se que o smoke test automático em background (`runLocalCatalogSmokeTestInBackground`) disparado em `PreparingHomePage.tsx` pode não rodar em todas as inicializações do aplicativo por duas razões principais:

1. **Atalhos no Fluxo de Boot:** Se o aplicativo já possui uma licença ativada de forma estável na sessão atual e a inicialização ou a reabertura do app pula a rota `/preparing-home` (carregando diretamente `/` via roteador ou preservação de estado/hot reloading), a rotina do teste nunca é importada nem executada.
2. **Ciclo de Vida do Roteamento:** Em conexões persistentes ou restaurações rápidas de tela do Android WebView, o bootstrap pode resolver de forma síncrona ou ler do cache em níveis onde a página de carregamento (`PreparingHomePage`) passa rápido demais ou não monta a árvore completa de efeitos colaterais.

A criação da rota manual `/debug/local-catalog-smoke` garante que possamos disparar o teste sob demanda em qualquer momento do ciclo de vida da aplicação.

---

## 3. Flag de Proteção Usada

A rota de depuração está protegida tanto no empacotamento quanto no roteador de tempo de execução pela flag:

```env
VITE_LOCAL_CATALOG_SMOKE_TEST=true
```

No arquivo `src/config/env.ts`, essa flag está mapeada para a propriedade:
```typescript
env.localCatalogSmokeTestEnabled
```

### Comportamento de Segurança:
* **Se `true`:** A rota `/debug/local-catalog-smoke` é montada no React Router e o componente correspondente é importado dinamicamente via `lazy`.
* **Se `false` (padrão em produção):** A rota sequer é compilada ou registrada no roteador. Qualquer tentativa de acesso à URL `/debug/local-catalog-smoke` cairá na rota padrão de fallback (`*`), redirecionando silenciosamente para a página principal (`/`).

---

## 4. Arquivos Criados/Alterados

* **`[NEW]`** [LocalCatalogSmokeTestPage.tsx](file:///c:/Users/Alexandre-Janaina/Dropbox/xandeflix2.0/src/features/localCatalog/pages/LocalCatalogSmokeTestPage.tsx)
  * Página do painel de diagnóstico com layout dark premium, compatível com D-pad (spatial navigation) e exibição síncrona dos resultados da execução direta e do `localStorage`.
* **`[MODIFY]`** [routes.tsx](file:///c:/Users/Alexandre-Janaina/Dropbox/xandeflix2.0/src/app/routes.tsx)
  * Importação do objeto de configuração `env` e importação dinâmica via `lazy()` da página de fumaça.
  * Inserção da rota condicional `<Route path="/debug/local-catalog-smoke" ... />` protegida por `env.localCatalogSmokeTestEnabled`.

---

## 5. Como Validar no App

1. Confirme que a flag está ativa no arquivo `.env.local` de build do WebView:
   ```env
   VITE_LOCAL_CATALOG_SMOKE_TEST=true
   ```
2. Abra a aplicação no navegador ou empacotador.
3. Acesse a URL: `/debug/local-catalog-smoke`.
4. Você verá a interface dark premium "Smoke Test IndexedDB Local".
5. Clique no botão **"Executar smoke test IndexedDB"**:
   * O aplicativo executará o teste em tempo de execução.
   * A janela **"Última Execução Direta"** exibirá o JSON formatado com `ok: true`, quantidade de itens inseridos, estatísticas e listagens.
6. A janela **"Persistido no LocalStorage"** será atualizada logo em seguida com o resultado gravado na chave `xandeflix:local-catalog-smoke:last-result`.
7. Clique em **"Recarregar resultado salvo"** para forçar a releitura do `localStorage` e garantir que o armazenamento persiste o estado mesmo após recarregar a página.

---

## 6. Garantias de Isolamento

* **Banco de Dados Isolado:** As operações de escrita e deleção operam exclusivamente sob o escopo do banco `xandeflix:local-catalog`, utilizando itens fictícios gerados com o prefixo `smoke-test-source` e o grupo `Smoke Test Local Catalog`.
* **Nenhum Envolvimento com Supabase:** O código de teste de fumaça não possui importação ou referência ao `supabaseClient`, nem envia dados a endpoints remotos do Supabase.
* **Segurança do Catálogo Ativo:** Nenhum fluxo da Home, Live TV ou Player do app de produção consome ou exibe dados fictícios deste teste, garantindo 100% de isolamento funcional.

---

## 7. Rollback

Para reverter completamente esta fase e retornar ao commit seguro `f42c4a2`:

```bash
# Descartar alterações de rotas
git checkout -- src/app/routes.tsx

# Apagar a página e a documentação criadas
rm src/features/localCatalog/pages/LocalCatalogSmokeTestPage.tsx
rm docs/audits/fase-3-9-3-2-rota-debug-smoke-indexeddb.md
```

## Confirmação explícita de isolamento

A rota `/debug/local-catalog-smoke` é exclusiva para diagnóstico do IndexedDB local.

Não houve troca de leitura da Home para IndexedDB.
Não houve troca de leitura da Live TV para IndexedDB.
Não houve troca de leitura do VOD para IndexedDB.
Não houve alteração no Player.
Não houve chamada ao Supabase dentro de `src/features/localCatalog`.
Não houve referência a `license_channels_cache` dentro de `src/features/localCatalog`.
Não houve chamada a `get-client-license-channels` dentro de `src/features/localCatalog`.
Não houve alteração em Edge Functions.
Não houve alteração em migrations.
Não houve alteração ou exclusão de dados remotos.
