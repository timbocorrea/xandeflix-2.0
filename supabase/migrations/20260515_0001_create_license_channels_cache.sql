-- Fase 4.10.2A - Cache de canais por licenca/fonte IPTV
-- Cria uma tabela nova para o modelo atual de licencas.
-- Nao altera channels_cache legado nem remove o trigger que bloqueia escritas nele.

create extension if not exists "pgcrypto";

create table if not exists public.license_channels_cache (
  id uuid primary key default gen_random_uuid(),

  license_id uuid not null references public.licenses(id) on delete cascade,
  license_iptv_source_id uuid not null references public.license_iptv_sources(id) on delete cascade,

  name text not null,
  stream_url text not null,
  logo_url text,
  group_title text,
  tvg_id text,

  sort_order integer not null default 0,
  is_active boolean not null default true,

  last_imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.license_channels_cache enable row level security;

comment on table public.license_channels_cache is
  'Cache de canais IPTV importados por licenca e fonte. Escrita prevista via Edge Function administrativa com Service Role.';

create index if not exists license_channels_cache_license_id_idx
  on public.license_channels_cache (license_id);

create index if not exists license_channels_cache_source_id_idx
  on public.license_channels_cache (license_iptv_source_id);

create index if not exists license_channels_cache_group_title_idx
  on public.license_channels_cache (group_title);

create index if not exists license_channels_cache_tvg_id_idx
  on public.license_channels_cache (tvg_id);

create unique index if not exists license_channels_cache_source_stream_url_uidx
  on public.license_channels_cache (license_iptv_source_id, stream_url);
