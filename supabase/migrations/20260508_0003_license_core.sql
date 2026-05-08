-- Fase 10.3 — Licenciamento anônimo Xandeflix
-- Licença = direito de uso
-- Dispositivo = aparelho autorizado
-- Sessão = tela reproduzindo agora

create extension if not exists "pgcrypto";

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_code text not null unique,
  label text,
  status text not null default 'active',
  plan_type text not null default 'monthly',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  max_devices integer not null default 1,
  max_concurrent_streams integer not null default 1,
  allow_user_manage_sources boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint licenses_status_check check (
    status in ('active', 'inactive', 'expired', 'blocked', 'canceled')
  ),
  constraint licenses_plan_type_check check (
    plan_type in ('monthly', 'quarterly', 'semiannual', 'annual')
  ),
  constraint licenses_max_devices_check check (max_devices >= 1),
  constraint licenses_max_concurrent_streams_check check (max_concurrent_streams >= 1)
);

create table if not exists public.license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_identifier text not null,
  device_name text,
  platform text,
  manufacturer text,
  model text,
  app_version text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint license_devices_unique_identifier_per_license unique (
    license_id,
    device_identifier
  )
);

create table if not exists public.license_iptv_sources (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  name text not null,
  source_url text not null,
  type text not null default 'm3u',
  is_active boolean not null default true,
  created_by text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint license_iptv_sources_type_check check (
    type in ('m3u', 'xtream', 'manual')
  ),
  constraint license_iptv_sources_created_by_check check (
    created_by in ('admin', 'user')
  )
);

create table if not exists public.playback_sessions (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  license_device_id uuid references public.license_devices(id) on delete set null,
  iptv_source_id uuid references public.license_iptv_sources(id) on delete set null,
  device_identifier text not null,
  channel_name text,
  stream_url text,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null default (now() + interval '3 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint playback_sessions_status_check check (
    status in ('active', 'ended', 'expired')
  )
);

alter table public.licenses enable row level security;
alter table public.license_devices enable row level security;
alter table public.license_iptv_sources enable row level security;
alter table public.playback_sessions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'licenses'
      and policyname = 'Admins can manage licenses'
  ) then
    create policy "Admins can manage licenses"
    on public.licenses
    for all
    using (public.is_admin())
    with check (public.is_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'license_devices'
      and policyname = 'Admins can manage license devices'
  ) then
    create policy "Admins can manage license devices"
    on public.license_devices
    for all
    using (public.is_admin())
    with check (public.is_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'license_iptv_sources'
      and policyname = 'Admins can manage license iptv sources'
  ) then
    create policy "Admins can manage license iptv sources"
    on public.license_iptv_sources
    for all
    using (public.is_admin())
    with check (public.is_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playback_sessions'
      and policyname = 'Admins can manage playback sessions'
  ) then
    create policy "Admins can manage playback sessions"
    on public.playback_sessions
    for all
    using (public.is_admin())
    with check (public.is_admin());
  end if;
end $$;

create index if not exists idx_licenses_code on public.licenses(license_code);
create index if not exists idx_licenses_status on public.licenses(status);
create index if not exists idx_licenses_expires_at on public.licenses(expires_at);

create index if not exists idx_license_devices_license_id on public.license_devices(license_id);
create index if not exists idx_license_devices_identifier on public.license_devices(device_identifier);
create index if not exists idx_license_devices_active on public.license_devices(is_active);

create index if not exists idx_license_iptv_sources_license_id on public.license_iptv_sources(license_id);
create index if not exists idx_license_iptv_sources_active on public.license_iptv_sources(is_active);

create index if not exists idx_playback_sessions_license_id on public.playback_sessions(license_id);
create index if not exists idx_playback_sessions_device_identifier on public.playback_sessions(device_identifier);
create index if not exists idx_playback_sessions_status on public.playback_sessions(status);
create index if not exists idx_playback_sessions_heartbeat on public.playback_sessions(last_heartbeat_at);
