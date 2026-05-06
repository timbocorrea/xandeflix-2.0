-- Fase 9 — Backend Administrativo Supabase
-- Core administrativo inicial Xandeflix 2.0

create extension if not exists "pgcrypto";

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  status text not null default 'active',
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  device_name text,
  device_identifier text,
  platform text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.iptv_sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  name text not null,
  source_url text not null,
  type text not null default 'm3u',
  is_active boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channels_cache (
  id uuid primary key default gen_random_uuid(),
  iptv_source_id uuid not null references public.iptv_sources(id) on delete cascade,
  name text not null,
  logo_url text,
  group_title text,
  stream_url text not null,
  tvg_id text,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.devices enable row level security;
alter table public.iptv_sources enable row level security;
alter table public.channels_cache enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

create policy "Admins can manage admin profiles"
on public.admin_profiles
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage clients"
on public.clients
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage devices"
on public.devices
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage iptv sources"
on public.iptv_sources
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage channels cache"
on public.channels_cache
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can read audit logs"
on public.audit_logs
for select
using (public.is_admin());

create policy "Admins can insert audit logs"
on public.audit_logs
for insert
with check (public.is_admin());


create index if not exists idx_admin_profiles_email on public.admin_profiles(email);
create index if not exists idx_clients_status on public.clients(status);
create index if not exists idx_clients_email on public.clients(email);
create index if not exists idx_devices_client_id on public.devices(client_id);
create index if not exists idx_devices_identifier on public.devices(device_identifier);
create index if not exists idx_iptv_sources_client_id on public.iptv_sources(client_id);
create index if not exists idx_channels_cache_source_id on public.channels_cache(iptv_source_id);
create index if not exists idx_channels_cache_group_title on public.channels_cache(group_title);
create index if not exists idx_audit_logs_actor_id on public.audit_logs(actor_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);
