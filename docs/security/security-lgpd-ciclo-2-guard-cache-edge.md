# Security LGPD Ciclo 2 - Guard, Cache e Edge

## Branch

`fix/security-lgpd-access-hardening`

## Objetivo

Implementar o primeiro hardening funcional de acesso LGPD para que rotas protegidas por licença não liberem conteúdo apenas pela existência de dados no `localStorage`. A ativação local continua existindo, mas passa a ser revalidada por uma Edge Function server-authoritative antes do conteúdo protegido.

## Arquivos alterados

- `src/app/routes.tsx`
- `src/app/providers/AuthProvider.tsx`
- `src/features/catalog/services/homeVod.service.ts`
- `src/features/licensing/services/licenseSessionValidation.service.ts`
- `supabase/functions/validate-license-session/index.ts`
- `docs/security/security-lgpd-ciclo-2-guard-cache-edge.md`

## Risco mitigado

- Reuso de ativação local inválida, expirada, bloqueada ou removida no servidor.
- Persistência de cache local de Home VOD após falha de validação server-authoritative.
- Exposição de dados de catálogo, canais ou URLs de reprodução durante validação de sessão.
- Retorno de detalhes internos, mensagens SQL ou stack traces na validação de licença.

## O que NÃO foi alterado

- Player e reprodução.
- Live TV.
- D-pad, navegação por controle remoto e preview inline.
- Fallback local-first.
- Layout global.
- Android.
- Importações, enriquecimento TMDB e legado.
- `package.json` e `package-lock.json`.

## Gates a executar

- `npm run governance:check`
- `npm run build`

## Próximos ciclos recomendados

- Sanitização de `details` nas Edge Functions sensíveis.
- CORS allowlist nas funções existentes.
- Policies/RLS versionadas.
- Rate limit e auditoria de chamadas sensíveis.
