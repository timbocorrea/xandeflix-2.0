# SECURITY LGPD — Ciclo 1 — Inventário inicial

## Status

- Branch: `fix/security-lgpd-access-hardening`
- Base: `main`
- Objetivo: iniciar a frente isolada de auditoria geral de segurança e adequação LGPD sem alterar comportamento funcional do app.
- Escopo deste ciclo: inventário inicial de rotas, autenticação, licenciamento, cache, Edge Functions e primeiros riscos de exposição.

## Marco zero

Este ciclo parte do relatório de contexto da Auditoria Geral de Segurança e Adequação LGPD do Xandeflix 2.0.

Regra mestre adotada:

```text
NENHUM_USUARIO_NAO_AUTENTICADO_PODE_CONSUMIR_CONTEUDO
NENHUM_USUARIO_SEM_LICENCA_ATIVA_PODE_CONSUMIR_CONTEUDO
NENHUM_USUARIO_COMUM_PODE_ACESSAR_DADOS_ADMINISTRATIVOS
NENHUMA_ROTA_FRONTEND_PODE_SER_A_UNICA_BARREIRA_DE_SEGURANCA
NENHUMA_EDGE_FUNCTION_SENSIVEL_PODE_CONFIAR_APENAS_NO_CLIENTE
NENHUMA_TABELA_COM_DADO_SENSIVEL_PODE_FICAR_SEM_RLS_E_POLICY_RESTRITIVA
```

## Inventário inicial confirmado no código

### Rotas públicas

- `/login`
- `/admin/login`
- `/preparing-home`
- `/debug/local-catalog-smoke`, apenas quando flag de ambiente estiver ativa

### Rotas protegidas por licença no front

- `/`
- `/launches`
- `/category/:groupSlug`
- `/live`
- `/player`
- `/settings`
- `/playlists/direct-source`

### Rotas administrativas protegidas no front

- `/admin`
- `/admin/clients`
- `/admin/devices`
- `/admin/licenses`
- `/admin/playback-sessions`
- `/admin/license-channels`
- `/admin/iptv-sources`

### Rotas Super Admin no front

- `/admin/app-installations`
- `/admin/app-installations/:installationId`
- `/admin/admin-users`
- `/admin/license-imports`
- `/admin/audit-logs`

## Achados iniciais

### Risco crítico — guard de licença dependente de localStorage

O `LicenseRoute` bloqueia a navegação apenas quando não há `licenseCode` ou `deviceIdentifier` armazenados localmente. Isso é insuficiente como barreira de segurança, porque a existência local desses valores não prova que a licença, o cliente, o dispositivo ou a instalação continuam ativos no servidor.

Correção recomendada em próximo ciclo:

- criar validação server-authoritative de acesso antes de liberar conteúdo;
- invalidar cache/localStorage quando a validação falhar;
- exibir estado seguro de bloqueio ou redirecionamento;
- manter fallback visual sem renderizar catálogo sensível.

### Risco crítico — cache VOD local pode hidratar conteúdo antes de revalidação

A Home pode ser hidratada a partir de cache persistente de VOD em `localStorage` com TTL de 12 horas. Para LGPD e controle de acesso, cache local precisa depender de validação recente de licença/dispositivo e deve ser limpo em logout, troca de licença, licença revogada, dispositivo bloqueado ou falha 401/403.

Correção recomendada em próximo ciclo:

- centralizar purge de caches sensíveis;
- associar cache à validação server-authoritative;
- não permitir cache como bypass offline de licença.

### Risco alto — Edge Function de conteúdo retorna stream_url

`get-client-license-channels` valida `licenseCode` e `deviceIdentifier`, mas retorna `stream_url` nos itens autorizados. Isso é necessário para playback no modelo atual, porém exige que a função seja protegida por validação robusta, rate limit, logs sanitizados, CORS restrito e respostas de erro sem detalhes sensíveis.

Correção recomendada em próximo ciclo:

- endurecer CORS;
- remover detalhes crus de erro;
- avaliar JWT ou token efêmero de licença;
- registrar auditoria sanitizada de chamadas críticas;
- validar limites e bloqueios antes de retornar canais.

### Risco alto — CORS amplo em Edge Functions

Foram identificadas Edge Functions com `Access-Control-Allow-Origin: *`. Para produção, funções sensíveis devem usar allowlist por origem controlada e responder `OPTIONS` sem expor dados.

Correção recomendada em próximo ciclo:

- criar helper comum de CORS seguro;
- restringir origens de produção;
- manter compatibilidade local/dev explicitamente.

### Risco alto — erros crus retornados ao cliente

Há retornos com `details: error.message` ou serialização de erro Supabase. Isso pode expor detalhes internos de banco, policies, nomes de campos, constraints ou pistas operacionais.

Correção recomendada em próximo ciclo:

- trocar detalhes externos por códigos sanitizados;
- manter detalhes apenas em logs internos sanitizados;
- nunca retornar stack trace, hint ou mensagem crua de banco.

### Risco médio — admin front depende de RLS/policy correta

O front usa `AdminRoute`, `SuperAdminOnly` e consulta `admin_profiles`. Isso é adequado como UX, mas não pode ser a barreira final. A autoridade precisa estar nas policies RLS e nas Edge Functions.

Correção recomendada em próximo ciclo:

- versionar migration da policy de `admin_profiles`;
- auditar policies de `clients`, `licenses`, `license_devices`, `license_iptv_sources`, `license_channels_cache`, `app_installations`, `playback_sessions` e `audit_logs`;
- validar isolamento admin vs super_admin.

## Prioridade técnica do Ciclo 2

1. Criar helper server-authoritative de validação de licença/dispositivo/instalação.
2. Aplicar guard assíncrono nas rotas de conteúdo.
3. Centralizar limpeza de caches sensíveis em logout, falha 401/403 e troca de licença.
4. Sanitizar erros externos nas funções de conteúdo.
5. Iniciar CORS allowlist para funções sensíveis.
6. Preparar migration versionada para `admin_profiles` e policies sensíveis.

## Estado deste ciclo

```text
SECURITY_SCOPE_ABERTO=SIM
BRANCH_ISOLADA=SIM
BASE_MAIN_CONFIRMADA=SIM
CODIGO_FUNCIONAL_ALTERADO=NAO
INVENTARIO_INICIAL_VERSIONADO=SIM
PROXIMO_CICLO=PATCHES_MINIMOS_DE_GUARD_CACHE_EDGE
```
