-- Fase RBAC Backend Enforcement — policies ownership-aware
-- Objetivo:
-- - Super Admin acessa tudo.
-- - Admin comum acessa registros próprios por admin_owner_id.
-- - Registros legados sem owner continuam acessíveis nesta etapa para evitar quebra operacional.
-- - Auditoria passa a ser leitura exclusiva de Super Admin.

create or replace function public.is_admin_owner(owner_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    public.is_super_admin()
    or (
      public.is_admin()
      and (
        owner_id = auth.uid()
        or owner_id is null
      )
    ),
    false
  );
$$;

drop policy if exists "Admins can manage clients" on public.clients;

create policy "Admins can manage owned clients"
on public.clients
for all
using (public.is_admin_owner(admin_owner_id))
with check (public.is_admin_owner(admin_owner_id));

drop policy if exists "Admins can manage licenses" on public.licenses;

create policy "Admins can manage owned licenses"
on public.licenses
for all
using (public.is_admin_owner(admin_owner_id))
with check (public.is_admin_owner(admin_owner_id));

drop policy if exists "Admins can read audit logs" on public.audit_logs;

create policy "Super admins can read audit logs"
on public.audit_logs
for select
using (public.is_super_admin());

drop policy if exists "Admins can manage admin profiles" on public.admin_profiles;

create policy "Super admins can manage admin profiles"
on public.admin_profiles
for all
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Admins can read own admin profile" on public.admin_profiles;

create policy "Admins can read own admin profile"
on public.admin_profiles
for select
using (
  public.is_admin()
  and id = auth.uid()
);
