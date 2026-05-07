# Fase 9 — Backend Administrativo Supabase

## Objetivo

Criar a base administrativa do Xandeflix 2.0 com Supabase, migrations versionadas, RLS, services TypeScript, rotas protegidas e telas administrativas básicas de consulta.

## Orientação operacional

Para continuidade do projeto:

- trabalhar por ciclos pequenos de ação corrigível;
- enviar comandos por bloco de ação, não respostas enormes;
- aguardar o retorno do terminal antes de avançar;
- analisar o retorno antes da próxima ação;
- não usar Python no terminal;
- considerar Git Bash no Windows;
- warnings LF/CRLF são esperados e não bloqueiam.

## Restrições da Fase 9

- Não alterar Player Universal nesta fase.
- Não alterar navegação Fire Stick nesta fase.
- Não expor `service_role` no frontend.
- Não criar CRUD completo ainda.
- Não implementar upload real de M3U ainda.
- Não implementar parser M3U ainda.
- Não integrar admin com catálogo/player ainda.

## Estrutura criada

### Tabelas

- `admin_profiles`
- `clients`
- `devices`
- `iptv_sources`
- `channels_cache`
- `audit_logs`

### Services

- `adminAccess.service.ts`
- `adminClients.service.ts`
- `adminDevices.service.ts`
- `adminIptvSources.service.ts`
- `adminChannelsCache.service.ts`
- `adminAuditLogs.service.ts`

### Páginas

- `AdminDashboardPage.tsx`
- `AdminClientsPage.tsx`
- `AdminDevicesPage.tsx`
- `AdminIptvSourcesPage.tsx`
- `AdminChannelsPage.tsx`
- `AdminAuditLogsPage.tsx`

### Rotas

- `/admin`
- `/admin/clients`
- `/admin/devices`
- `/admin/iptv-sources`
- `/admin/channels`
- `/admin/audit-logs`

Todas protegidas por `AdminRoute`.

## Estado atual

A base administrativa da Fase 9 está funcional como estrutura inicial de consulta.

Validado:

- rotas administrativas registradas;
- páginas administrativas criadas;
- menu do `AdminLayout` aponta para todas as rotas;
- `npm run build` aprovado;
- branch `feat/admin-supabase-backend` limpa e sincronizada.

O warning de chunks grandes do Vite permanece conhecido desde a Fase 8 e não bloqueia esta fase.

## Commits recentes relevantes

- `44bc103` — feat: adiciona pagina administrativa de dispositivos
- `529b93b` — feat: adiciona pagina administrativa de fontes iptv
- `f41979c` — feat: adiciona pagina administrativa de canais
- `bead049` — feat: adiciona pagina administrativa de auditoria

## Pendências para encerramento completo

- Validar login com usuário admin.
- Validar redirecionamento de usuário comum para `/`.
- Validar redirecionamento de usuário deslogado para `/login`.
- Documentar criação do primeiro admin no Supabase.
- Executar build final.
- Fazer commit final de documentação.

## Primeiro admin no Supabase

Usar o `id` real do usuário em `auth.users.id`:

```sql
insert into public.admin_profiles (
  id,
  email,
  role,
  is_active
)
values (
  'UUID_DO_USUARIO_AUTH',
  'email-do-admin@exemplo.com',
  'super_admin',
  true
);
```

## Validação manual concluída

Validações realizadas em ambiente local:

- Usuário comum autenticado tentando acessar `/admin` foi redirecionado para `/`.
- Migration administrativa foi aplicada com sucesso no Supabase remoto.
- Usuário `teste@xandeflix.com` foi promovido para `super_admin` em `public.admin_profiles`.
- Usuário admin conseguiu acessar `/admin`.
- Todas as telas administrativas abriram corretamente:
  - `/admin/clients`
  - `/admin/devices`
  - `/admin/iptv-sources`
  - `/admin/channels`
  - `/admin/audit-logs`
- Todas as telas exibiram estado vazio corretamente.
- Botão `Voltar ao catálogo` funcionou.
- Usuário deslogado tentando acessar `/admin` foi redirecionado para `/login`.

Com isso, a base administrativa de consulta da Fase 9 está validada.