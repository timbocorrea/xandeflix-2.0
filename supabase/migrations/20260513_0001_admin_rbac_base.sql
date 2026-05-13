-- Fase RBAC Admin/Super Admin — base de permissões e ownership
-- Objetivo:
-- - Diferenciar admin de super_admin no banco.
-- - Permitir ownership futuro de clientes/licenças por administrador.
-- - Manter compatibilidade inicial sem quebrar painel existente.

create or replace function public.current_admin_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role
  from public.admin_profiles
  where id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_admin_role() = 'super_admin', false);
$$;

alter table public.admin_profiles
add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.clients
add column if not exists admin_owner_id uuid references public.admin_profiles(id) on delete set null;

alter table public.licenses
add column if not exists admin_owner_id uuid references public.admin_profiles(id) on delete set null;

create index if not exists idx_admin_profiles_role on public.admin_profiles(role);
create index if not exists idx_admin_profiles_created_by on public.admin_profiles(created_by);
create index if not exists idx_clients_admin_owner_id on public.clients(admin_owner_id);
create index if not exists idx_licenses_admin_owner_id on public.licenses(admin_owner_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_profiles_role_check'
      and conrelid = 'public.admin_profiles'::regclass
  ) then
    alter table public.admin_profiles
    add constraint admin_profiles_role_check
    check (role in ('admin', 'super_admin'));
  end if;
end $$;
