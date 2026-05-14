-- Fase App Installations — Registro técnico de instalações por heartbeat
-- Estratégia: não detectar desinstalação diretamente; usar last_seen_at/status operacional.

create table if not exists public.app_installations (
  id uuid primary key default gen_random_uuid(),

  device_identifier text not null,
  installation_status text not null default 'installed',

  platform text,
  manufacturer text,
  model text,
  app_version text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  activated_at timestamptz,
  pending_uninstall_at timestamptz,
  manually_marked_uninstalled_at timestamptz,

  linked_license_id uuid references public.licenses(id) on delete set null,
  linked_license_device_id uuid references public.license_devices(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_installations_device_identifier_unique unique (device_identifier),

  constraint app_installations_status_check check (
    installation_status in (
      'installed',
      'awaiting_activation',
      'activated',
      'inactive',
      'possibly_uninstalled',
      'pending_uninstall',
      'manually_marked_uninstalled',
      'blocked'
    )
  )
);

alter table public.app_installations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_installations'
      and policyname = 'Admins can manage app installations'
  ) then
    create policy "Admins can manage app installations"
    on public.app_installations
    for all
    using (public.is_admin())
    with check (public.is_admin());
  end if;
end $$;

create index if not exists idx_app_installations_device_identifier
  on public.app_installations(device_identifier);

create index if not exists idx_app_installations_status
  on public.app_installations(installation_status);

create index if not exists idx_app_installations_last_seen_at
  on public.app_installations(last_seen_at);

create index if not exists idx_app_installations_linked_license_id
  on public.app_installations(linked_license_id);

create index if not exists idx_app_installations_linked_license_device_id
  on public.app_installations(linked_license_device_id);
